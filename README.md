# Puzzleregal

Das gemeinsame digitale Puzzleregal unserer Puzzle-Community: Puzzles mit Foto erfassen, persönliche Regale, Ausleihen,
Zeiten und Ranglisten, Meisterschaftsresultate und hypothetische Rangschätzungen.

- **Seite:** `https://cimuel.github.io/puzzleregal/`
- **Für Mitglieder:** `docs/BENUTZERANLEITUNG.md`
- **Für Admins:** `docs/BETRIEB.md` (Sicherung, Passwort, Störungen)
- **Technik und Entscheide:** `docs/ARCHITEKTUR.md`

## Aufbau und Kosten
| Teil | Dienst | Kosten |
|---|---|---|
| Seite (Frontend) | GitHub Pages, Code in diesem öffentlichen Repository | gratis |
| Datenbank, Anmeldung, Fotos | Supabase, Gratisplan | gratis |
| Veröffentlichen | GitHub Actions (automatisch bei jeder Änderung auf `main`) | gratis |

Der Schutz der Daten liegt **in der Datenbank** (Zeilenregeln, Spaltenrechte, Funktionsrechte), nicht in der Oberfläche.
Der Schlüssel in `.env.production` ist der *öffentliche* Schlüssel und darf im Repository stehen. Den geheimen Schlüssel
(`service_role` / `secret`) niemals ins Repository oder in den Browser-Code legen.

## Einrichtung von Grund auf (einmalig)

### 1. GitHub
1. Repository `puzzleregal` (öffentlich) anlegen, den **gesamten** Inhalt des ZIP hochladen (Add file, Upload files).
2. Prüfen, dass `.github/workflows` mit `deploy.yml` und `keepalive.yml` und die Dateien `.env.production` und `.gitignore` da sind.
   Fehlt etwas Verstecktes: Add file, Create new file, den Namen mit Pfad tippen (z. B. `.github/workflows/deploy.yml`) und den Inhalt einfügen.
3. **Settings, Pages**: Source auf **GitHub Actions** stellen.

### 2. Supabase
1. Organisation (Free) und Projekt `puzzleregal` anlegen, Region Europa. Das Datenbank-Passwort im Passwort-Manager speichern.
2. **SQL Editor**: die Dateien aus `supabase/migrations/` **nacheinander in dieser Reihenfolge** einfügen und je **einmal** ausführen.
   Erwartet jeweils «Success».

   | Datei | Inhalt |
   |---|---|
   | `0001_schema.sql` | Tabellen, Registrierung mit Einladungscode, Berechtigungen |
   | `0002_storage.sql` | Foto-Speicher |
   | `0003_phase3_kernfunktionen.sql` | Puzzles, Zeiten, Ranglisten, Statistiken |
   | `0004_phase4_ausleihe.sql` | Ausleihen, Mitteilungen, Eigentumswechsel |
   | `0005_gaesteregal.sql` | Strengere Schreibrechte auf Exemplaren (Orte-Teil wird in 0006 ersetzt) |
   | `0006_gaesteregal_gastausleihe.sql` | Gästeregal: Puzzles bei Gästen ohne Konto |
   | `0007_phase5_wettkampf.sql` | Import offizieller Resultate, Rangschätzung |
   | `0008_funktionsrechte.sql` | **Sicherheits-Korrektur:** Funktionen nur noch für angemeldete Mitglieder |

3. **Authentication, Sign In / Providers, Email**: **Confirm email** ausschalten (der Standard-Mailversand erreicht nur Team-Adressen).
4. **Authentication, URL Configuration**: *Site URL* auf `https://cimuel.github.io/puzzleregal/` setzen.

### 3. Erster Admin
1. `supabase/bootstrap.example.sql` öffnen, Platzhalter ersetzen und **Schritt 1** im SQL Editor ausführen (Startcode anlegen).
2. Auf der Seite mit diesem Startcode registrieren.
3. **Schritt 3** der Datei ausführen (macht dich zum freigegebenen Admin).
4. Den Startcode im Adminbereich deaktivieren und echte Einladungscodes erzeugen.

### 4. Sicherheitsprüfung
Führe `supabase/audit.sql` im SQL Editor aus. **Erwartet: genau eine Zeile «OK».**
Jede andere Zeile ist ein Problem: Schick sie mir. Diese Prüfung gehört nach **jedem** SQL-Update dazu.

## Update einspielen (Reihenfolge einhalten)
1. **Zuerst die Datenbank:** neue Dateien aus `supabase/migrations/` (die du noch nicht ausgeführt hast) im SQL Editor ausführen, je einmal.
2. **Dann den Code:** den **gesamten** Inhalt des neuen ZIP ins Repository hochladen (Upload files, Commit). Dateien mit gleichem Namen werden ersetzt, nichts wird gelöscht.
3. **Actions**: warten, bis der Lauf grün ist. Seite mit Strg + F5 neu laden.
4. `supabase/audit.sql` ausführen: «OK».

## Sichtbarkeit und Rollen
- **Öffentlich:** nur die Startseite ohne Daten.
- **Freigegebene Mitglieder:** alle Regale, Puzzles, Zeiten, Ranglisten, Meisterschaften.
- **Wartende und gesperrte Konten:** sehen nichts.
- **Admins:** zusätzlich Freigaben, Einladungscodes, Import von Resultaten, Sicherung, Eingriff bei hängenden Ausleihen.

## Datenschutz
- Importierte Ergebnislisten enthalten Namen vieler Personen ohne Konto. Sie sind nur für angemeldete Mitglieder sichtbar. Ein Admin kann die Resultate einer Runde jederzeit löschen.
- Der Name eines Gastes im Gästeregal ist für alle Mitglieder sichtbar. Nur eintragen, was weitergegeben werden darf.
- E-Mail-Adressen sieht nur der Admin im Supabase-Dashboard, nicht in der App.

## Entwickeln und Testen
```bash
npm install
npm run dev        # lokale Vorschau
npm test           # Frontend-Tests (Rechenfunktionen, Einlesen, Seiten mit Attrappen)
npm run build      # Typprüfung und Produktionsbuild
npm run test:db    # Datenbanktests (braucht eine lokale PostgreSQL, siehe supabase/tests/db_test.py)
```
Die Datenbanktests prüfen Berechtigungen, Abläufe und Berechnungen gegen eine **Nachbildung** von Supabase. Was nur in der echten
Umgebung geprüft werden kann, prüft `supabase/audit.sql`.
