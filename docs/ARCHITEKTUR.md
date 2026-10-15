# Architektur und Entscheide (Stand Phase 5)

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

| Gästeregal | `copies.guest_name` und `copies.guest_since`, Setzen nur über `lend_to_guest` und `return_from_guest` | Puzzles bei Gästen ohne Konto sind sichtbar und nicht ausleihbar |
| Schreibrechte auf Spalten | Tabellenrecht entziehen, dann nur erlaubte Spalten vergeben | Ein Spaltenverbot allein wirkt nicht, solange das Tabellenrecht besteht |

| Resultate holen | Import durch Admin aus gespeicherter Seite, kopierter Tabelle oder CSV, kein automatischer Abruf | Ein Browser darf die WJPC-Seite nicht direkt abrufen; ein Server-Abruf liesse sich ohne Test gegen die echte Seite nicht prüfen |
| Import | `import_round_results`: ersetzt die Runde atomar, Fehler lassen die alten Resultate unverändert | nie halb importiert |
| Zuordnung | WJPC-Kürzel im Profil, sonst voller Name (nur bei genau einem Treffer), sonst von Hand | keine falschen Zuordnungen bei gleichen Namen |
| Rangschätzung | `rank_estimates`: nur gleiches Puzzle, gleiche Wettkampfart, gleiche Teilezahl, im Zeitlimit | Resultate anderer Puzzles oder Formate sind nicht vergleichbar (Beispiel Fast Pi: 1:00:20 in Gruppe E, 1:46:43 im Final) |

## Sicherheits-Korrektur in Migration 0005
Seit Phase 2 war auf `copies` das Recht «aktualisieren» für die ganze Tabelle vergeben und nur `owner_id` per
Spaltenverbot ausgenommen. Das Spaltenverbot wirkte nicht. Verhindert wurde ein Fremdzugriff trotzdem durch die
Zeilenregel, aber an der falschen Stelle. Seit 0005 sind nur `is_lendable` und `note` direkt schreibbar, und ein
Test prüft die Spaltenrechte aller sensiblen Spalten direkt (`sensible_spalten_sind_per_spaltenrecht_gesperrt`).

## Bekannte Lücken (bewusst offen)
- **Der Import ist auf den Aufbau der WJPC-Seiten von Oktober 2026 abgestimmt** (geprüft: SPM 2026 und 2024, Teams und Einzel). Die Tabellen sind je Meisterschaft verschieden aufgebaut; Land und Herkunft sind deshalb optional und die Spalten werden aus Überschriften und Inhalt erkannt. Paar-Seiten sind nicht an einer echten Seite geprüft. Ändert WJPC das HTML, kann das Einlesen brechen. Die Vorschau zeigt das vor dem Import; CSV bleibt als Ersatz.
- Das Einfügen kopierter Tabellen aus der Zwischenablage ist nicht mit einem echten Browser geprüft. Die gespeicherte Seite ist der zuverlässigere Weg.
- Es gibt keine Oberfläche, um einzelne Resultate zu bearbeiten (nur Runde ersetzen oder löschen).
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
