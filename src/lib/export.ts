import { supabase } from './supabase'
import { formatDuration } from './time'

/** CSV für Schweizer Excel: Semikolon als Trenner, UTF-8 mit Markierung, Felder bei Bedarf in Anführungszeichen. */
export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return '\ufeff' + [headers, ...rows].map((r) => r.map(esc).join(';')).join('\r\n') + '\r\n'
}

export function downloadText(filename: string, text: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export const todayStamp = (d = new Date()): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export interface AttemptExportRow { solved_on: string; title: string; piece_count: number; duration_seconds: number; ppm: string; kind: string; team_size: number }

export function attemptsToCsv(rows: AttemptExportRow[]): string {
  return toCsv(
    ['Datum', 'Puzzle', 'Teile', 'Zeit', 'Sekunden', 'Teile pro Minute', 'Art', 'Personen'],
    rows.map((r) => [r.solved_on, r.title, r.piece_count, formatDuration(r.duration_seconds), r.duration_seconds, r.ppm, r.kind === 'official' ? 'offiziell' : 'Training', r.team_size]),
  )
}

/** Holt alle Seiten einer Abfrage. Supabase liefert höchstens 1000 Zeilen pro Anfrage, darum wird seitenweise gelesen. */
export async function fetchAllPages<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, pageSize = 1000): Promise<T[]> {
  const all: T[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1)
    if (error) throw new Error(error.message)
    all.push(...(data ?? []))
    if (!data || data.length < pageSize) break
  }
  return all
}

/** Tabellen der Sicherung. Nicht enthalten: Passwörter, E-Mail-Adressen, Einladungscodes, Mitteilungen und die Foto-Dateien selbst. */
export const BACKUP_TABLES: { table: string; columns: string }[] = [
  { table: 'profiles', columns: 'id, display_name, role, status, wjpc_slug, created_at' },
  { table: 'puzzles', columns: 'id, title, brand, product_no, piece_count, image_path, difficulty, notes, created_by, created_at' },
  { table: 'copies', columns: 'id, puzzle_id, owner_id, is_lendable, note, guest_name, guest_since, created_at' },
  { table: 'ownership_history', columns: 'id, copy_id, from_owner_id, to_owner_id, changed_at, changed_by' },
  { table: 'loans', columns: 'id, copy_id, borrower_id, status, message, requested_at, accepted_at, handed_over_at, return_requested_at, returned_at' },
  { table: 'events', columns: 'id, name, year, location, source_url' },
  { table: 'rounds', columns: 'id, event_id, name, team_size, piece_count, time_limit_seconds, results_url, puzzle_id, puzzle_name_source' },
  { table: 'attempts', columns: 'id, puzzle_id, copy_id, solved_on, duration_seconds, kind, team_size, round_id, notes, created_by, created_at' },
  { table: 'attempt_participants', columns: 'attempt_id, profile_id' },
  { table: 'official_results', columns: 'id, round_id, rank, entry_name, country, status, finish_seconds, pieces_placed, source_url, fetched_at' },
  { table: 'official_result_members', columns: 'id, result_id, member_name, wjpc_slug, profile_id' },
]

export interface Backup { format: 'puzzleregal-sicherung-1'; exportedAt: string; counts: Record<string, number>; tables: Record<string, unknown[]> }

export async function buildBackup(onProgress?: (table: string) => void): Promise<Backup> {
  const tables: Record<string, unknown[]> = {}
  for (const { table, columns } of BACKUP_TABLES) {
    onProgress?.(table)
    tables[table] = await fetchAllPages((from, to) => supabase.from(table).select(columns).order(columns.split(',')[0].trim()).range(from, to))
  }
  return {
    format: 'puzzleregal-sicherung-1',
    exportedAt: new Date().toISOString(),
    counts: Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length])),
    tables,
  }
}
