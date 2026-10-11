# Architektur und Entscheide (Stand Phase 2)

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

## Bekannte Lücken (bewusst offen)
- Rangschätzung, Statistiken, Ausleihabläufe: Phasen 3 bis 5.
- Mitglieder können über die Datenbank-API Teamversuche mit beliebigen Personen verknüpfen (Einzelversuche nicht).
  Eine Bestätigung durch die Genannten wäre eine mögliche Verschärfung.
- Administratoren sehen E-Mail-Adressen nur im Supabase-Dashboard, nicht in der App.
