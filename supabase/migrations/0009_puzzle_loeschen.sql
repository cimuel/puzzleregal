-- Puzzleregal – Migration 0009: Puzzles löschen
-- Im Supabase SQL-Editor einmal ausführen (nach 0001 bis 0008), danach supabase/audit.sql.
--
-- Regeln:
--  * Löschen darf, wer das Puzzle erfasst hat, oder ein Admin.
--  * Ist das Puzzle mit einer Meisterschaftsrunde verknüpft, wird nicht gelöscht (sonst ginge die Rangschätzung verloren).
--  * Gibt es Ausleihen (auch abgeschlossene) oder hängen Exemplare oder Zeiten anderer Personen daran, kann nur ein Admin
--    löschen und muss das ausdrücklich bestätigen. Der Ausleihverlauf wird dann mitgelöscht.
--    Die betroffenen Besitzerinnen und Besitzer erhalten eine Mitteilung.

-- Was würde gelöscht, und was verhindert es? (nur lesend)
create function public.puzzle_delete_info(p_puzzle uuid)
returns table (can_delete boolean, needs_admin_force boolean, block_reason text,
               copies_count integer, other_copies_count integer, attempts_count integer, other_attempts_count integer,
               loans_count integer, rounds_count integer, title text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_me uuid := auth.uid();
  v_pz public.puzzles%rowtype;
  v_copies integer; v_other_copies integer; v_att integer; v_other_att integer; v_loans integer; v_rounds integer;
  v_reason text;
begin
  if not public.is_approved() then raise exception 'Nicht berechtigt' using errcode = '42501'; end if;
  select * into v_pz from public.puzzles where id = p_puzzle;
  if not found then raise exception 'Puzzle nicht gefunden.'; end if;

  select count(*)::int, (count(*) filter (where c.owner_id <> v_me))::int into v_copies, v_other_copies
    from public.copies c where c.puzzle_id = p_puzzle;
  select count(*)::int,
         (count(*) filter (where a.created_by <> v_me
                           or exists (select 1 from public.attempt_participants ap where ap.attempt_id = a.id and ap.profile_id <> v_me)))::int
    into v_att, v_other_att from public.attempts a where a.puzzle_id = p_puzzle;
  select count(*)::int into v_loans from public.loans l join public.copies c on c.id = l.copy_id where c.puzzle_id = p_puzzle;
  select count(*)::int into v_rounds from public.rounds r where r.puzzle_id = p_puzzle;

  v_reason := case
    when not (v_pz.created_by = v_me or public.is_admin()) then 'not_allowed'
    when v_rounds > 0 then 'has_rounds'
    when v_loans > 0 and not public.is_admin() then 'has_loans'
    when (v_other_copies > 0 or v_other_att > 0) and not public.is_admin() then 'foreign_data'
  end;
  return query select v_reason is null,
                      (v_reason is null and (v_other_copies > 0 or v_other_att > 0 or v_loans > 0)),
                      v_reason, v_copies, v_other_copies, v_att, v_other_att, v_loans, v_rounds, v_pz.title;
end $$;

-- Löschen. Gibt den Foto-Pfad zurück, damit die App die Bilddatei entfernen kann.
create function public.delete_puzzle(p_puzzle uuid, p_with_foreign_data boolean default false) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  v_pz public.puzzles%rowtype;
  v_info record;
  v_owner uuid;
begin
  if not public.is_approved() then raise exception 'Nicht berechtigt' using errcode = '42501'; end if;
  select * into v_pz from public.puzzles where id = p_puzzle for update;
  if not found then raise exception 'Puzzle nicht gefunden.'; end if;
  if not (v_pz.created_by = v_me or public.is_admin()) then raise exception 'Nicht berechtigt' using errcode = '42501'; end if;

  select * into v_info from public.puzzle_delete_info(p_puzzle);
  if v_info.block_reason = 'has_loans' then
    raise exception 'Für dieses Puzzle gibt es Ausleihen (auch abgeschlossene). Nur ein Admin kann es mit diesem Verlauf löschen.';
  elsif v_info.block_reason = 'has_rounds' then
    raise exception 'Das Puzzle ist mit einer Meisterschaftsrunde verknüpft. Löse zuerst die Verknüpfung auf der Rundenseite.';
  elsif v_info.block_reason = 'foreign_data' then
    raise exception 'Es hängen Exemplare oder Zeiten anderer Personen daran. Nur ein Admin kann das Puzzle mit diesen Daten löschen.';
  end if;
  if v_info.needs_admin_force and not p_with_foreign_data then
    raise exception 'Es hängen Exemplare, Zeiten oder Ausleihen daran. Bitte ausdrücklich bestätigen, dass sie mitgelöscht werden.';
  end if;

  -- Betroffene benachrichtigen: Besitzerinnen und Besitzer der Exemplare und Personen mit laufender Ausleihe (nicht sich selbst)
  for v_owner in
    select distinct u.id from (
      select c.owner_id as id from public.copies c where c.puzzle_id = p_puzzle
      union
      select l.borrower_id from public.loans l join public.copies c on c.id = l.copy_id
       where c.puzzle_id = p_puzzle and l.status in ('requested', 'accepted', 'lent', 'return_requested')
    ) u where u.id <> v_me
  loop
    perform public._notify(v_owner, 'puzzle_deleted',
      jsonb_build_object('page', 'shelf', 'puzzle_title', v_pz.title,
                         'from_name', (select display_name from public.profiles where id = v_me)));
  end loop;

  delete from public.loans where copy_id in (select id from public.copies where puzzle_id = p_puzzle);   -- nur Admin (siehe oben)
  delete from public.attempts where puzzle_id = p_puzzle;      -- Teilnehmende werden mitgelöscht
  delete from public.copies where puzzle_id = p_puzzle;        -- Eigentumsverlauf wird mitgelöscht
  delete from public.puzzles where id = p_puzzle;
  return v_pz.image_path;
end $$;

grant execute on function public.puzzle_delete_info(uuid), public.delete_puzzle(uuid, boolean) to authenticated;
