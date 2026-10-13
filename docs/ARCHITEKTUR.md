# Architektur und Entscheide (Stand Phase 4)

| Thema | Entscheid | Grund |
|---|---|---|
| Frontend-Hosting | GitHub Pages (öffentliches Repo) | gratis, Deployment per Push |
| Backend | Supabase (Postgres, Auth, Storage) | Ranglisten/Statistiken sind relational; ein Dienst statt vier |
| Routing | HashRouter (`#/…`) | Pages kennt keine serverseitigen Routen |
| Registrierung | Einladungscode + Admin-Freigabe | verhindert Fremde auf einer öffentlichen URL |
| Konten | Status `pending`/`approved`/`blocked`, Rolle `member`/`admin` | Wartende sehen keine Daten |
| Status/Rolle ändern | nur über Datenbankfunktionen (`admin_set_user_*`) | Mitglieder können sich nicht selbst befördern |
| Puzzle vs. Exemplar | Tabellen `puzzles` (Motiv) und `copies` (physisch) | Zeiten am Motiv, Ausleihen am Exemplar |
| Standort | abgeleitet (View `copy_current_state`) | keine doppelte Datenhaltung |
| Teamversuche | `attempts.team_size` + `attempt_participants` | Teamzeiten verfälschen sonst persönliche Statistiken |
| Doppelte Ausleihe | Unique-Index auf aktive Ausleihen pro Exemplar | Schutz in der Datenbank, nicht nur in der Oberfläche |
| Fotos | öffentlich lesbarer Bucket, zufällige Dateinamen, Schreiben nur im eigenen Ordner | einfach; Fotos von Schachteln sind unkritisch |
| E-Mail | Bestätigung aus | Supabase-Standardversand erreicht nur Team-Adressen |

| Puzzles/Versuche anlegen | nur über Datenbankfunktionen (`add_puzzle`, `add_attempt`) | atomar und geprüft; direktes Schreiben ist gesperrt |
| Ähnliche Puzzles | `find_similar_puzzles` (pg_trgm, Titelähnlichkeit) | Warnung vor Doppelten; Marke+Produktnummer ist hart eindeutig |
| Ranglisten/Statistiken | Datenbankfunktionen, berechnet aus den Versuchen | keine doppelte Datenhaltung |
| Geschwindigkeit | gewichtet: Σ Teile ÷ Σ Minuten | verhindert, dass kurze Puzzles den Schnitt verzerren |
| Teamzeiten | getrennte Ranglisten, nicht in Einzelstatistiken | Teamzeit ist keine persönliche Leistung |
| Fotos | im Browser auf max. 1280 px und WebP verkleinert | bleibt unter 1 MB, spart Speicher |

| Ausleihe | Statuswechsel nur über Datenbankfunktionen (`request_loan`, `respond_loan`, `confirm_handover`, `request_return`, `confirm_return`, `cancel_loan`) | Berechtigungen und gültige Übergänge serverseitig |
| Standort | `angenommen` reserviert nur, der Standort wechselt erst bei `ausgeliehen` | entspricht der Anforderung «nach bestätigter Übergabe» |
| Übergabe/Rückgabe bestätigt | die Besitzerin oder der Besitzer (Annahme, nicht von dir vorgegeben) | eine Person entscheidet eindeutig; Admin kann einspringen |
| Mehrere Anfragen | bleiben offen, Annahme nur wenn nicht vergeben | nichts geht verloren, wenn eine Ausleihe platzt |
| Mitteilungen | Tabelle `notifications`, von Datenbankfunktionen geschrieben | kein E-Mail-Dienst nötig |
| Eigentum | `transfer_copy` mit Verlauf in `ownership_history` | Eigentum und Standort bleiben getrennt nachvollziehbar |

## Bekannte Lücken (bewusst offen)
- Keine E-Mail-Benachrichtigung: Mitteilungen sieht man nur in der App (Zähler im Menü, Aktualisierung beim Öffnen, bei Fokus und jede Minute).
- Es gibt keine Erinnerung bei überfälligen Ausleihen und kein Rückgabedatum.
- Wer eine Ausleihe stornieren will, nachdem das Puzzle übergeben wurde, muss die Rückgabe durchlaufen.
- Mitglieder können beim Erfassen eines Puzzles Veranstaltungen und Runden neu anlegen (finden oder anlegen). Es gibt noch
  keine Oberfläche, um falsche Einträge zu löschen (Admin vorerst per SQL). Kommt mit Phase 5.
- Puzzles können in der Oberfläche nicht gelöscht werden (nur Admin per SQL; Exemplare und Versuche blockieren es bewusst).
- Bei Versuchen lassen sich Puzzle und Teilnehmende nicht nachträglich ändern (löschen und neu erfassen).
- Keine Seitenaufteilung der Listen: ausgelegt auf eine Community mit einigen hundert Puzzles.
- Ausleihen und Rangschätzung: Phasen 4 und 5.
- Rangschätzung, Statistiken, Ausleihabläufe: Phasen 3 bis 5.
- Mitglieder können über die Datenbank-API Teamversuche mit beliebigen Personen verknüpfen (Einzelversuche nicht).
  Eine Bestätigung durch die Genannten wäre eine mögliche Verschärfung.
- Administratoren sehen E-Mail-Adressen nur im Supabase-Dashboard, nicht in der App.
