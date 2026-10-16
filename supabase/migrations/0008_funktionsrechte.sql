-- Puzzleregal – Migration 0008: Ausführungsrechte für Funktionen korrigieren
-- Problem: PostgreSQL erlaubt neu erstellte Funktionen standardmässig für ALLE (PUBLIC), auch für nicht angemeldete
-- Besucher. Das Entziehen in Migration 0001 wirkte dafür nicht. Besonders betroffen waren die internen Hilfsfunktionen
-- _notify, _link_round und _loan_payload, die selbst keine Anmeldung prüfen.
-- Diese Migration entzieht alle Ausführungsrechte und vergibt sie gezielt neu. Einmal ausführen.

-- 1. Alles entziehen
revoke execute on all functions in schema public from public, anon, authenticated;

-- 2. Künftige Funktionen sollen nicht mehr automatisch für alle ausführbar sein
alter default privileges revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- 3. Gezielt vergeben:
--    ping() für Besucher (Lebenszeichen), alle Programm-Funktionen für angemeldete Mitglieder.
--    Nicht vergeben werden interne Hilfsfunktionen (Name beginnt mit _) und Trigger-Funktionen.
grant execute on function public.ping() to anon, authenticated;

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.proname !~ '^_'
      and p.proname <> 'ping'
      and p.prorettype <> 'trigger'::regtype
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end $$;
