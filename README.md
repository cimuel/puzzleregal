# Puzzleregal

Digitales Puzzleregal mit Ausleihsystem und Wettkampfstatistik für unsere Puzzle-Community.

**Stand: Phase 3 von 6** (Kernfunktionen).
- Phase 2: Registrierung mit Einladungscode, Admin-Freigabe, Anmeldung, Berechtigungen, Adminbereich.
- Phase 3: Puzzles erfassen (mit Foto, Doppelt-Erkennung, optional Meisterschaft), Alle Puzzles (Suche, Filter, Sortierung),
  Puzzle-Detailseite mit Rangliste, Regale (Karten, umschaltbare Sortierung), Zeiterfassung (Einzel, Paar, Team),
  Personenprofil mit Statistiken und Verlauf.
- **Noch nicht gebaut:** Ausleihen (Phase 4), Wettkampfimport und Rangschätzung (Phase 5).

## Aufbau

- Frontend: Vite + React + TypeScript + Tailwind, veröffentlicht über GitHub Pages
- Datenbank, Login, Foto-Speicher: Supabase (Gratisplan)
- Berechtigungen werden **in der Datenbank** durchgesetzt (Row Level Security), nicht nur in der Oberfläche
- Der Schlüssel in `.env.production` ist der *öffentliche* (publishable) Schlüssel und darf im Repository stehen.
  Den `service_role`- bzw. `secret`-Schlüssel niemals ins Repository oder in den Browser-Code legen.

## Einrichtung (einmalig)

### 1. Dateien ins GitHub-Repository
1. ZIP entpacken. In `github.com/cimuel/puzzleregal`: **Add file → Upload files**.
2. Den **Inhalt** des entpackten Ordners hineinziehen (nicht den Ordner selbst), dann **Commit changes**.
3. Der versteckte Ordner `.github` wird beim Hochziehen manchmal ausgelassen. Prüfe, ob im Repository der Ordner
   `.github/workflows` mit zwei Dateien existiert. Falls nicht: **Add file → Create new file**, als Name
   `.github/workflows/deploy.yml` eintippen (die Schrägstriche legen die Ordner an), Inhalt aus der Datei einfügen,
   committen. Dasselbe für `keepalive.yml`.

### 2. Datenbank einrichten (Supabase)
1. Supabase-Projekt öffnen → **SQL Editor** → **New query**.
2. Inhalt von `supabase/migrations/0001_schema.sql` einfügen → **Run**. Erwartet: «Success».
3. Neue Query: Inhalt von `supabase/migrations/0002_storage.sql` einfügen → **Run**.
4. Beide Dateien **nur einmal** ausführen.

### 3. Anmelde-Einstellungen (Supabase)
1. **Authentication → Sign In / Providers → Email**: **Confirm email** ausschalten.
   Grund: Der eingebaute E-Mail-Versand von Supabase sendet nur an Adressen deines Supabase-Teams und höchstens
   2 Mails pro Stunde. Bestätigungsmails kämen bei Cinja & Co. nicht an. Der Schutz vor Fremden ist stattdessen
   der Einladungscode plus Freigabe durch dich.
2. **Authentication → URL Configuration**: *Site URL* auf `https://cimuel.github.io/puzzleregal/` setzen.
3. Folge: «Passwort vergessen» per E-Mail funktioniert vorerst nicht. Dafür wäre ein eigener E-Mail-Dienst nötig
   (Phase 6, optional). Bis dahin kann Supabase unter **Authentication → Users** das Passwort eines Kontos ändern.

### 4. Erster Admin
1. `supabase/bootstrap.example.sql` öffnen, Platzhalter ersetzen, im SQL-Editor **Schritt 1** ausführen.
2. Auf der Webseite mit diesem Startcode registrieren.
3. Im SQL-Editor **Schritt 3** ausführen. Danach bist du freigegebener Admin und erzeugst weitere Codes im Adminbereich.

### 5. Veröffentlichen (GitHub Pages)
1. Repository → **Settings → Pages** → *Source*: **GitHub Actions**.
2. Reiter **Actions**: Der Lauf «Veröffentlichen (GitHub Pages)» startet bei jedem Commit auf `main`.
   Grün = veröffentlicht. Adresse: `https://cimuel.github.io/puzzleregal/`

## Update auf Phase 3 einspielen (wenn Phase 2 schon läuft)

**Reihenfolge einhalten: zuerst die Datenbank, dann der Code.**
1. Supabase, **SQL Editor**, **New query**: Inhalt von `supabase/migrations/0003_phase3_kernfunktionen.sql` einfügen, **Run**.
   Erwartet: «Success». Meldet er einen Fehler bei `create extension pg_trgm`, schick mir den Text (die Erweiterung dient
   nur der Erkennung ähnlicher Titel). Die Datei nur **einmal** ausführen.
2. GitHub: den **gesamten** Inhalt des entpackten Ordners nochmals hochladen (Upload files, alles markieren, ziehen,
   Commit). `package.json` und `package-lock.json` müssen mit, sonst schlägt der Bauablauf fehl.
3. Reiter **Actions**: warten, bis der Lauf grün ist. Seite mit Strg + F5 neu laden.

## Entwickeln und Testen

```bash
npm install
npm run dev        # lokale Vorschau
npm test           # Frontend-Tests (Rechenfunktionen und Rauchtests der Seiten)
npm run build      # Typprüfung + Produktionsbuild
npm run test:db    # Datenbanktests (braucht lokale PostgreSQL, siehe supabase/tests/db_test.py)
```

## Pausen-Risiko (Supabase Gratisplan)
Gratis-Projekte werden nach 7 Tagen ohne Aktivität pausiert. Die Daten bleiben erhalten, die Seite ist aber bis
zur Reaktivierung (Supabase-Dashboard → *Restore*) nicht erreichbar. `keepalive.yml` ruft alle 3 Tage die harmlose Datenbankfunktion `ping()` auf.
**Ungeprüft**, ob das die Pause verhindert. Prüfung: nach 8 Tagen ohne Nutzung die Seite öffnen. Alternative:
Pro-Plan (25 USD/Monat). GitHub deaktiviert geplante Abläufe ausserdem nach 60 Tagen ohne Repository-Aktivität.

## Sichtbarkeit (Entscheid)
Öffentlich: nur die Startseite ohne Daten. Alles andere: nur freigegebene, angemeldete Mitglieder.
Wartende und gesperrte Konten sehen keine Puzzles, Zeiten oder Profile anderer.

## Kennzahlen (Definitionen)
- **Beste Zeit pro Puzzle:** kürzeste gültige Zeit der Person für dieses Puzzle.
- **Durchschnittliche Lösungszeit:** Mittel aller Versuche. Mischt verschieden grosse Puzzles; die Anzahl Versuche steht dabei.
- **Durchschnittliche Geschwindigkeit:** Summe aller Teile ÷ Summe aller Minuten (gewichtet, nicht der Mittelwert einzelner Werte).
- **Geschwindigkeit eines Versuchs:** Teile ÷ Minuten dieses einen Versuchs. Teile pro Stunde = Teile pro Minute × 60.
- **Rang:** gleiche Zeit ergibt gleichen Rang, danach wird übersprungen (1, 2, 2, 4).
- **Persönliche Statistiken** zählen standardmässig nur **Einzelversuche**. Paar- und Teamzeiten sind getrennt wählbar.
