-- Puzzleregal – Sicherheitsprüfung (nur lesend, ändert nichts)
-- Im Supabase SQL-Editor einfügen und ausführen. Erwartet: genau EINE Zeile mit «OK».
-- Jede andere Zeile ist ein Problem, das behoben werden muss. Schick sie mir, dann sage ich dir wie.

with
public_rels as (
  select c.oid, c.relname, c.relkind
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p')
),
public_funcs as (
  select p.oid, p.proname, p.prosecdef, p.proconfig
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f'
    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')   -- keine Erweiterungsfunktionen
),
problems as (
  -- 1. Jede Tabelle muss Zeilenregeln (RLS) haben
  select '1 Zeilenregeln fehlen' as pruefung, r.relname::text as detail
  from public_rels r where r.relkind in ('r', 'p') and not (select relrowsecurity from pg_class where oid = r.oid)

  union all
  -- 2. Nicht angemeldete Besucher (anon) dürfen auf keine Tabelle oder Ansicht zugreifen
  select '2 Besucher (anon) haben Zugriff auf Tabellen', r.relname::text
  from public_rels r
  where has_table_privilege('anon', r.oid, 'SELECT') or has_table_privilege('anon', r.oid, 'INSERT')
     or has_table_privilege('anon', r.oid, 'UPDATE') or has_table_privilege('anon', r.oid, 'DELETE')
     or has_any_column_privilege('anon', r.oid, 'SELECT') or has_any_column_privilege('anon', r.oid, 'INSERT')
     or has_any_column_privilege('anon', r.oid, 'UPDATE')

  union all
  -- 3. Besucher dürfen nur die Funktion ping() ausführen
  select '3 Besucher (anon) können Funktionen ausführen', f.proname::text
  from public_funcs f where has_function_privilege('anon', f.oid, 'EXECUTE') and f.proname <> 'ping'

  union all
  -- 4. Interne Hilfsfunktionen (Name beginnt mit _) darf kein Browser aufrufen
  select '4 Interne Funktion für Mitglieder aufrufbar', f.proname::text
  from public_funcs f where f.proname like '\_%' and has_function_privilege('authenticated', f.oid, 'EXECUTE')

  union all
  -- 5. Funktionen mit erhöhten Rechten müssen einen festen search_path haben
  select '5 Funktion ohne festen search_path', f.proname::text
  from public_funcs f
  where f.prosecdef and not exists (select 1 from unnest(coalesce(f.proconfig, '{}')) c where c like 'search_path=%')

  union all
  -- 6. Mitglieder dürfen diese Spalten nicht selbst ändern oder einfügen
  select '6 Mitglieder können sensible Spalte ändern', v.t || '.' || v.c || ' (' || v.priv || ')'
  from (values
    ('profiles','role','UPDATE'), ('profiles','status','UPDATE'), ('profiles','id','UPDATE'),
    ('copies','owner_id','UPDATE'), ('copies','guest_name','UPDATE'), ('copies','guest_since','UPDATE'), ('copies','puzzle_id','UPDATE'),
    ('puzzles','created_by','UPDATE'),
    ('attempts','team_size','UPDATE'), ('attempts','puzzle_id','UPDATE'), ('attempts','created_by','UPDATE'), ('attempts','round_id','UPDATE'),
    ('loans','status','UPDATE'), ('loans','borrower_id','UPDATE'), ('loans','copy_id','UPDATE'),
    ('notifications','payload','UPDATE'), ('notifications','user_id','UPDATE'),
    ('copies','guest_since','INSERT'), ('puzzles','created_by','INSERT'), ('loans','status','INSERT'),
    ('attempts','duration_seconds','INSERT'), ('profiles','role','INSERT'), ('ownership_history','to_owner_id','INSERT'),
    ('attempt_participants','profile_id','INSERT'), ('notifications','user_id','INSERT')
  ) as v(t, c, priv)
  where has_column_privilege('authenticated', ('public.' || v.t)::regclass, v.c, v.priv)

  union all
  -- 7. Policies, die für alle offen sind
  select '7 Offene Zeilenregel (true)', pol.polrelid::regclass::text || ': ' || pol.polname
  from pg_policy pol join pg_class c on c.oid = pol.polrelid join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and (coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') = 'true' or coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '') = 'true')

  union all
  -- 8. Registrierung nur mit Einladungscode: Trigger muss vorhanden sein
  select '8 Registrierungs-Trigger fehlt', 'on_auth_user_created'
  where not exists (select 1 from pg_trigger where tgname = 'on_auth_user_created' and not tgisinternal)

  union all
  -- 9. Foto-Speicher: Bucket muss existieren, Grösse und Typen begrenzt
  select '9 Foto-Bucket fehlt oder ist unbegrenzt', 'puzzle-images'
  where not exists (select 1 from storage.buckets b where b.id = 'puzzle-images' and b.file_size_limit is not null and b.file_size_limit <= 5242880 and b.allowed_mime_types is not null)

  union all
  -- 10. Foto-Speicher: Schreiben nur für freigegebene Mitglieder im eigenen Ordner (Policies müssen vorhanden sein)
  select '10 Foto-Speicher: Regeln fehlen', 'insert/update/delete'
  where (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'puzzle_images_%') < 3
)
select * from problems
union all
select 'OK', 'Keine Probleme gefunden' where not exists (select 1 from problems);
