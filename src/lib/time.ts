/** Zeiten werden überall als ganze Sekunden gespeichert und gerechnet. Dieses Modul formatiert und prüft sie nur. */

export const MAX_SECONDS = 172800 // 48 Stunden, wie in der Datenbank

/** Stunden/Minuten/Sekunden in Sekunden umrechnen. Gibt null zurück, wenn die Eingabe nicht gültig ist. */
export function partsToSeconds(h: number, m: number, s: number): number | null {
  const ok = [h, m, s].every((n) => Number.isInteger(n) && n >= 0)
  if (!ok || h > 47 || m > 59 || s > 59) return null
  const total = h * 3600 + m * 60 + s
  return total >= 1 && total <= MAX_SECONDS ? total : null
}

export function secondsToParts(total: number): { h: number; m: number; s: number } {
  return { h: Math.floor(total / 3600), m: Math.floor((total % 3600) / 60), s: total % 60 }
}

/** 6403 → «1:46:43», 3000 → «50:00». */
export function formatDuration(total: number | null | undefined): string {
  if (total === null || total === undefined) return '–'
  const { h, m, s } = secondsToParts(total)
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`
}

/** Rückstand auf die beste Zeit: «+1:44». */
export function formatDelta(seconds: number, leaderSeconds: number): string {
  const d = seconds - leaderSeconds
  return d === 0 ? '–' : `+${formatDuration(d)}`
}

/** Teile pro Minute = Anzahl Teile / Lösungszeit in Minuten. */
export function piecesPerMinute(pieces: number, seconds: number): number {
  return pieces / (seconds / 60)
}

export function piecesPerHour(pieces: number, seconds: number): number {
  return piecesPerMinute(pieces, seconds) * 60
}

export function formatNumber(n: number | string | null | undefined, digits = 2): string {
  if (n === null || n === undefined || n === '') return '–'
  return Number(n).toLocaleString('de-CH', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

export function formatInt(n: number | null | undefined): string {
  return n === null || n === undefined ? '–' : n.toLocaleString('de-CH')
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '–'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}.${m}.${y}`
}

export function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
