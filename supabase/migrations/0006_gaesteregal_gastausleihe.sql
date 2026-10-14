-- Puzzleregal – Migration 0006: Gästeregal = Puzzles, die bei Gästen ohne Konto sind
-- Ersetzt das allgemeine Orte-Konzept aus 0005 (die Rechte-Korrektur aus 0005 bleibt bestehen).
-- Reihenfolge: 0005 (falls noch nicht ausgeführt), dann 0006. Einmal ausführen.

-- ============================================================
-- 1. Orte-Konzept entfernen
-- ============================================================
drop function public.shelf_items(uuid);
drop function public.place_items();
drop function public.set_copy_place(uuid, uuid);
drop view public.copy_current_state;

-- ============================================================
-- 2. Gast-Ausleihe: Name der Person (optional) und seit wann
-- ============================================================
alter table public.copies
  add column guest_name  text check (guest_name is null or char_length(guest_name) <= 60),
  add column guest_since timestamptz,
  add constraint copies_guest_consistent check (guest_name is null or guest_since is not null);
-- Schreibrechte: guest_* wird nicht freigegeben (nur über die Funktionen unten). Die Rechte auf copies sind spaltenweise vergeben.

-- Puzzles, die in 0005 schon an einen Ort gestellt wurden, bleiben nicht ausleihbar: neu «bei einem Gast», Name unbekannt
update public.copies set guest_since = now() where place_id is not null;
alter table public.copies drop column place_id;
drop table public.places;

-- ============================================================
-- 3. Standortansicht und Regalfunktion
-- ============================================================
create view public.copy_current_state as
select c.id as copy_id,
       c.puzzle_id,
       c.owner_id,
       case when l.status in ('lent', 'return_requested') then l.borrower_id else c.owner_id end as holder_id,
       coalesce(l.status in ('lent', 'return_requested'), false) as is_on_loan,
       l.status as loan_status,
       coalesce(l.status = 'accepted', false) as is_reserved,
       c.guest_since is not null as is_with_guest,
       c.guest_name,
       c.guest_since
from public.copies c
left join public.loans l on l.copy_id = c.id and l.status in ('accepted', 'lent', 'return_requested')
where public.is_approved();
grant select on public.copy_current_state to authenticated;

create function public.shelf_items(p_profile uuid)
returns table (copy_id uuid, puzzle_id uuid, title text, brand text, product_no text, piece_count integer,
               image_path text, owner_id uuid, owner_name text, holder_id uuid, holder_name text,
               is_on_loan boolean, is_lendable boolean, best_seconds integer, attempts_count integer,
               is_reserved boolean, is_with_guest boolean, guest_name text, guest_since timestamptz)
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
         s.is_reserved, s.is_with_guest, s.guest_name, s.guest_since
  from public.copies c
  join public.puzzles p on p.id = c.puzzle_id
  join public.profiles o on o.id = c.owner_id
  join public.copy_current_state s on s.copy_id = c.id
  join public.profiles h on h.id = s.holder_id
  where c.owner_id = p_profile or s.holder_id = p_profile
  order by p.piece_count, p.title;
end $$;

-- ============================================================
-- 4. An einen Gast ausleihen und zurückerhalten (nur Besitzerin/Besitzer oder Admin)
-- ============================================================
create function public.lend_to_guest(p_copy uuid, p_guest_name text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_copy public.copies%rowtype;
  v_name text := nullif(btrim(p_guest_name), '');
begin
  if not public.is_approved() then raise exception 'Nicht berechtigt' using errcode = '42501'; end if;
  select * into v_copy from public.copies where id = p_copy for update;
  if not found then raise exception 'Exemplar nicht gefunden.'; end if;
  if not (v_copy.owner_id = auth.uid() or public.is_admin()) then raise exception 'Nicht berechtigt' using errcode = '42501'; end if;
  if v_copy.guest_since is not null then raise exception 'Dieses Puzzle ist schon bei einem Gast.'; end if;
  if v_name is not null and char_length(v_name) > 60 then raise exception 'Der Name ist zu lang (höchstens 60 Zeichen).'; end if;
  if exists (select 1 from public.loans where copy_id = p_copy and status in ('requested', 'accepted', 'lent', 'return_requested')) then
    raise exception 'Es gibt offene Anfragen oder eine laufende Ausleihe. Schliesse diese zuerst ab.';
  end if;
  update public.copies set guest_name = v_name, guest_since = now() where id = p_copy;
end $$;

create function public.return_from_guest(p_copy uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_copy public.copies%rowtype;
begin
  if not public.is_approved() then raise exception 'Nicht berechtigt' using errcode = '42501'; end if;
  select * into v_copy from public.copies where id = p_copy for update;
  if not found then raise exception 'Exemplar nicht gefunden.'; end if;
  if not (v_copy.owner_id = auth.uid() or public.is_admin()) then raise exception 'Nicht berechtigt' using errcode = '42501'; end if;
  if v_copy.guest_since is null then raise exception 'Dieses Puzzle ist nicht bei einem Gast.'; end if;
  update public.copies set guest_name = null, guest_since = null where id = p_copy;
end $$;

-- Anfragen für ein Puzzle, das bei einem Gast ist, sind nicht möglich
create or replace function public.request_loan(p_copy uuid, p_message text default null) returns uuid
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
  if v_copy.guest_since is not null then
    raise exception 'Dieses Puzzle ist gerade bei einem Gast und kann nicht ausgeliehen werden.';
  end if;
  if not v_copy.is_lendable then raise exception 'Dieses Puzzle ist nicht zum Ausleihen freigegeben.'; end if;
  if v_msg is not null and char_length(v_msg) > 500 then raise exception 'Die Nachricht ist zu lang (höchstens 500 Zeichen).'; end if;
  if exists (select 1 from public.loans where copy_id = p_copy and borrower_id = v_me
             and status in ('requested', 'accepted', 'lent', 'return_requested')) then
    raise exception 'Du hast für dieses Puzzle schon eine offene Anfrage oder Ausleihe.';
  end if;
  insert into public.loans (copy_id, borrower_id, message) values (p_copy, v_me, v_msg) returning id into v_id;
  perform public._notify(v_copy.owner_id, 'loan_requested',
    public._loan_payload(v_id) || jsonb_build_object('message', v_msg, 'page', 'requests'));
  return v_id;
end $$;

-- Das Gästeregal: alle Puzzles, die gerade bei Gästen ohne Konto sind
create function public.guest_items()
returns table (copy_id uuid, puzzle_id uuid, title text, brand text, piece_count integer, image_path text,
               owner_id uuid, owner_name text, guest_name text, guest_since timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.is_approved() then raise exception 'Nicht berechtigt' using errcode = '42501'; end if;
  return query
  select c.id, p.id, p.title, p.brand, p.piece_count, p.image_path, c.owner_id, o.display_name, c.guest_name, c.guest_since
  from public.copies c
  join public.puzzles p on p.id = c.puzzle_id
  join public.profiles o on o.id = c.owner_id
  where c.guest_since is not null
  order by c.guest_since desc, p.title;
end $$;

grant execute on function public.lend_to_guest(uuid, text), public.return_from_guest(uuid),
  public.shelf_items(uuid), public.guest_items() to authenticated;
