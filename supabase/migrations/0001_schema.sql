-- Puzzleregal – Migration 0001: Grundstruktur, Berechtigungen, Registrierung
-- Wird im Supabase SQL-Editor ausgeführt. Mehrfaches Ausführen ist nicht vorgesehen.

-- ============================================================
-- 1. Typen
-- ============================================================
create type public.user_role     as enum ('member', 'admin');
create type public.user_status   as enum ('pending', 'approved', 'blocked');
create type public.loan_status   as enum ('requested', 'accepted', 'lent', 'return_requested', 'returned', 'declined', 'cancelled');
create type public.attempt_kind  as enum ('official', 'training');
create type public.result_status as enum ('finished', 'unfinished');

-- ============================================================
-- 2. Tabellen
-- ============================================================
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 60),
  role         public.user_role   not null default 'member',
  status       public.user_status not null default 'pending',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.invite_codes (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique check (code = lower(btrim(code)) and char_length(code) >= 8),
  note       text,
  max_uses   integer check (max_uses is null or max_uses > 0),
  uses       integer not null default 0,
  active     boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Motiv (Katalogeintrag): Zeiten und Ranglisten hängen daran
create table public.puzzles (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (char_length(btrim(title)) between 1 and 200),
  brand        text,
  product_no   text,
  piece_count  integer not null check (piece_count > 0),
  image_path   text,
  difficulty   smallint check (difficulty between 1 and 5),
  notes        text,
  created_by   uuid not null references public.profiles (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
-- Gleiche Marke + gleiche Produktnummer = gleiches Motiv
create unique index puzzles_brand_product_no_key
  on public.puzzles (lower(btrim(brand)), lower(btrim(product_no)))
  where brand is not null and product_no is not null;

-- Exemplar (physisches Puzzle): Eigentum und Ausleihe hängen daran
create table public.copies (
  id          uuid primary key default gen_random_uuid(),
  puzzle_id   uuid not null references public.puzzles (id) on delete restrict,
  owner_id    uuid not null references public.profiles (id),
  is_lendable boolean not null default true,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index copies_puzzle_idx on public.copies (puzzle_id);
create index copies_owner_idx  on public.copies (owner_id);

create table public.ownership_history (
  id            uuid primary key default gen_random_uuid(),
  copy_id       uuid not null references public.copies (id) on delete cascade,
  from_owner_id uuid references public.profiles (id),
  to_owner_id   uuid not null references public.profiles (id),
  changed_at    timestamptz not null default now(),
  changed_by    uuid references public.profiles (id)
);

create table public.loans (
  id             uuid primary key default gen_random_uuid(),
  copy_id        uuid not null references public.copies (id) on delete restrict,
  borrower_id    uuid not null references public.profiles (id),
  status         public.loan_status not null default 'requested',
  message        text,
  requested_at   timestamptz not null default now(),
  accepted_at    timestamptz,
  handed_over_at timestamptz,
  return_requested_at timestamptz,
  returned_at    timestamptz,
  updated_at     timestamptz not null default now()
);
create index loans_copy_idx     on public.loans (copy_id);
create index loans_borrower_idx on public.loans (borrower_id);
-- Ein Exemplar kann nie gleichzeitig an mehrere Personen vergeben sein
create unique index loans_one_active_per_copy
  on public.loans (copy_id) where status in ('accepted', 'lent', 'return_requested');
-- Dieselbe Person kann nicht doppelt anfragen
create unique index loans_one_open_request_per_person
  on public.loans (copy_id, borrower_id) where status = 'requested';

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  type       text not null,
  payload    jsonb not null default '{}'::jsonb,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

create table public.events (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  year       integer not null check (year between 1990 and 2100),
  location   text,
  source_url text,
  created_at timestamptz not null default now()
);

create table public.rounds (
  id                 uuid primary key default gen_random_uuid(),
  event_id           uuid not null references public.events (id) on delete cascade,
  name               text not null,
  team_size          smallint not null default 1 check (team_size between 1 and 10),
  piece_count        integer check (piece_count > 0),
  time_limit_seconds integer check (time_limit_seconds > 0),
  results_url        text,
  puzzle_id          uuid references public.puzzles (id) on delete set null, -- manuell gesetzt, WJPC nennt das Puzzle nicht
  created_at         timestamptz not null default now()
);
create index rounds_event_idx on public.rounds (event_id);

create table public.attempts (
  id               uuid primary key default gen_random_uuid(),
  puzzle_id        uuid not null references public.puzzles (id) on delete restrict,
  copy_id          uuid references public.copies (id) on delete set null,
  solved_on        date not null default current_date,
  duration_seconds integer not null check (duration_seconds between 1 and 172800),
  kind             public.attempt_kind not null default 'training',
  team_size        smallint not null default 1 check (team_size between 1 and 10),
  round_id         uuid references public.rounds (id) on delete set null,
  notes            text,
  created_by       uuid not null references public.profiles (id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index attempts_puzzle_idx on public.attempts (puzzle_id);

create table public.attempt_participants (
  attempt_id uuid not null references public.attempts (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  primary key (attempt_id, profile_id)
);
create index attempt_participants_profile_idx on public.attempt_participants (profile_id);

create table public.official_results (
  id               uuid primary key default gen_random_uuid(),
  round_id         uuid not null references public.rounds (id) on delete cascade,
  rank             integer not null check (rank > 0),
  entry_name       text not null,
  country          text,
  status           public.result_status not null,
  finish_seconds   integer check (finish_seconds > 0),
  pieces_placed    integer check (pieces_placed >= 0),
  source_url       text,
  fetched_at       timestamptz not null default now(),
  check ((status = 'finished' and finish_seconds is not null)
      or (status = 'unfinished' and finish_seconds is null))
);
create index official_results_round_idx on public.official_results (round_id, rank);

create table public.official_result_members (
  id          uuid primary key default gen_random_uuid(),
  result_id   uuid not null references public.official_results (id) on delete cascade,
  member_name text not null,
  wjpc_slug   text,
  profile_id  uuid references public.profiles (id) on delete set null
);
create index official_result_members_result_idx on public.official_result_members (result_id);

-- ============================================================
-- 3. updated_at automatisch pflegen
-- ============================================================
create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_updated before update on public.profiles for each row execute function public.set_updated_at();
create trigger puzzles_updated  before update on public.puzzles  for each row execute function public.set_updated_at();
create trigger copies_updated   before update on public.copies   for each row execute function public.set_updated_at();
create trigger loans_updated    before update on public.loans    for each row execute function public.set_updated_at();
create trigger attempts_updated before update on public.attempts for each row execute function public.set_updated_at();

-- ============================================================
-- 4. Hilfsfunktionen für Berechtigungen
-- ============================================================
create function public.is_approved() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'approved');
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p
                 where p.id = auth.uid() and p.status = 'approved' and p.role = 'admin');
$$;

-- ============================================================
-- 5. Registrierung: nur mit gültigem Einladungscode, danach «wartend»
-- ============================================================
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_code   text := lower(btrim(coalesce(new.raw_user_meta_data ->> 'invite_code', '')));
  v_name   text := btrim(coalesce(new.raw_user_meta_data ->> 'display_name', ''));
  v_invite public.invite_codes%rowtype;
begin
  if char_length(v_name) < 2 or char_length(v_name) > 60 then
    raise exception 'Ungültiger Anzeigename';
  end if;

  select * into v_invite from public.invite_codes where code = v_code and active for update;
  if not found or (v_invite.max_uses is not null and v_invite.uses >= v_invite.max_uses) then
    raise exception 'Einladungscode ungültig';
  end if;

  update public.invite_codes set uses = uses + 1 where id = v_invite.id;
  insert into public.profiles (id, display_name) values (new.id, v_name);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- ============================================================
-- 6. Admin-Funktionen (einziger Weg, Status und Rolle zu ändern)
-- ============================================================
create function public.admin_set_user_status(p_user uuid, p_status public.user_status) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Nicht berechtigt' using errcode = '42501'; end if;
  if p_user = auth.uid() then raise exception 'Den eigenen Status kann man nicht ändern'; end if;
  update public.profiles set status = p_status where id = p_user;
  if not found then raise exception 'Benutzer nicht gefunden'; end if;
end $$;

create function public.admin_set_user_role(p_user uuid, p_role public.user_role) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Nicht berechtigt' using errcode = '42501'; end if;
  if p_user = auth.uid() then raise exception 'Die eigene Rolle kann man nicht ändern'; end if;
  update public.profiles set role = p_role where id = p_user;
  if not found then raise exception 'Benutzer nicht gefunden'; end if;
end $$;

-- ============================================================
-- 7. Abgeleiteter Standort eines Exemplars (keine doppelte Datenhaltung)
-- ============================================================
create view public.copy_current_state as
select c.id as copy_id,
       c.puzzle_id,
       c.owner_id,
       coalesce(l.borrower_id, c.owner_id) as holder_id,
       l.id is not null as is_on_loan,
       l.status as loan_status
from public.copies c
left join public.loans l
  on l.copy_id = c.id and l.status in ('accepted', 'lent', 'return_requested')
where public.is_approved();

-- ============================================================
-- 8. Zugriffsrechte: zuerst alles entziehen, dann gezielt vergeben
-- ============================================================
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on functions from public, anon, authenticated;

grant usage on schema public to authenticated;
grant execute on function public.is_approved(), public.is_admin(),
                          public.admin_set_user_status(uuid, public.user_status),
                          public.admin_set_user_role(uuid, public.user_role) to authenticated;

grant select on public.profiles, public.puzzles, public.copies, public.ownership_history,
                public.loans, public.notifications, public.events, public.rounds,
                public.attempts, public.attempt_participants, public.official_results,
                public.official_result_members, public.invite_codes,
                public.copy_current_state to authenticated;
grant update (display_name) on public.profiles to authenticated;
grant insert, update, delete on public.puzzles to authenticated;
grant insert, update, delete on public.copies  to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant delete on public.notifications to authenticated;
grant insert, update, delete on public.attempts, public.attempt_participants to authenticated;
grant insert, update, delete on public.events, public.rounds, public.official_results,
                               public.official_result_members, public.invite_codes to authenticated;
-- Winzige öffentliche Funktion ohne Daten: Sie dient nur als Lebenszeichen für den
-- Keepalive-Aufruf (siehe README) und gibt die Serverzeit zurück. Tabellen bleiben für Anonyme gesperrt.
create function public.ping() returns timestamptz
language sql stable set search_path = '' as $$ select now() $$;
grant usage on schema public to anon;
grant execute on function public.ping() to anon, authenticated;
-- Spalten, die Mitglieder nicht selbst ändern dürfen (Eigentümerwechsel läuft später über Funktionen)
revoke update (owner_id) on public.copies from authenticated;

-- ============================================================
-- 9. Row Level Security
-- ============================================================
alter table public.profiles               enable row level security;
alter table public.invite_codes           enable row level security;
alter table public.puzzles                enable row level security;
alter table public.copies                 enable row level security;
alter table public.ownership_history      enable row level security;
alter table public.loans                  enable row level security;
alter table public.notifications          enable row level security;
alter table public.events                 enable row level security;
alter table public.rounds                 enable row level security;
alter table public.attempts               enable row level security;
alter table public.attempt_participants   enable row level security;
alter table public.official_results       enable row level security;
alter table public.official_result_members enable row level security;

-- profiles: Mitglieder sehen alle freigegebenen Profile, Wartende nur das eigene
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_approved());
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Einladungscodes: nur Admins
create policy invite_codes_admin on public.invite_codes for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- puzzles
create policy puzzles_select on public.puzzles for select to authenticated using (public.is_approved());
create policy puzzles_insert on public.puzzles for insert to authenticated
  with check (public.is_approved() and created_by = auth.uid());
create policy puzzles_update on public.puzzles for update to authenticated
  using (public.is_approved() and (created_by = auth.uid() or public.is_admin()))
  with check (public.is_approved() and (created_by = auth.uid() or public.is_admin()));
create policy puzzles_delete on public.puzzles for delete to authenticated using (public.is_admin());

-- copies: sichtbar für alle Mitglieder; erfassen nur für sich selbst (Admin für alle)
create policy copies_select on public.copies for select to authenticated using (public.is_approved());
create policy copies_insert on public.copies for insert to authenticated
  with check (public.is_approved() and (owner_id = auth.uid() or public.is_admin()));
create policy copies_update on public.copies for update to authenticated
  using (public.is_approved() and (owner_id = auth.uid() or public.is_admin()))
  with check (public.is_approved() and (owner_id = auth.uid() or public.is_admin()));
create policy copies_delete on public.copies for delete to authenticated
  using (public.is_approved() and (owner_id = auth.uid() or public.is_admin()));

-- ownership_history: nur lesen (Schreiben später über Funktionen)
create policy ownership_history_select on public.ownership_history for select to authenticated
  using (public.is_approved());

-- loans: nur Beteiligte und Admins; Schreiben später über Funktionen
create policy loans_select on public.loans for select to authenticated
  using (public.is_approved() and (
    borrower_id = auth.uid()
    or public.is_admin()
    or exists (select 1 from public.copies c where c.id = loans.copy_id and c.owner_id = auth.uid())));

-- notifications: nur eigene
create policy notifications_select on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_delete on public.notifications for delete to authenticated using (user_id = auth.uid());

-- Veranstaltungen und offizielle Resultate: lesen alle Mitglieder, schreiben nur Admins
create policy events_select  on public.events  for select to authenticated using (public.is_approved());
create policy events_admin   on public.events  for all    to authenticated using (public.is_admin()) with check (public.is_admin());
create policy rounds_select  on public.rounds  for select to authenticated using (public.is_approved());
create policy rounds_admin   on public.rounds  for all    to authenticated using (public.is_admin()) with check (public.is_admin());
create policy official_results_select on public.official_results for select to authenticated using (public.is_approved());
create policy official_results_admin  on public.official_results for all    to authenticated using (public.is_admin()) with check (public.is_admin());
create policy official_result_members_select on public.official_result_members for select to authenticated using (public.is_approved());
create policy official_result_members_admin  on public.official_result_members for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- attempts: lesen alle Mitglieder; ändern nur der Ersteller oder Admin
create policy attempts_select on public.attempts for select to authenticated using (public.is_approved());
create policy attempts_insert on public.attempts for insert to authenticated
  with check (public.is_approved() and created_by = auth.uid());
create policy attempts_update on public.attempts for update to authenticated
  using (public.is_approved() and (created_by = auth.uid() or public.is_admin()))
  with check (public.is_approved() and (created_by = auth.uid() or public.is_admin()));
create policy attempts_delete on public.attempts for delete to authenticated
  using (public.is_approved() and (created_by = auth.uid() or public.is_admin()));

-- Teilnehmende: Einzelversuche nur für sich selbst, Teamversuche darf der Ersteller mit anderen verknüpfen
create policy attempt_participants_select on public.attempt_participants for select to authenticated
  using (public.is_approved());
create policy attempt_participants_insert on public.attempt_participants for insert to authenticated
  with check (public.is_approved() and exists (
    select 1 from public.attempts a
    where a.id = attempt_id
      and (public.is_admin() or (a.created_by = auth.uid()
           and (profile_id = auth.uid() or a.team_size > 1)))));
create policy attempt_participants_delete on public.attempt_participants for delete to authenticated
  using (public.is_approved() and exists (
    select 1 from public.attempts a
    where a.id = attempt_id and (a.created_by = auth.uid() or public.is_admin())));
