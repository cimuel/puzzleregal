-- Puzzleregal – Migration 0005: Orte (zum Beispiel «Gästeregal»)
-- Ein Exemplar kann an einem Ort ausserhalb des eigenen Regals stehen. Dort ist es nicht ausleihbar.
-- Im Supabase SQL-Editor einmal ausführen (nach 0001 bis 0004).

-- ============================================================
-- 1. Orte und Zuordnung
-- ============================================================
create table public.places (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(btrim(name)) between 2 and 60),
  created_at timestamptz not null default now()
);
create unique index places_name_key on public.places (lower(btrim(name)));
insert into public.places (name) values ('Gästeregal');

alter table public.copies add column place_id uuid references public.places (id) on delete restrict;
create index copies_place_idx on public.copies (place_id) where place_id is not null;

alter table public.places enable row level security;
grant select, insert, update, delete on public.places to authenticated;
create policy places_select on public.places for select to authenticated using (public.is_approved());
create policy places_admin  on public.places for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- Schreibrechte auf Exemplaren richtig einschränken. Wichtig: Ein Verbot einzelner Spalten wirkt nicht, solange das
-- Recht auf der ganzen Tabelle besteht. Darum wird das Tabellenrecht entzogen und nur für erlaubte Spalten vergeben.
-- Besitzer (owner_id) und Ort (place_id) ändern sich nur noch über die Funktionen transfer_copy und set_copy_place.
revoke insert, update on public.copies from authenticated;
grant insert (puzzle_id, owner_id, is_lendable, note) on public.copies to authenticated;
grant update (is_lendable, note) on public.copies to authenticated;

-- ============================================================
-- 2. Exemplar an einen Ort stellen oder zurück ins eigene Regal
-- ============================================================
create function public.set_copy_place(p_copy uuid, p_place uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_copy public.copies%rowtype;
begin
  if not public.is_approved() then raise exception 'Nicht berechtigt' using errcode = '42501'; end if;
  select * into v_copy from public.copies where id = p_copy for update;
  if not found then raise exception 'Exemplar nicht gefunden.'; end if;
  if not (v_copy.owner_id = auth.uid() or public.is_admin()) then raise exception 'Nicht berechtigt' using errcode = '42501'; end if;
  if p_place is not null then
    if not exists (select 1 from public.places where id = p_place) then raise exception 'Ort nicht gefunden.'; end if;
    if exists (select 1 from public.loans where copy_id = p_copy and status in ('requested', 'accepted', 'lent', 'return_requested')) then
      raise exception 'Es gibt offene Anfragen oder eine laufende Ausleihe. Schliesse diese zuerst ab.';
    end if;
  end if;
  update public.copies set place_id = p_place where id = p_copy;
end $$;

-- Anfragen für ein Exemplar an einem Ort sind nicht möglich
create or replace function public.request_loan(p_copy uuid, p_message text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  v_copy public.copies%rowtype;
  v_id uuid;
  v_place text;
  v_msg text := nullif(btrim(p_message), '');
begin
  if not public.is_approved() then raise exception 'Nicht berechtigt' using errcode = '42501'; end if;
  select * into v_copy from public.copies where id = p_copy;
  if not found then raise exception 'Exemplar nicht gefunden.'; end if;
  if v_copy.owner_id = v_me then raise exception 'Das ist dein eigenes Puzzle.'; end if;
  if v_copy.place_id is not null then
    select name into v_place from public.places where id = v_copy.place_id;
    raise exception 'Dieses Puzzle steht gerade im «%» und kann nicht ausgeliehen werden.', v_place;
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

-- ============================================================
-- 3. Standortansicht und Regalfunktion um den Ort erweitern
-- ============================================================
create or replace view public.copy_current_state as
select c.id as copy_id,
       c.puzzle_id,
       c.owner_id,
       case when l.status in ('lent', 'return_requested') then l.borrower_id else c.owner_id end as holder_id,
       coalesce(l.status in ('lent', 'return_requested'), false) as is_on_loan,
       l.status as loan_status,
       coalesce(l.status = 'accepted', false) as is_reserved,
       c.place_id,
       pl.name as place_name
from public.copies c
left join public.loans l on l.copy_id = c.id and l.status in ('accepted', 'lent', 'return_requested')
left join public.places pl on pl.id = c.place_id
where public.is_approved();

drop function public.shelf_items(uuid);
create function public.shelf_items(p_profile uuid)
returns table (copy_id uuid, puzzle_id uuid, title text, brand text, product_no text, piece_count integer,
               image_path text, owner_id uuid, owner_name text, holder_id uuid, holder_name text,
               is_on_loan boolean, is_lendable boolean, best_seconds integer, attempts_count integer,
               is_reserved boolean, place_id uuid, place_name text)
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
         s.is_reserved, s.place_id, s.place_name
  from public.copies c
  join public.puzzles p on p.id = c.puzzle_id
  join public.profiles o on o.id = c.owner_id
  join public.copy_current_state s on s.copy_id = c.id
  join public.profiles h on h.id = s.holder_id
  where c.owner_id = p_profile or s.holder_id = p_profile
  order by p.piece_count, p.title;
end $$;

-- Was steht gerade an den Orten?
create function public.place_items()
returns table (place_id uuid, place_name text, copy_id uuid, puzzle_id uuid, title text, brand text,
               piece_count integer, image_path text, owner_id uuid, owner_name text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.is_approved() then raise exception 'Nicht berechtigt' using errcode = '42501'; end if;
  return query
  select pl.id, pl.name, c.id, p.id, p.title, p.brand, p.piece_count, p.image_path, c.owner_id, o.display_name
  from public.copies c
  join public.places pl on pl.id = c.place_id
  join public.puzzles p on p.id = c.puzzle_id
  join public.profiles o on o.id = c.owner_id
  order by pl.name, p.title;
end $$;

grant execute on function public.set_copy_place(uuid, uuid), public.shelf_items(uuid), public.place_items() to authenticated;
