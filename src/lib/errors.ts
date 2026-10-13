/** Übersetzt technische Supabase-Fehler in verständliche Meldungen. */
export function friendlyError(message: string | undefined | null): string {
  const m = (message ?? '').toLowerCase()
  if (!m) return 'Unbekannter Fehler. Bitte versuche es nochmals.'
  if (m.includes('database error saving new user'))
    return 'Registrierung nicht möglich. Prüfe den Einladungscode und den Namen (mindestens 2 Zeichen).'
  if (m.includes('already registered') || m.includes('already been registered'))
    return 'Diese E-Mail-Adresse ist bereits registriert.'
  if (m.includes('puzzles_brand_product_no_key'))
    return 'Dieses Puzzle (gleiche Marke und Produktnummer) gibt es schon.'
  if (m.includes('invalid login credentials')) return 'E-Mail-Adresse oder Passwort stimmt nicht.'
  if (m.includes('email not confirmed')) return 'Die E-Mail-Adresse ist noch nicht bestätigt.'
  if (m.includes('password should be at least') || m.includes('weak password'))
    return 'Das Passwort ist zu schwach. Verwende mindestens 8 Zeichen.'
  if (m.includes('rate limit') || m.includes('too many'))
    return 'Zu viele Versuche. Warte kurz und versuche es später nochmals.'
  if (m.includes('failed to fetch') || m.includes('network'))
    return 'Keine Verbindung zum Server. Prüfe die Internetverbindung. Falls das Projekt länger nicht genutzt wurde, muss es eventuell in Supabase reaktiviert werden.'
  if (m.includes('nicht berechtigt') || m.includes('permission denied') || m.includes('row-level security'))
    return 'Dafür fehlt dir die Berechtigung.'
  return message ?? 'Unbekannter Fehler.'
}
