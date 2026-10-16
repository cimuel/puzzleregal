import { describe, expect, it, vi } from 'vitest'

vi.mock('./supabase', () => ({ supabase: {} }))
import { attemptsToCsv, BACKUP_TABLES, fetchAllPages, toCsv, todayStamp } from './export'

describe('toCsv', () => {
  it('beginnt mit der UTF-8-Markierung und trennt mit Semikolon und Zeilenumbruch', () => {
    expect(toCsv(['A', 'B'], [[1, 'x']])).toBe('\ufeffA;B\r\n1;x\r\n')
  })
  it('setzt Felder mit Semikolon, Anführungszeichen oder Zeilenumbruch in Anführungszeichen', () => {
    const csv = toCsv(['Name'], [['a;b'], ['sag "hallo"'], ['zwei\nZeilen'], [null], [undefined], [0]])
    expect(csv).toBe('\ufeffName\r\n"a;b"\r\n"sag ""hallo"""\r\n"zwei\nZeilen"\r\n\r\n\r\n0\r\n')
  })
})

describe('attemptsToCsv', () => {
  it('schreibt Zeit lesbar und in Sekunden, Art auf Deutsch', () => {
    const csv = attemptsToCsv([{ solved_on: '2026-10-11', title: 'Lavaux Vineyards', piece_count: 1000, duration_seconds: 6403, ppm: '9.37', kind: 'official', team_size: 4 }])
    expect(csv.split('\r\n')[0]).toBe('\ufeffDatum;Puzzle;Teile;Zeit;Sekunden;Teile pro Minute;Art;Personen')
    expect(csv.split('\r\n')[1]).toBe('2026-10-11;Lavaux Vineyards;1000;1:46:43;6403;9.37;offiziell;4')
  })
})

describe('fetchAllPages', () => {
  const makeSource = (n: number) => (from: number, to: number) => Promise.resolve({ data: Array.from({ length: Math.max(0, Math.min(n, to + 1) - from) }, (_, i) => from + i), error: null })
  it('liest mehr als 1000 Zeilen vollständig und ohne Doppelte', async () => {
    const rows = await fetchAllPages(makeSource(2500))
    expect(rows).toHaveLength(2500)
    expect(new Set(rows).size).toBe(2500)
    expect(rows[0]).toBe(0)
    expect(rows[2499]).toBe(2499)
  })
  it('endet korrekt bei genau einer vollen Seite und bei leerer Tabelle', async () => {
    expect(await fetchAllPages(makeSource(1000))).toHaveLength(1000)
    expect(await fetchAllPages(makeSource(0))).toHaveLength(0)
  })
  it('wirft bei einem Fehler', async () => {
    await expect(fetchAllPages(() => Promise.resolve({ data: null, error: { message: 'kaputt' } }))).rejects.toThrow('kaputt')
  })
})

describe('Sicherung', () => {
  it('enthält keine Passwörter, E-Mail-Adressen, Einladungscodes oder Mitteilungen', () => {
    const names = BACKUP_TABLES.map((t) => t.table)
    expect(names).not.toContain('invite_codes')
    expect(names).not.toContain('notifications')
    const cols = BACKUP_TABLES.map((t) => t.columns).join(',')
    expect(cols).not.toMatch(/email|password|code(?!s)/i)
  })
  it('deckt alle Datentabellen der App ab', () => {
    expect(BACKUP_TABLES.map((t) => t.table).sort()).toEqual(['attempt_participants', 'attempts', 'copies', 'events', 'loans', 'official_result_members', 'official_results', 'ownership_history', 'profiles', 'puzzles', 'rounds'])
  })
  it('Datumsstempel für den Dateinamen', () => expect(todayStamp(new Date(2026, 9, 15))).toBe('2026-10-15'))
})
