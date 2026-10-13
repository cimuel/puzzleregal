-- Puzzleregal – Migration 0003 (Phase 3): Puzzles, Versuche, Ranglisten, Statistiken
-- Im Supabase SQL-Editor einmal ausführen (nach 0001 und 0002).

create extension if not exists pg_trgm with schema extensions;

-- ============================================================
-- 1. Eindeutigkeit für Veranstaltungen und Runden
-- ============================================================
create unique index events_name_year_key on public.events (lower(btrim(name)), year);
create unique index rounds_event_name_team_key on public.rounds (event_id, lower(btrim(name)), team_size);

-- ============================================================
-- 2. Schreibrechte verschärfen: Puzzles und Versuche nur über geprüfte Funktionen anlegen
-- ============================================================
drop policy puzzles_insert on public.puzzles;
drop policy attempts_insert on public.attempts;
drop policy attempt_participants_insert on public.attempt_participants;
drop policy attempt_participants_delete on public.attempt_participants;

revoke insert, update on public.puzzles from authenticated;
grant update (title, brand, product_no, piece_count, image_path, difficulty, notes) on public.puzzles to authenticated;

revoke insert, update, delete on public.attempts from authenticated;
grant update (solved_on, duration_seconds, kind, notes) on public.attempts to authenticated;
grant delete on public.attempts to authenticated;

revoke insert, update, delete on public.attempt_participants from authenticated;

-- Die Teilezahl darf sich nicht mehr ändern, sobald Zeiten erfasst sind (sonst stimmen alle Statistiken nicht mehr)
create function public.puzzles_guard_piece_count() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.piece_count <> old.piece_count
     and exists (select 1 from public.attempts where puzzle_id = old.id) then
    raise exception 'Die Teilezahl kann nicht mehr geändert werden, weil für dieses Puzzle schon Zeiten erfasst sind.';
  end if;
  return new;
end $$;
create trigger puzzles_piece_count_guard before update on public.puzzles
  for each row execute function public.puzzles_guard_piece_count();

-- ============================================================
-- 3. Veranstaltung/Runde finden oder anlegen und mit einem Puzzle verknüpfen (intern)
-- ============================================================
create function public._link_round(p_puzzle uuid, p_event_name text, p_event_year integer,
                                   p_round_name text, p_team_size smallint, p_results_url text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_name   text := nullif(btrim(p_event_name), '');
  v_rname  text := coalesce(nullif(btrim(p_round_name), ''), 'Allgemein');
  v_ts     smallint := coalesce(p_team_size, 1);
  v_url    text := nullif(btrim(p_results_url), '');
  v_event  uuid;
  v_round  public.rounds%rowtype;
  v_pieces integer;
begin
  if v_name is null then return null; end if;
  if p_event_year is null then raise exception 'Bitte das Veranstaltungsjahr angeben.'; end if;
  if v_url is not null and v_url !~* '^https?://' then
    raise exception 'Der Link zur Ergebnisliste muss mit http:// oder https:// beginnen.';
  end if;

  select piece_count into v_pieces from public.puzzles where id = p_puzzle;

  select id into v_event from public.events
   where lower(btrim(name)) = lower(v_name) and year = p_event_year;
  if v_event is null then
    insert into public.events (name, year) values (v_name, p_event_year) returning id into v_event;
  end if;

  select * into v_round from public.rounds
   where event_id = v_event and lower(btrim(name)) = lower(v_rname) and team_size = v_ts;
  if not found then
    insert into public.rounds (event_id, name, team_size, piece_count, results_url, puzzle_id)
    values (v_event, v_rname, v_ts, v_pieces, v_url, p_puzzle) returning * into v_round;
  else
    if v_round.puzzle_id is not null and v_round.puzzle_id <> p_puzzle then
      raise exception 'Diese Runde ist bereits mit einem anderen Puzzle verknüpft.';
    end if;
    if v_round.piece_count is not null and v_round.piece_count <> v_pieces then
      raise exception 'Die Teilezahl des Puzzles passt nicht zur Runde (%).', v_round.piece_count;
    end if;
    update public.rounds
       set puzzle_id = p_puzzle,
           piece_count = coalesce(piece_count, v_pieces),
           results_url = coalesce(results_url, v_url)
     where id = v_round.id;
  end if;
  return v_round.id;
end $$;

-- ============================================================
-- 4. Puzzle erfassen (Motiv + optional eigenes Exemplar + optional Veranstaltung)
-- ============================================================
create function public.add_puzzle(
  p_title text, p_brand text, p_product_no text, p_piece_count integer,
  p_image_path text default null, p_difficulty smallint default null, p_notes text default null,
  p_add_copy boolean default true,
  p_event_name text default null, p_event_year integer default null,
  p_round_name text default null, p_round_team_size smallint default null, p_results_url text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.is_approved() then raise exception 'Nicht berechtigt' using errcode = '42501'; end if;
  if nullif(btrim(p_title), '') is null then raise exception 'Bitte einen Titel angeben.'; end if;
  if p_piece_count is null or p_piece_count <= 0 then raise exception 'Die Teilezahl muss grösser als 0 sein.'; end if;
  if p_image_path is not null and p_image_path not like (auth.uid()::text || '/%') then
    raise exception 'Ungültiger Bildpfad.';
  end if;

  begin
    insert into public.puzzles (title, brand, product_no, piece_count, image_path, difficulty, notes, created_by)
    values (btrim(p_title), nullif(btrim(p_brand), ''), nullif(btrim(p_product_no), ''), p_piece_count,
            p_image_path, p_difficulty, nullif(btrim(p_notes), ''), auth.uid())
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Dieses Puzzle (gleiche Marke und Produktnummer) gibt es schon.';
  end;

  if p_add_copy then
    insert into public.copies (puzzle_id, owner_id) values (v_id, auth.uid());
  end if;
  perform public._link_round(v_id, p_event_name, p_event_year, p_round_name, p_round_team_size, p_results_url);
  return v_id;
end $$;

-- Bestehendes Puzzle nachträglich mit einer Veranstaltung verknüpfen
create function public.link_puzzle_to_round(
  p_puzzle uuid, p_event_name text, p_event_year integer,
  p_round_name text, p_round_team_size smallint, p_results_url text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_approved() then raise exception 'Nicht berechtigt' using errcode = '42501'; end if;
  if not (public.is_admin()
          or exists (select 1 from public.puzzles where id = p_puzzle and created_by = auth.uid())
          or exists (select 1 from public.copies where puzzle_id = p_puzzle and owner_id = auth.uid())) then
    raise exception 'Nicht berechtigt' using errcode = '42501';
  end if;
  if nullif(btrim(p_event_name), '') is null then raise exception 'Bitte den Namen der Meisterschaft angeben.'; end if;
  return public._link_round(p_puzzle, p_event_name, p_event_year, p_round_name, p_round_team_size, p_results_url);
end $$;

-- Doppelte vermeiden: ähnliche oder identische Puzzles finden
create function public.find_similar_puzzles(
  p_title text, p_brand text default null, p_product_no text default null, p_piece_count integer default null)
returns table (puzzle_id uuid, title text, brand text, product_no text, piece_count integer,
               image_path text, reason text, score real)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_brand text := lower(btrim(coalesce(p_brand, '')));
  v_no    text := lower(btrim(coalesce(p_product_no, '')));
begin
  if not public.is_approved() then raise exception 'Nicht berechtigt' using errcode = '42501'; end if;
  return query
  select * from (
    select p.id, p.title, p.brand, p.product_no, p.piece_count, p.image_path,
           case when v_brand <> '' and v_no <> ''
                     and lower(btrim(p.brand)) = v_brand and lower(btrim(p.product_no)) = v_no
                then 'same_product_no' else 'similar_title' end as reason,
           case when v_brand <> '' and v_no <> ''
                     and lower(btrim(p.brand)) = v_brand and lower(btrim(p.product_no)) = v_no
                then 1.0::real else extensions.similarity(p.title, coalesce(p_title, '')) end as score
    from public.puzzles p
  ) s
  where s.reason = 'same_product_no'
     or s.score >= case when s.piece_count = p_piece_count then 0.35 else 0.6 end
  order by s.score desc
  limit 5;
end $$;

-- ============================================================
-- 5. Versuch erfassen (mit allen Prüfungen, Teilnehmende gleich mit)
-- ============================================================
create function public.add_attempt(
  p_puzzle uuid, p_solved_on date, p_duration_seconds integer,
  p_kind public.attempt_kind default 'training', p_team_size smallint default 1,
  p_round uuid default null, p_notes text default null,
  p_participants uuid[] default null, p_copy uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_me    uuid := auth.uid();
  v_parts uuid[];
  v_id    uuid;
  v_round public.rounds%rowtype;
begin
  if not public.is_approved() then raise exception 'Nicht berechtigt' using errcode = '42501'; end if;
  if not exists (select 1 from public.puzzles where id = p_puzzle) then raise exception 'Puzzle nicht gefunden.'; end if;
  if p_duration_seconds is null or p_duration_seconds < 1 or p_duration_seconds > 172800 then
    raise exception 'Bitte eine gültige Lösungszeit angeben.';
  end if;
  if p_solved_on is null or p_solved_on > current_date + 1 then raise exception 'Das Datum liegt in der Zukunft.'; end if;
  if p_team_size is null or p_team_size < 1 or p_team_size > 10 then raise exception 'Ungültige Teamgrösse.'; end if;

  select array_agg(distinct x) into v_parts from unnest(coalesce(p_participants, array[v_me])) x;
  v_parts := coalesce(v_parts, array[v_me]);
  if not (v_me = any (v_parts)) then raise exception 'Du musst selbst zu den Teilnehmenden gehören.'; end if;
  if p_team_size = 1 and array_length(v_parts, 1) <> 1 then raise exception 'Ein Einzelversuch hat genau eine Person.'; end if;
  if array_length(v_parts, 1) > p_team_size then raise exception 'Es sind mehr Personen angegeben als die Teamgrösse.'; end if;
  if (select count(*) from public.profiles where id = any (v_parts) and status = 'approved') <> array_length(v_parts, 1) then
    raise exception 'Nicht alle Teilnehmenden sind freigegebene Mitglieder.';
  end if;
  if p_copy is not null and not exists (select 1 from public.copies where id = p_copy and puzzle_id = p_puzzle) then
    raise exception 'Das Exemplar gehört nicht zu diesem Puzzle.';
  end if;

  if p_round is not null then
    select * into v_round from public.rounds where id = p_round;
    if not found then raise exception 'Runde nicht gefunden.'; end if;
    if v_round.puzzle_id is distinct from p_puzzle then raise exception 'Diese Runde gehört nicht zu diesem Puzzle.'; end if;
    if v_round.team_size <> p_team_size then raise exception 'Die Teamgrösse passt nicht zur Runde.'; end if;
    if p_kind <> 'official' then raise exception 'Ein Versuch in einer Meisterschaftsrunde muss als offiziell erfasst werden.'; end if;
  end if;

  insert into public.attempts (puzzle_id, copy_id, solved_on, duration_seconds, kind, team_size, round_id, notes, created_by)
  values (p_puzzle, p_copy, p_solved_on, p_duration_seconds, p_kind, p_team_size, p_round, nullif(btrim(p_notes), ''), v_me)
  returning id into v_id;
  insert into public.attempt_participants (attempt_id, profile_id) select v_id, unnest(v_parts);
  return v_id;
end $$;

-- ============================================================
-- 6. Lesefunktionen: Übersichten, Ranglisten, Statistiken (nur für freigegebene Mitglieder)
-- ============================================================
create function public.puzzle_list()
returns table (puzzle_id uuid, title text, brand text, product_no text, piece_count integer, image_path text,
               difficulty smallint, copies_count integer, solvers_count integer, best_seconds integer)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.is_approved() then raise exception 'Nicht berechtigt' using errcode = '42501'; end if;
  return query
  select p.id, p.title, p.brand, p.product_no, p.piece_count, p.image_path, p.difficulty,
         (select count(*)::int from public.copies c where c.puzzle_id = p.id),
         (select count(distinct ap.profile_id)::int from public.attempts a
            join public.attempt_participants ap on ap.attempt_id = a.id where a.puzzle_id = p.id),
         (select min(a.duration_seconds)::int from public.attempts a where a.puzzle_id = p.id and a.team_size = 1)
  from public.puzzles p order by p.title;
end $$;

-- Rangliste der Einzelzeiten (Rang nach Wettkampfregel: gleiche Zeit = gleicher Rang, danach wird übersprungen)
create function public.puzzle_leaderboard(p_puzzle uuid, p_only_official boolean default false)
returns table (rank integer, profile_id uuid, display_name text, best_seconds integer,
               pieces_per_minute numeric, best_date date, attempts_count integer)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.is_approved() then raise exception 'Nicht berechtigt' using errcode = '42501'; end if;
  return query
  with solo as (
    select ap.profile_id, a.duration_seconds, a.solved_on
    from public.attempts a join public.attempt_participants ap on ap.attempt_id = a.id
    where a.puzzle_id = p_puzzle and a.team_size = 1 and (not p_only_official or a.kind = 'official')
  ), best as (
    select distinct on (s.profile_id) s.profile_id, s.duration_seconds as best_seconds, s.solved_on as best_date
    from solo s order by s.profile_id, s.duration_seconds, s.solved_on
  ), cnt as (select s.profile_id, count(*)::int as n from solo s group by s.profile_id)
  select (rank() over (order by b.best_seconds))::int, b.profile_id, pr.display_name, b.best_seconds,
         round(pz.piece_count / (b.best_seconds / 60.0), 2), b.best_date, c.n
  from best b
  join cnt c on c.profile_id = b.profile_id
  join public.profiles pr on pr.id = b.profile_id
  cross join (select z.piece_count from public.puzzles z where z.id = p_puzzle) pz
  order by 1, pr.display_name;
end $$;

-- Rangliste für Paare/Teams: pro Besetzung die beste Zeit
create function public.puzzle_team_leaderboard(p_puzzle uuid, p_team_size smallint, p_only_official boolean default false)
returns table (rank integer, team_names text, best_seconds integer, pieces_per_minute numeric,
               best_date date, attempts_count integer)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.is_approved() then raise exception 'Nicht berechtigt' using errcode = '42501'; end if;
  return query
  with t as (
    select a.duration_seconds, a.solved_on,
           (select array_agg(ap.profile_id order by ap.profile_id) from public.attempt_participants ap where ap.attempt_id = a.id) as members
    from public.attempts a
    where a.puzzle_id = p_puzzle and a.team_size = p_team_size and (not p_only_official or a.kind = 'official')
  ), best as (
    select distinct on (t.members) t.members, t.duration_seconds as best_seconds, t.solved_on as best_date
    from t order by t.members, t.duration_seconds, t.solved_on
  ), cnt as (select t.members, count(*)::int as n from t group by t.members)
  select (rank() over (order by b.best_seconds))::int,
         (select string_agg(pr.display_name, ', ' order by pr.display_name) from public.profiles pr where pr.id = any (b.members)),
         b.best_seconds,
         round(pz.piece_count / (b.best_seconds / 60.0), 2), b.best_date, c.n
  from best b join cnt c on c.members = b.members
  cross join (select z.piece_count from public.puzzles z where z.id = p_puzzle) pz
  order by 1, 2;
end $$;

create function public.puzzle_attempts(p_puzzle uuid)
returns table (attempt_id uuid, solved_on date, duration_seconds integer, kind public.attempt_kind,
               team_size smallint, participant_names text, participant_ids uuid[], created_by uuid,
               notes text, round_id uuid)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.is_approved() then raise exception 'Nicht berechtigt' using errcode = '42501'; end if;
  return query
  select a.id, a.solved_on, a.duration_seconds, a.kind, a.team_size,
         (select string_agg(pr.display_name, ', ' order by pr.display_name)
            from public.attempt_participants ap join public.profiles pr on pr.id = ap.profile_id where ap.attempt_id = a.id),
         (select array_agg(ap.profile_id) from public.attempt_participants ap where ap.attempt_id = a.id),
         a.created_by, a.notes, a.round_id
  from public.attempts a where a.puzzle_id = p_puzzle
  order by a.solved_on desc, a.created_at desc;
end $$;

-- Gemeinsame Versuchsauswahl einer Person. Bereich: 'solo' (Einzel), 'team' (Paar/Team), 'all'
create function public.player_summary(p_profile uuid, p_scope text default 'solo')
returns table (attempts_count integer, distinct_puzzles integer, avg_seconds integer, avg_pieces integer,
               total_pieces bigint, total_seconds bigint, avg_speed_ppm numeric, best_attempt_ppm numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.is_approved() then raise exception 'Nicht berechtigt' using errcode = '42501'; end if;
  if p_scope not in ('solo', 'team', 'all') then raise exception 'Ungültiger Bereich.'; end if;
  return query
  select count(*)::int, count(distinct a.puzzle_id)::int,
         round(avg(a.duration_seconds))::int, round(avg(z.piece_count))::int,
         sum(z.piece_count)::bigint, sum(a.duration_seconds)::bigint,
         -- gewichtet: Summe Teile / Summe Minuten (nicht der Mittelwert einzelner Geschwindigkeiten)
         round(sum(z.piece_count) / (sum(a.duration_seconds) / 60.0), 2),
         round(max(z.piece_count / (a.duration_seconds / 60.0)), 2)
  from public.attempts a
  join public.attempt_participants ap on ap.attempt_id = a.id and ap.profile_id = p_profile
  join public.puzzles z on z.id = a.puzzle_id
  where p_scope = 'all' or (p_scope = 'solo' and a.team_size = 1) or (p_scope = 'team' and a.team_size > 1);
end $$;

create function public.player_puzzle_bests(p_profile uuid, p_scope text default 'solo')
returns table (puzzle_id uuid, title text, brand text, piece_count integer, image_path text,
               best_seconds integer, best_date date, attempts_count integer, best_ppm numeric,
               rank integer, members_count integer, fastest_seconds integer)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.is_approved() then raise exception 'Nicht berechtigt' using errcode = '42501'; end if;
  if p_scope not in ('solo', 'team', 'all') then raise exception 'Ungültiger Bereich.'; end if;
  return query
  with mine as (
    select a.puzzle_id, a.duration_seconds, a.solved_on
    from public.attempts a join public.attempt_participants ap on ap.attempt_id = a.id and ap.profile_id = p_profile
    where p_scope = 'all' or (p_scope = 'solo' and a.team_size = 1) or (p_scope = 'team' and a.team_size > 1)
  ), best as (
    select distinct on (m.puzzle_id) m.puzzle_id, m.duration_seconds, m.solved_on
    from mine m order by m.puzzle_id, m.duration_seconds, m.solved_on
  ), cnt as (select m.puzzle_id, count(*)::int as n from mine m group by m.puzzle_id),
  solo_best as (
    select ap.profile_id, a.puzzle_id, min(a.duration_seconds) as s
    from public.attempts a join public.attempt_participants ap on ap.attempt_id = a.id
    where a.team_size = 1 group by ap.profile_id, a.puzzle_id
  )
  select b.puzzle_id, p.title, p.brand, p.piece_count, p.image_path, b.duration_seconds, b.solved_on, c.n,
         round(p.piece_count / (b.duration_seconds / 60.0), 2),
         case when p_scope = 'solo' then (select 1 + count(*) from solo_best o where o.puzzle_id = b.puzzle_id and o.s < b.duration_seconds)::int end,
         case when p_scope = 'solo' then (select count(*) from solo_best o where o.puzzle_id = b.puzzle_id)::int end,
         case when p_scope = 'solo' then (select min(o.s) from solo_best o where o.puzzle_id = b.puzzle_id)::int end
  from best b join cnt c on c.puzzle_id = b.puzzle_id join public.puzzles p on p.id = b.puzzle_id
  order by p.title;
end $$;

create function public.player_attempts(p_profile uuid, p_scope text default 'solo')
returns table (attempt_id uuid, solved_on date, duration_seconds integer, piece_count integer,
               puzzle_id uuid, title text, kind public.attempt_kind, team_size smallint, ppm numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.is_approved() then raise exception 'Nicht berechtigt' using errcode = '42501'; end if;
  if p_scope not in ('solo', 'team', 'all') then raise exception 'Ungültiger Bereich.'; end if;
  return query
  select a.id, a.solved_on, a.duration_seconds, z.piece_count, a.puzzle_id, z.title, a.kind, a.team_size,
         round(z.piece_count / (a.duration_seconds / 60.0), 2)
  from public.attempts a
  join public.attempt_participants ap on ap.attempt_id = a.id and ap.profile_id = p_profile
  join public.puzzles z on z.id = a.puzzle_id
  where p_scope = 'all' or (p_scope = 'solo' and a.team_size = 1) or (p_scope = 'team' and a.team_size > 1)
  order by a.solved_on, a.created_at;
end $$;

-- Regal einer Person: besessene und aktuell ausgeliehene Exemplare
create function public.shelf_items(p_profile uuid)
returns table (copy_id uuid, puzzle_id uuid, title text, brand text, product_no text, piece_count integer,
               image_path text, owner_id uuid, owner_name text, holder_id uuid, holder_name text,
               is_on_loan boolean, is_lendable boolean, best_seconds integer, attempts_count integer)
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
           where a.puzzle_id = c.puzzle_id and a.team_size = 1 and ap.profile_id = p_profile)
  from public.copies c
  join public.puzzles p on p.id = c.puzzle_id
  join public.profiles o on o.id = c.owner_id
  join public.copy_current_state s on s.copy_id = c.id
  join public.profiles h on h.id = s.holder_id
  where c.owner_id = p_profile or s.holder_id = p_profile
  order by p.piece_count, p.title;
end $$;

create function public.member_overview()
returns table (profile_id uuid, display_name text, copies_owned integer, copies_held integer,
               solved_puzzles integer, attempts_count integer)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.is_approved() then raise exception 'Nicht berechtigt' using errcode = '42501'; end if;
  return query
  select pr.id, pr.display_name,
         (select count(*)::int from public.copies c where c.owner_id = pr.id),
         (select count(*)::int from public.copy_current_state s where s.holder_id = pr.id),
         (select count(distinct a.puzzle_id)::int from public.attempts a
            join public.attempt_participants ap on ap.attempt_id = a.id where ap.profile_id = pr.id and a.team_size = 1),
         (select count(*)::int from public.attempts a
            join public.attempt_participants ap on ap.attempt_id = a.id where ap.profile_id = pr.id and a.team_size = 1)
  from public.profiles pr where pr.status = 'approved' order by pr.display_name;
end $$;

-- ============================================================
-- 7. Ausführungsrechte
-- ============================================================
grant execute on function
  public.add_puzzle(text, text, text, integer, text, smallint, text, boolean, text, integer, text, smallint, text),
  public.link_puzzle_to_round(uuid, text, integer, text, smallint, text),
  public.find_similar_puzzles(text, text, text, integer),
  public.add_attempt(uuid, date, integer, public.attempt_kind, smallint, uuid, text, uuid[], uuid),
  public.puzzle_list(),
  public.puzzle_leaderboard(uuid, boolean),
  public.puzzle_team_leaderboard(uuid, smallint, boolean),
  public.puzzle_attempts(uuid),
  public.player_summary(uuid, text),
  public.player_puzzle_bests(uuid, text),
  public.player_attempts(uuid, text),
  public.shelf_items(uuid),
  public.member_overview()
to authenticated;
