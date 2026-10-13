-- Puzzleregal – Migration 0004 (Phase 4): Ausleihsystem, Eigentumswechsel, Mitteilungen
-- Im Supabase SQL-Editor einmal ausführen (nach 0001 bis 0003).

-- ============================================================
-- 1. Standort neu definieren: Das Puzzle wechselt erst nach bestätigter Übergabe ins Regal der ausleihenden Person.
--    «angenommen» reserviert das Exemplar nur (es bleibt beim Eigentümer).
-- ============================================================
create or replace view public.copy_current_state as
select c.id as copy_id,
       c.puzzle_id,
       c.owner_id,
       case when l.status in ('lent', 'return_requested') then l.borrower_id else c.owner_id end as holder_id,
       coalesce(l.status in ('lent', 'return_requested'), false) as is_on_loan,
       l.status as loan_status,
       coalesce(l.status = 'accepted', false) as is_reserved
from public.copies c
left join public.loans l
  on l.copy_id = c.id and l.status in ('accepted', 'lent', 'return_requested')
where public.is_approved();

-- Regalfunktion um «reserviert» erweitern (Rückgabetyp ändert sich, darum neu anlegen)
drop function public.shelf_items(uuid);
create function public.shelf_items(p_profile uuid)
returns table (copy_id uuid, puzzle_id uuid, title text, brand text, product_no text, piece_count integer,
               image_path text, owner_id uuid, owner_name text, holder_id uuid, holder_name text,
               is_on_loan boolean, is_lendable boolean, best_seconds integer, attempts_count integer,
               is_reserved boolean)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.is_approved() then raise exception 'Nicht berechtigt' using errcode = '42501'; end if;
  return query
  select c.id, c.puzzle_id, p.title, p.brand, p.product_no, p.piece_count, p.image_path,
         c.owner_id, o.display_name, s.holder_id, h.display_name, s.is_on_loan, c.is_lendable,
         (select min(a.duration_seconds)::int from public.attempts a
            join public.attempt_participants ap on ap.attempt_id = a.id
           where a.puzzle_id = c.puzzle_id and a.team_size = 1 and ap.profile_id = p_profile),
         (select count(*)::int from public.attempts a
            join public.attempt_participants ap on ap.attempt_id = a.id
           where a.puzzle_id = c.puzzle_id and a.team_size = 1 and ap.profile_id = p_profile),
         s.is_reserved
  from public.copies c
  join public.puzzles p on p.id = c.puzzle_id
  join public.profiles o on o.id = c.owner_id
  join public.copy_current_state s on s.copy_id = c.id
  join public.profiles h on h.id = s.holder_id
  where c.owner_id = p_profile or s.holder_id = p_profile
  order by p.piece_count, p.title;
end $$;
grant execute on function public.shelf_items(uuid) to authenticated;

-- ============================================================
-- 2. Eigentumsverlauf: bestehende Exemplare nachtragen, neue automatisch erfassen
-- ============================================================
insert into public.ownership_history (copy_id, from_owner_id, to_owner_id, changed_by)
select c.id, null, c.owner_id, c.owner_id from public.copies c
where not exists (select 1 from public.ownership_history h where h.copy_id = c.id);

create function public.copies_log_creation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.ownership_history (copy_id, from_owner_id, to_owner_id, changed_by)
  values (new.id, null, new.owner_id, auth.uid());
  return new;
end $$;
create trigger copies_log_creation after insert on public.copies
  for each row execute function public.copies_log_creation();

-- ============================================================
-- 3. Mitteilung an eine Person (intern, nicht für den Browser)
-- ============================================================
create function public._notify(p_user uuid, p_type text, p_payload jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, type, payload) values (p_user, p_type, p_payload);
$$;

-- Gemeinsamer Kontext einer Ausleihe als Textbausteine für Mitteilungen (intern)
create function public._loan_payload(p_loan uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'loan_id', l.id, 'copy_id', l.copy_id, 'puzzle_id', p.id, 'puzzle_title', p.title,
    'owner_name', o.display_name, 'borrower_name', b.display_name)
  from public.loans l
  join public.copies c on c.id = l.copy_id
  join public.puzzles p on p.id = c.puzzle_id
  join public.profiles o on o.id = c.owner_id
  join public.profiles b on b.id = l.borrower_id
  where l.id = p_loan;
$$;

-- ============================================================
-- 4. Ablauf der Ausleihe
--    angefragt -> angenommen -> ausgeliehen -> Rückgabe angefragt -> zurückgegeben
--    (abgelehnt / storniert als Seitenwege)
-- ============================================================
create function public.request_loan(p_copy uuid, p_message text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  v_copy public.copies%rowtype;
  v_id uuid;
  v_msg text := nullif(btrim(p_message), '');
begin
  if not public.is_approved() then raise exception 'Nicht berechtigt' using errcode = '42501'; end if;
  select * into v_copy from public.copies where id = p_copy;
  if not found then raise exception 'Exemplar nicht gefunden.'; end if;
  if v_copy.owner_id = v_me then raise exception 'Das ist dein eigenes Puzzle.'; end if;
  if not v_copy.is_lendable then raise exception 'Dieses Puzzle ist nicht zum Ausleihen freigegeben.'; end if;
  if v_msg is not null and char_length(v_msg) > 500 then raise exception 'Die Nachricht ist zu lang (höchstens 500 Zeichen).'; end if;
  if exists (select 1 from public.loans where copy_id = p_copy and borrower_id = v_me
             and status in ('requested', 'accepted', 'lent', 'return_requested')) then
    raise exception 'Du hast für dieses Puzzle schon eine offene Anfrage oder Ausleihe.';
  end if;
  insert into public.loans (copy_id, borrower_id, message) values (p_copy, v_me, v_msg) returning id into v_id;
  perform public._notify(v_copy.owner_id, 'loan_requested', public._loan_payload(v_id) || jsonb_build_object('message', v_msg, 'page', 'requests'));
  return v_id;
end $$;

create function public.respond_loan(p_loan uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  v_loan public.loans%rowtype;
  v_owner uuid;
begin
  if not public.is_approved() then raise exception 'Nicht berechtigt' using errcode = '42501'; end if;
  select * into v_loan from public.loans where id = p_loan for update;
  if not found then raise exception 'Anfrage nicht gefunden.'; end if;
  select owner_id into v_owner from public.copies where id = v_loan.copy_id;
  if not (v_owner = v_me or public.is_admin()) then raise exception 'Nicht berechtigt' using errcode = '42501'; end if;
  if v_loan.status <> 'requested' then raise exception 'Diese Anfrage ist nicht mehr offen.'; end if;
  if p_accept then
    if exists (select 1 from public.loans where copy_id = v_loan.copy_id and status in ('accepted', 'lent', 'return_requested')) then
      raise exception 'Dieses Puzzle ist schon vergeben. Lehne die Anfrage ab oder warte, bis es zurück ist.';
    end if;
    update public.loans set status = 'accepted', accepted_at = now() where id = p_loan;
    perform public._notify(v_loan.borrower_id, 'loan_accepted', public._loan_payload(p_loan) || '{"page":"mine"}'::jsonb);
  else
    update public.loans set status = 'declined' where id = p_loan;
    perform public._notify(v_loan.borrower_id, 'loan_declined', public._loan_payload(p_loan) || '{"page":"mine"}'::jsonb);
  end if;
end $$;

create function public.cancel_loan(p_loan uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  v_loan public.loans%rowtype;
  v_owner uuid;
begin
  if not public.is_approved() then raise exception 'Nicht berechtigt' using errcode = '42501'; end if;
  select * into v_loan from public.loans where id = p_loan for update;
  if not found then raise exception 'Ausleihe nicht gefunden.'; end if;
  select owner_id into v_owner from public.copies where id = v_loan.copy_id;
  if v_loan.status not in ('requested', 'accepted') then
    raise exception 'Nur Anfragen und angenommene Ausleihen vor der Übergabe lassen sich zurückziehen.';
  end if;
  if v_me = v_loan.borrower_id then
    update public.loans set status = 'cancelled' where id = p_loan;
    perform public._notify(v_owner, 'loan_cancelled', public._loan_payload(p_loan) || '{"page":"requests"}'::jsonb);
  elsif (v_me = v_owner or public.is_admin()) and v_loan.status = 'accepted' then
    update public.loans set status = 'cancelled' where id = p_loan;
    perform public._notify(v_loan.borrower_id, 'loan_cancelled', public._loan_payload(p_loan) || '{"page":"mine"}'::jsonb);
  else
    raise exception 'Nicht berechtigt' using errcode = '42501';
  end if;
end $$;

create function public.confirm_handover(p_loan uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_loan public.loans%rowtype;
  v_owner uuid;
begin
  if not public.is_approved() then raise exception 'Nicht berechtigt' using errcode = '42501'; end if;
  select * into v_loan from public.loans where id = p_loan for update;
  if not found then raise exception 'Ausleihe nicht gefunden.'; end if;
  select owner_id into v_owner from public.copies where id = v_loan.copy_id;
  if not (v_owner = auth.uid() or public.is_admin()) then raise exception 'Nicht berechtigt' using errcode = '42501'; end if;
  if v_loan.status <> 'accepted' then raise exception 'Die Übergabe kann nur bei einer angenommenen Ausleihe bestätigt werden.'; end if;
  update public.loans set status = 'lent', handed_over_at = now() where id = p_loan;
  perform public._notify(v_loan.borrower_id, 'loan_handed_over', public._loan_payload(p_loan) || '{"page":"mine"}'::jsonb);
end $$;

create function public.request_return(p_loan uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  v_loan public.loans%rowtype;
  v_owner uuid;
begin
  if not public.is_approved() then raise exception 'Nicht berechtigt' using errcode = '42501'; end if;
  select * into v_loan from public.loans where id = p_loan for update;
  if not found then raise exception 'Ausleihe nicht gefunden.'; end if;
  select owner_id into v_owner from public.copies where id = v_loan.copy_id;
  if v_loan.status <> 'lent' then raise exception 'Eine Rückgabe kann nur bei einem ausgeliehenen Puzzle angefragt werden.'; end if;
  if v_me = v_loan.borrower_id then
    perform public._notify(v_owner, 'loan_return_requested', public._loan_payload(p_loan) || '{"page":"requests"}'::jsonb);
  elsif v_me = v_owner or public.is_admin() then
    perform public._notify(v_loan.borrower_id, 'loan_return_requested', public._loan_payload(p_loan) || '{"page":"mine"}'::jsonb);
  else
    raise exception 'Nicht berechtigt' using errcode = '42501';
  end if;
  update public.loans set status = 'return_requested', return_requested_at = now() where id = p_loan;
end $$;

create function public.confirm_return(p_loan uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_loan public.loans%rowtype;
  v_owner uuid;
begin
  if not public.is_approved() then raise exception 'Nicht berechtigt' using errcode = '42501'; end if;
  select * into v_loan from public.loans where id = p_loan for update;
  if not found then raise exception 'Ausleihe nicht gefunden.'; end if;
  select owner_id into v_owner from public.copies where id = v_loan.copy_id;
  if not (v_owner = auth.uid() or public.is_admin()) then raise exception 'Nicht berechtigt' using errcode = '42501'; end if;
  if v_loan.status not in ('lent', 'return_requested') then raise exception 'Dieses Puzzle ist nicht ausgeliehen.'; end if;
  update public.loans set status = 'returned', returned_at = now() where id = p_loan;
  perform public._notify(v_loan.borrower_id, 'loan_returned', public._loan_payload(p_loan) || '{"page":"mine"}'::jsonb);
end $$;

-- ============================================================
-- 5. Eigentumswechsel (nur durch die Eigentümerin oder den Eigentümer, nie während einer Ausleihe)
-- ============================================================
create function public.transfer_copy(p_copy uuid, p_new_owner uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  v_copy public.copies%rowtype;
  v_title text;
begin
  if not public.is_approved() then raise exception 'Nicht berechtigt' using errcode = '42501'; end if;
  select * into v_copy from public.copies where id = p_copy for update;
  if not found then raise exception 'Exemplar nicht gefunden.'; end if;
  if not (v_copy.owner_id = v_me or public.is_admin()) then raise exception 'Nicht berechtigt' using errcode = '42501'; end if;
  if p_new_owner = v_copy.owner_id then raise exception 'Die Person besitzt das Puzzle schon.'; end if;
  if not exists (select 1 from public.profiles where id = p_new_owner and status = 'approved') then
    raise exception 'Die neue Besitzerin oder der neue Besitzer ist kein freigegebenes Mitglied.';
  end if;
  if exists (select 1 from public.loans where copy_id = p_copy and status in ('requested', 'accepted', 'lent', 'return_requested')) then
    raise exception 'Es gibt offene Anfragen oder eine laufende Ausleihe. Schliesse diese zuerst ab.';
  end if;
  update public.copies set owner_id = p_new_owner where id = p_copy;
  insert into public.ownership_history (copy_id, from_owner_id, to_owner_id, changed_by)
  values (p_copy, v_copy.owner_id, p_new_owner, v_me);
  select title into v_title from public.puzzles where id = v_copy.puzzle_id;
  perform public._notify(p_new_owner, 'copy_transferred',
    jsonb_build_object('page', 'shelf', 'copy_id', p_copy, 'puzzle_id', v_copy.puzzle_id, 'puzzle_title', v_title,
                       'from_name', (select display_name from public.profiles where id = v_copy.owner_id)));
end $$;

-- ============================================================
-- 6. Übersicht der Ausleihen (eigene; alle nur für Admins)
-- ============================================================
create function public.my_loans(p_all boolean default false)
returns table (loan_id uuid, copy_id uuid, puzzle_id uuid, title text, brand text, piece_count integer,
               image_path text, owner_id uuid, owner_name text, borrower_id uuid, borrower_name text,
               status public.loan_status, message text, requested_at timestamptz, accepted_at timestamptz,
               handed_over_at timestamptz, return_requested_at timestamptz, returned_at timestamptz,
               copy_busy boolean)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.is_approved() then raise exception 'Nicht berechtigt' using errcode = '42501'; end if;
  if p_all and not public.is_admin() then raise exception 'Nicht berechtigt' using errcode = '42501'; end if;
  return query
  select l.id, l.copy_id, p.id, p.title, p.brand, p.piece_count, p.image_path,
         c.owner_id, o.display_name, l.borrower_id, b.display_name,
         l.status, l.message, l.requested_at, l.accepted_at, l.handed_over_at, l.return_requested_at, l.returned_at,
         exists (select 1 from public.loans x where x.copy_id = l.copy_id and x.id <> l.id
                 and x.status in ('accepted', 'lent', 'return_requested'))
  from public.loans l
  join public.copies c on c.id = l.copy_id
  join public.puzzles p on p.id = c.puzzle_id
  join public.profiles o on o.id = c.owner_id
  join public.profiles b on b.id = l.borrower_id
  where p_all or l.borrower_id = auth.uid() or c.owner_id = auth.uid()
  order by l.requested_at desc;
end $$;

-- ============================================================
-- 7. Ausführungsrechte
-- ============================================================
grant execute on function
  public.request_loan(uuid, text),
  public.respond_loan(uuid, boolean),
  public.cancel_loan(uuid),
  public.confirm_handover(uuid),
  public.request_return(uuid),
  public.confirm_return(uuid),
  public.transfer_copy(uuid, uuid),
  public.my_loans(boolean)
to authenticated;
