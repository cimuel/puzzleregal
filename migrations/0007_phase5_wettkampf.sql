-- Puzzleregal – Migration 0007 (Phase 5): Offizielle Resultate importieren, Rangschätzung
-- Im Supabase SQL-Editor einmal ausführen (nach 0001 bis 0006).

-- ============================================================
-- 1. Kleine Ergänzungen
-- ============================================================
-- Eigenes WJPC-Profil (Kürzel aus der Adresse, z. B. «corina-spreiter»): ordnet Resultate automatisch zu
alter table public.profiles
  add column wjpc_slug text check (wjpc_slug is null or wjpc_slug ~ '^[a-z0-9][a-z0-9-]{1,80}$');
create unique index profiles_wjpc_slug_key on public.profiles (wjpc_slug) where wjpc_slug is not null;
grant update (wjpc_slug) on public.profiles to authenticated;

-- Puzzle-Name, wie ihn die Ergebnisseite nennt (auch wenn noch kein Puzzle verknüpft ist)
alter table public.rounds add column puzzle_name_source text;

-- ============================================================
-- 2. Runde anlegen oder aktualisieren (nur Admin)
-- ============================================================
create function public.admin_ensure_round(
  p_event_name text, p_event_year integer, p_round_name text, p_team_size smallint,
  p_piece_count integer default null, p_time_limit_seconds integer default null,
  p_results_url text default null, p_puzzle uuid default null, p_puzzle_name_source text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_event uuid;
  v_round uuid;
  v_name  text := nullif(btrim(p_event_name), '');
  v_rname text := nullif(btrim(p_round_name), '');
  v_url   text := nullif(btrim(p_results_url), '');
  v_pz    public.puzzles%rowtype;
  v_pieces integer := p_piece_count;
begin
  if not public.is_admin() then raise exception 'Nicht berechtigt' using errcode = '42501'; end if;
  if v_name is null or v_rname is null then raise exception 'Bitte Meisterschaft und Runde angeben.'; end if;
  if p_event_year is null or p_event_year < 1990 or p_event_year > 2100 then raise exception 'Bitte ein gültiges Jahr angeben.'; end if;
  if p_team_size is null or p_team_size < 1 or p_team_size > 10 then raise exception 'Ungültige Wettkampfart.'; end if;
  if v_pieces is not null and v_pieces <= 0 then raise exception 'Die Teilezahl muss grösser als 0 sein.'; end if;
  if p_time_limit_seconds is not null and p_time_limit_seconds <= 0 then raise exception 'Das Zeitlimit muss grösser als 0 sein.'; end if;
  if v_url is not null and v_url !~* '^https?://' then raise exception 'Der Link muss mit http:// oder https:// beginnen.'; end if;
  if p_puzzle is not null then
    select * into v_pz from public.puzzles where id = p_puzzle;
    if not found then raise exception 'Puzzle nicht gefunden.'; end if;
    if v_pieces is null then v_pieces := v_pz.piece_count; end if;
    if v_pz.piece_count <> v_pieces then
      raise exception 'Die Teilezahl des Puzzles (%) passt nicht zur Runde (%).', v_pz.piece_count, v_pieces;
    end if;
  end if;

  select id into v_event from public.events where lower(btrim(name)) = lower(v_name) and year = p_event_year;
  if v_event is null then
    insert into public.events (name, year) values (v_name, p_event_year) returning id into v_event;
  end if;

  select id into v_round from public.rounds
   where event_id = v_event and lower(btrim(name)) = lower(v_rname) and team_size = p_team_size;
  if v_round is null then
    insert into public.rounds (event_id, name, team_size, piece_count, time_limit_seconds, results_url, puzzle_id, puzzle_name_source)
    values (v_event, v_rname, p_team_size, v_pieces, p_time_limit_seconds, v_url, p_puzzle, nullif(btrim(p_puzzle_name_source), ''))
    returning id into v_round;
  else
    update public.rounds set
      piece_count        = coalesce(v_pieces, piece_count),
      time_limit_seconds = coalesce(p_time_limit_seconds, time_limit_seconds),
      results_url        = coalesce(v_url, results_url),
      puzzle_id          = coalesce(p_puzzle, puzzle_id),
      puzzle_name_source = coalesce(nullif(btrim(p_puzzle_name_source), ''), puzzle_name_source)
    where id = v_round;
  end if;
  return v_round;
end $$;


-- Runde mit einem Puzzle verknüpfen oder die Verknüpfung lösen (nur Admin). Die Teilezahl muss zusammenpassen.
create function public.admin_set_round_puzzle(p_round uuid, p_puzzle uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_round public.rounds%rowtype; v_pieces integer;
begin
  if not public.is_admin() then raise exception 'Nicht berechtigt' using errcode = '42501'; end if;
  select * into v_round from public.rounds where id = p_round for update;
  if not found then raise exception 'Runde nicht gefunden.'; end if;
  if p_puzzle is not null then
    select piece_count into v_pieces from public.puzzles where id = p_puzzle;
    if not found then raise exception 'Puzzle nicht gefunden.'; end if;
    if v_round.piece_count is not null and v_round.piece_count <> v_pieces then
      raise exception 'Die Teilezahl des Puzzles (%) passt nicht zur Runde (%).', v_pieces, v_round.piece_count;
    end if;
    update public.rounds set puzzle_id = p_puzzle, piece_count = coalesce(piece_count, v_pieces) where id = p_round;
  else
    update public.rounds set puzzle_id = null where id = p_round;
  end if;
end $$;

-- ============================================================
-- 3. Resultate einer Runde importieren (ersetzt vorhandene Resultate dieser Runde, nur Admin)
--    Zeile: {rank, entry_name, country, status: finished|unfinished, finish_seconds, pieces_placed, members: [{name, slug}]}
-- ============================================================
create function public.import_round_results(p_round uuid, p_rows jsonb, p_source_url text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_row jsonb; v_idx bigint; v_member jsonb; v_result uuid;
  v_n integer := 0; v_m integer := 0; v_linked integer := 0;
  v_status public.result_status; v_rank integer; v_name text; v_mname text; v_slug text; v_profile uuid;
  v_url text := nullif(btrim(p_source_url), '');
begin
  if not public.is_admin() then raise exception 'Nicht berechtigt' using errcode = '42501'; end if;
  if not exists (select 1 from public.rounds where id = p_round) then raise exception 'Runde nicht gefunden.'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'Keine Resultate zum Importieren.'; end if;
  if jsonb_array_length(p_rows) > 2000 then raise exception 'Zu viele Zeilen (höchstens 2000).'; end if;
  if v_url is not null and v_url !~* '^https?://' then raise exception 'Der Link muss mit http:// oder https:// beginnen.'; end if;

  delete from public.official_results where round_id = p_round;

  for v_row, v_idx in select e.value, e.ordinality from jsonb_array_elements(p_rows) with ordinality as e loop
    begin
      v_rank   := (v_row ->> 'rank')::integer;
      v_status := (v_row ->> 'status')::public.result_status;
      v_name   := nullif(btrim(v_row ->> 'entry_name'), '');
      if v_name is null then raise exception 'Name fehlt'; end if;
      insert into public.official_results (round_id, rank, entry_name, country, status, finish_seconds, pieces_placed, source_url, fetched_at)
      values (p_round, v_rank, v_name, nullif(btrim(v_row ->> 'country'), ''), v_status,
              (v_row ->> 'finish_seconds')::integer, (v_row ->> 'pieces_placed')::integer, v_url, now())
      returning id into v_result;
    exception when others then
      raise exception 'Zeile %: ungültige Angaben (%).', v_idx, sqlerrm;
    end;
    v_n := v_n + 1;

    for v_member in select * from jsonb_array_elements(coalesce(v_row -> 'members', '[]'::jsonb)) loop
      v_mname := nullif(btrim(v_member ->> 'name'), '');
      v_slug  := lower(nullif(btrim(v_member ->> 'slug'), ''));
      continue when v_mname is null;
      v_profile := null;
      if v_slug is not null then
        select id into v_profile from public.profiles where wjpc_slug = v_slug and status = 'approved';
      end if;
      if v_profile is null then   -- nur bei genau einem Treffer über den vollen Namen zuordnen
        select case when count(*) = 1 then (array_agg(id))[1] end into v_profile
          from public.profiles where status = 'approved' and lower(btrim(display_name)) = lower(v_mname);
      end if;
      insert into public.official_result_members (result_id, member_name, wjpc_slug, profile_id)
      values (v_result, v_mname, v_slug, v_profile);
      v_m := v_m + 1;
      if v_profile is not null then v_linked := v_linked + 1; end if;
    end loop;
  end loop;
  return jsonb_build_object('imported', v_n, 'members', v_m, 'linked', v_linked);
end $$;

create function public.delete_round_results(p_round uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_n integer;
begin
  if not public.is_admin() then raise exception 'Nicht berechtigt' using errcode = '42501'; end if;
  delete from public.official_results where round_id = p_round;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- ============================================================
-- 4. Hypothetische Rangschätzung
--    Nur bei gleichem Puzzle (Runde muss mit dem Puzzle verknüpft sein), gleicher Wettkampfart (Einzel/Paar/Team),
--    gleicher Teilezahl und innerhalb des Zeitlimits. Sonst wird der Grund gemeldet, nicht geschätzt.
--    Rang = 1 + Anzahl offizieller Resultate mit kürzerer Zeit (gleiche Zeit teilt den Rang).
-- ============================================================
create function public.rank_estimates(p_puzzle uuid, p_seconds integer, p_team_size smallint default 1)
returns table (round_id uuid, event_name text, event_year integer, round_name text, round_team_size smallint,
               piece_count integer, time_limit_seconds integer, results_url text,
               eligible boolean, reason text, estimated_rank integer, finished_count integer, entries_count integer,
               faster_count integer, same_time_count integer, fetched_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare v_pieces integer;
begin
  if not public.is_approved() then raise exception 'Nicht berechtigt' using errcode = '42501'; end if;
  if p_seconds is null or p_seconds < 1 then raise exception 'Bitte eine gültige Zeit angeben.'; end if;
  select piece_count into v_pieces from public.puzzles where id = p_puzzle;
  if not found then raise exception 'Puzzle nicht gefunden.'; end if;
  return query
  select r.id, e.name, e.year, r.name, r.team_size, r.piece_count, r.time_limit_seconds, r.results_url,
         x.reason is null, x.reason,
         case when x.reason is null then 1 + s.faster end,
         s.finished, s.entries, s.faster, s.same, s.fetched
  from public.rounds r
  join public.events e on e.id = r.event_id
  cross join lateral (
    select count(*)::int as entries,
           (count(*) filter (where o.status = 'finished'))::int as finished,
           (count(*) filter (where o.status = 'finished' and o.finish_seconds < p_seconds))::int as faster,
           (count(*) filter (where o.status = 'finished' and o.finish_seconds = p_seconds))::int as same,
           max(o.fetched_at) as fetched
    from public.official_results o where o.round_id = r.id) s
  cross join lateral (
    select case
      when s.entries = 0 then 'no_results'
      when r.team_size <> p_team_size then 'different_format'
      when r.piece_count is not null and r.piece_count <> v_pieces then 'different_pieces'
      when r.time_limit_seconds is not null and p_seconds > r.time_limit_seconds then 'over_time_limit'
    end as reason) x
  where r.puzzle_id = p_puzzle
  order by e.year desc, e.name, r.name;
end $$;

-- ============================================================
-- 5. Lesefunktionen
-- ============================================================
create function public.rounds_overview()
returns table (round_id uuid, event_name text, event_year integer, round_name text, team_size smallint,
               piece_count integer, time_limit_seconds integer, results_url text, puzzle_id uuid, puzzle_title text,
               puzzle_name_source text, entries_count integer, linked_members integer, fetched_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.is_approved() then raise exception 'Nicht berechtigt' using errcode = '42501'; end if;
  return query
  select r.id, e.name, e.year, r.name, r.team_size, r.piece_count, r.time_limit_seconds, r.results_url,
         r.puzzle_id, p.title, r.puzzle_name_source,
         (select count(*)::int from public.official_results o where o.round_id = r.id),
         (select count(*)::int from public.official_result_members m join public.official_results o on o.id = m.result_id
           where o.round_id = r.id and m.profile_id is not null),
         (select max(o.fetched_at) from public.official_results o where o.round_id = r.id)
  from public.rounds r
  join public.events e on e.id = r.event_id
  left join public.puzzles p on p.id = r.puzzle_id
  order by e.year desc, e.name, r.name, r.team_size;
end $$;

create function public.player_official_results(p_profile uuid)
returns table (result_id uuid, round_id uuid, event_name text, event_year integer, round_name text,
               team_size smallint, entry_name text, rank integer, status public.result_status,
               finish_seconds integer, pieces_placed integer, piece_count integer, entries_count integer,
               puzzle_id uuid, puzzle_title text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.is_approved() then raise exception 'Nicht berechtigt' using errcode = '42501'; end if;
  return query
  select distinct o.id, ro.id, e.name, e.year, ro.name, ro.team_size, o.entry_name, o.rank, o.status,
         o.finish_seconds, o.pieces_placed, ro.piece_count,
         (select count(*)::int from public.official_results x where x.round_id = ro.id),
         ro.puzzle_id, p.title
  from public.official_result_members m
  join public.official_results o on o.id = m.result_id
  join public.rounds ro on ro.id = o.round_id
  join public.events e on e.id = ro.event_id
  left join public.puzzles p on p.id = ro.puzzle_id
  where m.profile_id = p_profile
  order by e.year desc, e.name, ro.name;
end $$;

grant execute on function
  public.admin_ensure_round(text, integer, text, smallint, integer, integer, text, uuid, text),
  public.admin_set_round_puzzle(uuid, uuid),
  public.import_round_results(uuid, jsonb, text),
  public.delete_round_results(uuid),
  public.rank_estimates(uuid, integer, smallint),
  public.rounds_overview(),
  public.player_official_results(uuid)
to authenticated;
