# Puzzleregal

Digitales Puzzleregal mit Ausleihsystem und Wettkampfstatistik für unsere Puzzle-Community.

**Stand: Phase 5 von 6** (Wettkampfintegration), dazu Ausleihsystem und Gästeregal.
- Phase 2: Registrierung mit Einladungscode, Admin-Freigabe, Anmeldung, Berechtigungen, Adminbereich.
- Phase 3: Puzzles erfassen (mit Foto, Doppelt-Erkennung, optional Meisterschaft), Alle Puzzles (Suche, Filter, Sortierung),
  Puzzle-Detailseite mit Rangliste, Regale (Karten, umschaltbare Sortierung), Zeiterfassung (Einzel, Paar, Team),
  Personenprofil mit Statistiken und Verlauf.
- Phase 4: Ausleihen (anfragen, annehmen oder ablehnen, Übergabe, Rückgabe), Verlauf, Mitteilungen in der App,
  Eigentumswechsel, Schalter «zum Ausleihen freigegeben».
- Zusatz: **Gästeregal** (Orte ausserhalb des eigenen Regals, dort nicht ausleihbar).
- Phase 5: Import offizieller Resultate (gespeicherte WJPC-Seite, kopierte Tabelle oder CSV), Meisterschaften und Rundenseiten,
  automatische Zuordnung zu Mitgliedern, offizielle Resultate im Profil, **hypothetische Rangschätzung**.
- **Noch nicht gebaut:** Tests mit echten Daten auf dem laufenden System, Veröffentlichungs-Checkliste (Phase 6), E-Mail-Benachrichtigungen (optional).

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

## Update auf Phase 5 einspielen (wenn das Gästeregal schon läuft)

**Reihenfolge einhalten: zuerst die Datenbank, dann der Code.**
1. Supabase, **SQL Editor**, **New query**: Inhalt von `supabase/migrations/0007_phase5_wettkampf.sql` einfügen, **Run**.
   Erwartet: «Success». Nur **einmal** ausführen.
2. GitHub: den **gesamten** Inhalt des entpackten Ordners nochmals hochladen (Upload files, Commit). Keine Datei fällt weg.
3. Reiter **Actions**: warten, bis der Lauf grün ist. Seite mit Strg + F5 neu laden.

## Update: Gästeregal einspielen (wenn Phase 4 schon läuft)

**Reihenfolge einhalten: zuerst die Datenbank, dann der Code.**
1. Supabase, **SQL Editor**, **New query**, nacheinander und jeweils **nur einmal**:
   a) `supabase/migrations/0005_gaesteregal.sql`, **nur falls du sie noch nicht ausgeführt hast**. Sie legt auch Schreibrechte auf Exemplaren strenger fest (siehe `docs/ARCHITEKTUR.md`).
   b) `supabase/migrations/0006_gaesteregal_gastausleihe.sql`. Sie ersetzt das Orte-Konzept aus 0005 durch die Gast-Ausleihe. Puzzles, die du in 0005 schon an einen Ort gestellt hast, erscheinen danach als «bei Gast» ohne Namen.
   Erwartet jeweils: «Success».
2. GitHub: den **gesamten** Inhalt des entpackten Ordners nochmals hochladen (Upload files, Commit). Keine Datei fällt weg.
3. Reiter **Actions**: warten, bis der Lauf grün ist. Seite mit Strg + F5 neu laden.

## Update auf Phase 4 einspielen (wenn Phase 3 schon läuft)

**Reihenfolge einhalten: zuerst die Datenbank, dann der Code.**
1. Supabase, **SQL Editor**, **New query**: Inhalt von `supabase/migrations/0004_phase4_ausleihe.sql` einfügen, **Run**.
   Erwartet: «Success». Nur **einmal** ausführen.
2. GitHub: den **gesamten** Inhalt des entpackten Ordners nochmals hochladen (Upload files, Commit).
   Es fällt keine Datei weg, nichts muss gelöscht werden.
3. Reiter **Actions**: warten, bis der Lauf grün ist. Seite mit Strg + F5 neu laden.

## Update auf Phase 3 einspielen (nur wenn noch von Phase 2 aus gestartet wird)

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

## Ausleihe: Ablauf und Regeln
1. **Anfragen:** Jedes Mitglied kann bei einem fremden, zum Ausleihen freigegebenen Exemplar «Ausleihe anfragen» wählen (mit optionaler Nachricht).
2. **Annehmen oder ablehnen:** nur die Besitzerin oder der Besitzer. Angenommen heisst: **reserviert**. Das Puzzle bleibt noch im Regal der Besitzerin.
3. **Übergabe bestätigen:** nur die Besitzerin oder der Besitzer. Erst dann steht das Puzzle im Regal der ausleihenden Person und ist beim Eigentümer als ausgeliehen markiert.
4. **Rückgabe:** Die ausleihende Person kann «Rückgabe melden», die Besitzerin «Rückgabe anfragen». Zurückgegeben ist es erst, wenn die **Besitzerin oder der Besitzer die Rückgabe bestätigt**.
5. Dasselbe Exemplar kann nie gleichzeitig an mehrere Personen vergeben sein (Sperre in der Datenbank). Weitere Anfragen bleiben offen und lassen sich annehmen, sobald das Puzzle zurück ist.
6. **Zurückziehen:** Anfragen und angenommene Ausleihen vor der Übergabe kann die ausleihende Person zurückziehen. Angenommene kann auch die Besitzerin stornieren.
7. **Admins** können hängende Ausleihen im Adminbereich abschliessen.
8. **Eigentumswechsel:** nur durch die Besitzerin, nie bei offenen Anfragen oder laufender Ausleihe. Der Verlauf wird gespeichert.
9. Mitteilungen erscheinen in der App (Menü «Mitteilungen» mit Zähler). Es werden keine E-Mails verschickt.

## Gästeregal (Puzzles bei Gästen ohne Konto)
- Das **Gästeregal** zeigt alle Puzzles von Mitgliedern, die gerade bei Freunden **ohne Konto** sind.
- In **Mein Regal** trägst du bei einem eigenen Puzzle «An einen Gast ohne Konto ausgeliehen» ein (Name optional, ein Vorname genügt).
  Wenn du es zurück hast: «Vom Gast zurück erhalten».
- Ein Puzzle bei einem Gast ist **nicht ausleihbar**: Die Anfrage-Schaltfläche fehlt, und die Datenbank lehnt Anfragen ab.
- Eintragen geht nur, wenn keine offene Anfrage und keine Ausleihe läuft.
- Der Eigentümer bleibt erhalten. Das Puzzle bleibt in deinem Regal mit dem Hinweis «bei Gast (Name)».
- Der Name des Gastes ist für alle Mitglieder sichtbar. Verwende nur, was du weitergeben darfst.

## Wettkampfresultate importieren (nur Admin)
1. Öffne die Ergebnisseite der Runde auf worldjigsawpuzzle.org, zum Beispiel den Final der Teams.
2. Speichere die Seite: **Strg + S**, Typ **«Webseite, nur HTML»**.
3. In der App: **Administration, Resultate importieren**, die Datei hochladen. Alternativ die Tabelle markieren, kopieren und ins Feld einfügen, oder CSV verwenden.
4. **Vorschau prüfen**: Anzahl Einträge, fertige und nicht fertige, Personen. Kein Ortsname darf als Person erscheinen.
5. Meisterschaft, Jahr, Runde, Wettkampfart, Teilezahl und Zeitlimit sind aus der Seite vorbelegt. Das **Puzzle** wird vorgeschlagen, wenn es schon erfasst ist (sonst zuerst unter «Neues Puzzle erfassen» anlegen oder später auf der Rundenseite verknüpfen).
6. **Importieren.** Vorhandene Resultate derselben Runde werden dabei ersetzt.

**Zuordnung zu Mitgliedern:** automatisch über das WJPC-Profil (im eigenen Profil unter «Profil bearbeiten» eintragen) oder bei genau gleichem vollem Namen. Alles andere ordnest du auf der Rundenseite von Hand zu.

## Hypothetische Rangschätzung
Auf der Puzzle-Seite wählst du eine deiner Zeiten. Die App vergleicht sie mit den offiziellen Resultaten der **mit diesem Puzzle verknüpften** Runden.
- Verglichen wird nur bei **gleichem Puzzle, gleicher Wettkampfart** (Einzel, Paar, Team), gleicher Teilezahl und **innerhalb des Zeitlimits**. Sonst steht der Grund da, es wird nichts geschätzt.
- Rang = 1 + Anzahl offizieller, fertiger Resultate mit kürzerer Zeit. Gleiche Zeit ergibt gleichen Rang. Nicht fertig gewordene Einträge zählen als langsamer.
- Jede Schätzung ist als **hypothetisch** gekennzeichnet und nennt Quelle und Importdatum. Sie ist kein offizielles Ergebnis.
- Beispiel zur Kontrolle: Mit 1:46:43 als Team ergibt der Final der Teams 2026 den Rang 35 von 50 fertigen Einträgen.

## Datenschutz bei Wettkampfdaten
Importierte Ergebnislisten enthalten Namen vieler Personen ohne Konto. Sie sind nur für angemeldete, freigegebene Mitglieder sichtbar, nicht öffentlich.
Ein Admin kann die Resultate einer Runde jederzeit löschen (Rundenseite).
