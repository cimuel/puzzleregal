-- Erster Admin: im Supabase SQL-Editor ausführen. Die Platzhalter in <...> ersetzen.
-- Diese Datei enthält absichtlich keinen echten Code (das Repository ist öffentlich).

-- Schritt 1: Einen ersten Einladungscode anlegen (klein geschrieben, mindestens 8 Zeichen).
insert into public.invite_codes (code, note, max_uses)
values ('<dein-geheimer-startcode>', 'Start-Code für den ersten Admin', 1);

-- Schritt 2: Auf der Webseite mit diesem Code registrieren. Erst danach Schritt 3 ausführen.

-- Schritt 3: Das neue Konto zum freigegebenen Admin machen.
update public.profiles
set role = 'admin', status = 'approved'
where id = (select id from auth.users where email = '<deine-email@beispiel.ch>');
