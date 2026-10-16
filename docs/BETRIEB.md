# Puzzleregal: Betrieb (für Admins)

## Monatliche Routine (10 Minuten)
1. **Sicherung:** Administration, **Sicherung herunterladen**. Datei an einem privaten Ort ablegen (nicht öffentlich, nicht ins GitHub-Repository).
2. **GitHub, Reiter Actions:** Der letzte Lauf «Veröffentlichen» muss grün sein. Der Lauf «Supabase wachhalten» sollte regelmässig grün laufen.
3. **Seite öffnen:** Funktioniert die Anmeldung?

## Neue Person aufnehmen
1. Administration, **Neuen Code erzeugen** (Notiz: «für Michael», Max. Nutzungen: 1).
2. Code persönlich weitergeben (nicht in einen öffentlichen Chat).
3. Nach der Registrierung unter **Freigaben** auf **Freigeben** klicken.
4. Wer nicht mehr mitmachen soll: **Sperren** (nicht löschen, damit Zeiten und Ausleihen erhalten bleiben).

## Passwort vergessen
«Passwort vergessen» per E-Mail geht nicht (der Standard-Mailversand von Supabase erreicht nur Adressen deines Supabase-Teams).
**Weg für dich als Admin:** Im Supabase SQL Editor ausführen, mit der E-Mail-Adresse und einem neuen, zufälligen Passwort:
```sql
update auth.users
set encrypted_password = extensions.crypt('NEUES-ZUFAELLIGES-PASSWORT', extensions.gen_salt('bf')), updated_at = now()
where email = 'person@beispiel.ch';
```
Das neue Passwort der Person persönlich mitteilen. Sie ändert es danach unter **Mein Profil, Passwort ändern**.
*Ungeprüft:* Ich konnte das nicht gegen dein echtes Supabase testen. Probiere es einmal mit einem Testkonto aus, bevor du es brauchst.
Wenn es nicht klappt, kannst du in Supabase unter Authentication, Users das Konto öffnen und dort ein neues Passwort setzen lassen (je nach Oberfläche).

## Supabase pausiert (Gratisplan)
Nach 7 Tagen ohne Aktivität pausiert Supabase das Projekt. Dann zeigt die Seite einen Verbindungsfehler.
- Supabase-Dashboard öffnen, Projekt wählen, **Restore project**. Die Daten sind nicht verloren.
- Der Lauf «Supabase wachhalten» ruft alle 3 Tage `ping()` auf, um das zu verhindern. Ob das reicht, ist **nicht belegt**. Prüfe es: Wenn die Seite nach einer Woche ohne Nutzung noch läuft, funktioniert es.
- GitHub deaktiviert geplante Abläufe nach 60 Tagen ohne Änderung am Repository. Dann Actions, den Lauf auswählen und wieder aktivieren.

## Sicherung und Wiederherstellung
- Die Sicherungsdatei (JSON) enthält alle Daten der App, **nicht** Passwörter, E-Mail-Adressen, Einladungscodes und **nicht die Foto-Dateien** (nur Pfade).
  Fotos bleiben in Supabase. Wird das Projekt gelöscht, sind sie weg.
- Die Datei ist ein **Archiv und Sicherheitsnetz**, zum Beispiel gegen versehentlich gelöschte Zeiten. Ein automatisches Zurückspielen gibt es nicht.
  Bei Bedarf bauen wir gemeinsam ein SQL-Skript aus der Datei. Konten müssten sich neu registrieren, weil die Anmeldedaten nicht Teil der Sicherung sind.
- Ob dein Supabase-Plan eigene automatische Sicherungen mitbringt, habe ich nicht belegt. Verlass dich nicht darauf.

## Störungen
| Beobachtung | Wahrscheinliche Ursache | Was tun |
|---|---|---|
| Seite weiss oder alter Stand | Lauf in Actions rot, oder Browser-Zwischenspeicher | Actions prüfen, Strg + F5 |
| «Keine Verbindung zum Server» | Supabase pausiert | Restore project (siehe oben) |
| Registrierung «nicht möglich» | Einladungscode falsch, deaktiviert oder aufgebraucht | Code im Adminbereich prüfen, neuen erzeugen |
| «Dafür fehlt dir die Berechtigung» | Konto wartet oder ist gesperrt, oder fehlende Rolle | Administration, Mitglieder prüfen |
| Foto lässt sich nicht hochladen | Datei kein Bild oder zu gross | anderes Foto, JPEG oder PNG |
| Import meldet «Spalten nicht erkannt» | WJPC hat die Tabelle geändert | gespeicherte Seite im Chat hochladen, oder CSV verwenden |
| `audit.sql` zeigt Zeilen | Sicherheitsregel falsch gesetzt | Zeilen an mich schicken, nichts selbst ändern |

## Nach jedem SQL-Update
`supabase/audit.sql` ausführen. Erwartet: eine Zeile «OK». **Jede neue Funktion braucht ein ausdrückliches Recht** (`grant execute … to authenticated`),
sonst kann die App sie nicht aufrufen. Das ist gewollt: Neue Funktionen sind standardmässig für niemanden ausführbar.

## Jährlich
- Versionen der GitHub-Aktionen in `.github/workflows/` prüfen (Meldungen «deprecated» in Actions).
- Prüfen, ob WJPC das Aussehen der Ergebnisseiten geändert hat (ein Probe-Import mit der Vorschau).
