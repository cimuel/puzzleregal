// @vitest-environment jsdom
// Rauchtest: Seiten mit nachgebildeten Daten rendern. Prüft Laufzeitfehler und Kernanzeigen, nicht das Aussehen.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const mock = vi.hoisted(() => ({ tables: {} as Record<string, { rows?: unknown[]; single?: unknown }>, rpc: {} as Record<string, unknown>, calls: [] as { fn: string; args: unknown }[] }))

vi.mock('../lib/supabase', () => {
  const builder = (table: string) => {
    const b: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'order', 'insert', 'update', 'delete', 'is', 'in', 'limit']) b[m] = () => b
    b.maybeSingle = () => Promise.resolve({ data: mock.tables[table]?.single ?? null, error: null })
    b.then = (res: (v: unknown) => unknown) => res({ data: mock.tables[table]?.rows ?? [], error: null })
    return b
  }
  return {
    supabase: {
      from: builder,
      rpc: (fn: string, args: unknown) => { mock.calls.push({ fn, args }); return Promise.resolve({ data: mock.rpc[fn] ?? [], error: null }) },
      storage: { from: () => ({ getPublicUrl: (p: string) => ({ data: { publicUrl: `https://x.test/${p}` } }) }) },
    },
  }
})
vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ profile: { id: 'me', display_name: 'Anna', role: 'member', status: 'approved' }, session: {}, reloadProfile: async () => {} }),
}))

import { Puzzles } from './Puzzles'
import { PuzzleDetail } from './PuzzleDetail'
import { Shelf } from './Shelf'
import { PlayerProfile } from './PlayerProfile'
import { AttemptNew } from './AttemptNew'
import { PuzzleNew } from './PuzzleNew'
import { Shelves } from './Shelves'
import { LoanRequests } from './LoanRequests'
import { MyLoans } from './MyLoans'
import { Notifications } from './Notifications'

const wrap = (path: string, pattern: string, el: React.ReactElement) =>
  render(<MemoryRouter initialEntries={[path]}><Routes><Route path={pattern} element={el} /></Routes></MemoryRouter>)

beforeEach(() => {
  mock.tables = {
    profiles: { rows: [{ id: 'me', display_name: 'Anna', status: 'approved' }, { id: 'bea', display_name: 'Bea', status: 'approved' }] },
    puzzles: { single: { id: 'p1', title: 'Alpenpanorama', brand: 'Ravensburger', product_no: '17000', piece_count: 1000, image_path: null, difficulty: 3, notes: null, created_by: 'me' } },
    copies: { rows: [{ id: 'c1', owner_id: 'me', is_lendable: true }] },
    copy_current_state: { rows: [{ copy_id: 'c1', holder_id: 'me', is_on_loan: false }] },
    rounds: { rows: [{ id: 'r1', name: 'Finale', team_size: 1, results_url: 'https://example.org/res', events: { name: 'SPM', year: 2026 } }] },
  }
  mock.rpc = {
    puzzle_list: [
      { puzzle_id: 'p1', title: 'Alpenpanorama', brand: 'Ravensburger', product_no: '17000', piece_count: 1000, image_path: null, difficulty: 3, copies_count: 1, solvers_count: 2, best_seconds: 3000 },
      { puzzle_id: 'p2', title: 'Katzen im Garten', brand: 'Heye', product_no: null, piece_count: 500, image_path: null, difficulty: null, copies_count: 1, solvers_count: 0, best_seconds: null },
    ],
    puzzle_attempts: [{ attempt_id: 'a1', solved_on: '2026-05-01', duration_seconds: 3000, kind: 'official', team_size: 1, participant_names: 'Anna', participant_ids: ['me'], created_by: 'me', notes: 'Rekord', round_id: null }],
    puzzle_leaderboard: [
      { rank: 1, profile_id: 'me', display_name: 'Anna', best_seconds: 3000, pieces_per_minute: '20.00', best_date: '2026-05-01', attempts_count: 2 },
      { rank: 2, profile_id: 'bea', display_name: 'Bea', best_seconds: 3300, pieces_per_minute: '18.18', best_date: '2026-05-02', attempts_count: 1 },
    ],
    shelf_items: [
      { copy_id: 'c1', puzzle_id: 'p1', title: 'Alpenpanorama', brand: 'Ravensburger', product_no: null, piece_count: 1000, image_path: null, owner_id: 'me', owner_name: 'Anna', holder_id: 'bea', holder_name: 'Bea', is_on_loan: true, is_lendable: true, best_seconds: 3000, attempts_count: 2 },
      { copy_id: 'c2', puzzle_id: 'p2', title: 'Katzen im Garten', brand: 'Heye', product_no: null, piece_count: 500, image_path: null, owner_id: 'me', owner_name: 'Anna', holder_id: 'me', holder_name: 'Anna', is_on_loan: false, is_lendable: false, best_seconds: null, attempts_count: 0 },
    ],
    player_summary: [{ attempts_count: 2, distinct_puzzles: 2, avg_seconds: 1800, avg_pieces: 550, total_pieces: 1100, total_seconds: 3600, avg_speed_ppm: '18.33', best_attempt_ppm: '20.00' }],
    player_puzzle_bests: [{ puzzle_id: 'p1', title: 'Alpenpanorama', brand: null, piece_count: 1000, image_path: null, best_seconds: 3000, best_date: '2026-05-01', attempts_count: 2, best_ppm: '20.00', rank: 1, members_count: 2, fastest_seconds: 3000 }],
    player_attempts: [
      { attempt_id: 'a1', solved_on: '2026-01-01', duration_seconds: 600, piece_count: 100, puzzle_id: 'p2', title: 'Klein', kind: 'training', team_size: 1, ppm: '10.00' },
      { attempt_id: 'a2', solved_on: '2026-05-01', duration_seconds: 3000, piece_count: 1000, puzzle_id: 'p1', title: 'Alpenpanorama', kind: 'official', team_size: 1, ppm: '20.00' },
    ],
    member_overview: [{ profile_id: 'me', display_name: 'Anna', copies_owned: 2, copies_held: 2, solved_puzzles: 2, attempts_count: 2 }],
    find_similar_puzzles: [],
    add_puzzle: 'p9',
    add_attempt: 'a9',
  }
  mock.calls = []
})
afterEach(cleanup)

describe('Seiten (Rauchtest)', () => {
  it('Puzzleliste zeigt Karten und filtert per Suche', async () => {
    wrap('/puzzles', '/puzzles', <Puzzles />)
    expect(await screen.findByText('Alpenpanorama')).toBeTruthy()
    expect(screen.getByText('Katzen im Garten')).toBeTruthy()
    await userEvent.type(screen.getByLabelText('Suche'), 'katzen')
    await waitFor(() => expect(screen.queryByText('Alpenpanorama')).toBeNull())
    expect(screen.getByText('Katzen im Garten')).toBeTruthy()
  })

  it('Puzzle-Detail zeigt Stammdaten, Rangliste mit Rückstand und Meisterschaft', async () => {
    wrap('/puzzle/p1', '/puzzle/:id', <PuzzleDetail />)
    expect(await screen.findByRole('heading', { name: 'Alpenpanorama' })).toBeTruthy()
    expect(await screen.findByText('Bea')).toBeTruthy()
    expect(screen.getAllByText('50:00').length).toBeGreaterThan(0)       // 3000 s
    expect(screen.getByText('+5:00')).toBeTruthy()                          // Rückstand von Bea
    expect(screen.getByText(/SPM 2026, Finale/)).toBeTruthy()
    expect(screen.getByText('Zeit erfassen')).toBeTruthy()
  })

  it('Regal sortiert standardmässig nach Teilen aufsteigend und zeigt den Ausleihstatus', async () => {
    wrap('/mein-regal', '/mein-regal', <Shelf own />)
    await screen.findByText('Katzen im Garten')
    const titles = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(titles).toEqual(['Katzen im Garten', 'Alpenpanorama'])           // 500 vor 1000 Teilen
    expect(screen.getByText('ausgeliehen an Bea')).toBeTruthy()
    expect(screen.getByText('nicht ausleihbar')).toBeTruthy()
  })

  it('Profil zeigt Kennzahlen mit Versuchszahl und Unterscheidung der Geschwindigkeiten', async () => {
    wrap('/profil', '/profil', <PlayerProfile own />)
    expect(await screen.findByText('Durchschnittliche Geschwindigkeit')).toBeTruthy()
    expect(screen.getByText('18.33 Teile/Min')).toBeTruthy()
    expect(screen.getByText('Schnellster einzelner Versuch')).toBeTruthy()
    expect(screen.getAllByText(/Basis: 2 Versuche/).length).toBeGreaterThan(0)
    expect(screen.getByText('Rang 1 von 2')).toBeTruthy()
    expect(screen.getByRole('img', { name: /Teile pro Minute je Versuch/ })).toBeTruthy()
  })

  it('Versuch erfassen: ohne Zeit wird nichts gesendet, mit Zeit ein Aufruf mit Sekunden', async () => {
    wrap('/versuch-neu?puzzle=p1', '/versuch-neu', <AttemptNew />)
    await screen.findByRole('option', { name: /Alpenpanorama/ })
    await userEvent.click(screen.getByRole('button', { name: 'Versuch speichern' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(mock.calls.find((c) => c.fn === 'add_attempt')).toBeUndefined()

    await userEvent.type(screen.getByLabelText('Min.'), '50')
    expect(await screen.findByText(/20,00 Teile pro Minute|20\.00 Teile pro Minute/)).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Versuch speichern' }))
    await waitFor(() => expect(mock.calls.find((c) => c.fn === 'add_attempt')).toBeTruthy())
    const args = mock.calls.find((c) => c.fn === 'add_attempt')!.args as Record<string, unknown>
    expect(args.p_duration_seconds).toBe(3000)
    expect(args.p_team_size).toBe(1)
    expect(args.p_participants).toBeNull()
  })

  it('Neues Puzzle: prüft Teilezahl und sendet bei keinen Treffern direkt', async () => {
    wrap('/puzzle-neu', '/puzzle-neu', <PuzzleNew />)
    await userEvent.type(screen.getByLabelText(/Titel/), 'Neues Motiv')
    await userEvent.type(screen.getByLabelText(/Anzahl Teile/), '750')
    await userEvent.click(screen.getByRole('button', { name: 'Puzzle speichern' }))
    await waitFor(() => expect(mock.calls.find((c) => c.fn === 'add_puzzle')).toBeTruthy())
    const args = mock.calls.find((c) => c.fn === 'add_puzzle')!.args as Record<string, unknown>
    expect(args).toMatchObject({ p_title: 'Neues Motiv', p_piece_count: 750, p_add_copy: true, p_image_path: null })
  })

  it('Neues Puzzle: bei ähnlichem Treffer erscheint die Doppelt-Warnung statt dem Speichern', async () => {
    mock.rpc.find_similar_puzzles = [{ puzzle_id: 'p1', title: 'Alpenpanorama', brand: 'Ravensburger', product_no: '17000', piece_count: 1000, image_path: null, reason: 'same_product_no', score: 1 }]
    wrap('/puzzle-neu', '/puzzle-neu', <PuzzleNew />)
    await userEvent.type(screen.getByLabelText(/Titel/), 'Alpenpanorama')
    await userEvent.type(screen.getByLabelText(/Anzahl Teile/), '1000')
    await userEvent.click(screen.getByRole('button', { name: 'Puzzle speichern' }))
    expect(await screen.findByText('Gibt es dieses Puzzle schon?')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Exemplar hinzufügen/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /trotzdem neu anlegen/ })).toBeNull()   // bei gleicher Produktnummer nicht erlaubt
    expect(mock.calls.find((c) => c.fn === 'add_puzzle')).toBeUndefined()
  })

  it('Regalübersicht listet Mitglieder', async () => {
    wrap('/regale', '/regale', <Shelves />)
    expect(await screen.findByRole('heading', { name: 'Anna' })).toBeTruthy()
  })
})

const loan = (o: Record<string, unknown>) => ({
  loan_id: 'l1', copy_id: 'c1', puzzle_id: 'p1', title: 'Alpenpanorama', brand: 'Ravensburger', piece_count: 1000, image_path: null,
  owner_id: 'me', owner_name: 'Anna', borrower_id: 'bea', borrower_name: 'Bea', status: 'requested', message: null,
  requested_at: '2026-10-01T10:00:00Z', accepted_at: null, handed_over_at: null, return_requested_at: null, returned_at: null, copy_busy: false, ...o,
})

describe('Ausleihe (Rauchtest)', () => {
  it('fremdes Regal: «Ausleihe anfragen» sendet Exemplar und Nachricht', async () => {
    mock.rpc.shelf_items = [{ copy_id: 'c9', puzzle_id: 'p1', title: 'Alpenpanorama', brand: null, product_no: null, piece_count: 1000, image_path: null, owner_id: 'bea', owner_name: 'Bea', holder_id: 'bea', holder_name: 'Bea', is_on_loan: false, is_reserved: false, is_lendable: true, best_seconds: null, attempts_count: 0 }]
    wrap('/regal/bea', '/regal/:id', <Shelf />)
    await userEvent.click(await screen.findByRole('button', { name: 'Ausleihe anfragen' }))
    await userEvent.type(screen.getByLabelText(/Nachricht/), 'Für zwei Wochen?')
    await userEvent.click(screen.getByRole('button', { name: 'Anfrage senden' }))
    await waitFor(() => expect(mock.calls.find((c) => c.fn === 'request_loan')).toBeTruthy())
    expect(mock.calls.find((c) => c.fn === 'request_loan')!.args).toEqual({ p_copy: 'c9', p_message: 'Für zwei Wochen?' })
  })

  it('fremdes Regal: nicht freigegebene Puzzles haben keine Anfrage-Schaltfläche', async () => {
    mock.rpc.shelf_items = [{ copy_id: 'c9', puzzle_id: 'p1', title: 'Geschlossen', brand: null, product_no: null, piece_count: 500, image_path: null, owner_id: 'bea', owner_name: 'Bea', holder_id: 'bea', holder_name: 'Bea', is_on_loan: false, is_reserved: false, is_lendable: false, best_seconds: null, attempts_count: 0 }]
    wrap('/regal/bea', '/regal/:id', <Shelf />)
    await screen.findByText('Geschlossen')
    expect(screen.queryByRole('button', { name: 'Ausleihe anfragen' })).toBeNull()
    expect(screen.getByText('Nicht zum Ausleihen freigegeben.')).toBeTruthy()
  })

  it('fremdes Regal: eigene offene Anfrage zeigt den Stand statt der Schaltfläche', async () => {
    mock.rpc.shelf_items = [{ copy_id: 'c9', puzzle_id: 'p1', title: 'Alpenpanorama', brand: null, product_no: null, piece_count: 1000, image_path: null, owner_id: 'bea', owner_name: 'Bea', holder_id: 'bea', holder_name: 'Bea', is_on_loan: false, is_reserved: false, is_lendable: true, best_seconds: null, attempts_count: 0 }]
    mock.rpc.my_loans = [loan({ loan_id: 'l7', copy_id: 'c9', owner_id: 'bea', owner_name: 'Bea', borrower_id: 'me', borrower_name: 'Anna', status: 'accepted' })]
    wrap('/regal/bea', '/regal/:id', <Shelf />)
    expect(await screen.findByText('angenommen')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Ausleihe anfragen' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Zurückziehen' })).toBeTruthy()
  })

  it('eigenes Regal: Freigabe-Schalter und reserviertes Puzzle', async () => {
    mock.rpc.shelf_items = [{ copy_id: 'c1', puzzle_id: 'p1', title: 'Alpenpanorama', brand: null, product_no: null, piece_count: 1000, image_path: null, owner_id: 'me', owner_name: 'Anna', holder_id: 'me', holder_name: 'Anna', is_on_loan: false, is_reserved: true, is_lendable: true, best_seconds: null, attempts_count: 0 }]
    wrap('/mein-regal', '/mein-regal', <Shelf own />)
    expect(await screen.findByLabelText('Zum Ausleihen freigegeben')).toBeTruthy()
    expect(screen.getByText('reserviert')).toBeTruthy()
    expect(screen.getByText(/Nicht möglich, solange das Puzzle reserviert/)).toBeTruthy()
  })

  it('Ausleihanfragen: Annehmen sendet die Zusage, bei vergebenem Puzzle ist sie gesperrt', async () => {
    mock.rpc.my_loans = [loan({}), loan({ loan_id: 'l2', borrower_id: 'cor', borrower_name: 'Cor', copy_busy: true, title: 'Katzen' })]
    wrap('/ausleihen/anfragen', '/ausleihen/anfragen', <LoanRequests />)
    await screen.findByText('Offene Anfragen (2)')
    const buttons = screen.getAllByRole('button', { name: 'Annehmen' }) as HTMLButtonElement[]
    expect(buttons[0].disabled).toBe(false)
    expect(buttons[1].disabled).toBe(true)
    expect(screen.getByText('Bereits an jemand anderen vergeben.')).toBeTruthy()
    await userEvent.click(buttons[0])
    await waitFor(() => expect(mock.calls.find((c) => c.fn === 'respond_loan')).toBeTruthy())
    expect(mock.calls.find((c) => c.fn === 'respond_loan')!.args).toEqual({ p_loan: 'l1', p_accept: true })
  })

  it('Ausleihanfragen: angenommen → Übergabe bestätigen, ausgeliehen → Rückgabe bestätigen', async () => {
    mock.rpc.my_loans = [loan({ status: 'accepted' }), loan({ loan_id: 'l3', status: 'return_requested', title: 'Katzen' })]
    wrap('/ausleihen/anfragen', '/ausleihen/anfragen', <LoanRequests />)
    await userEvent.click(await screen.findByRole('button', { name: 'Übergabe bestätigen' }))
    await waitFor(() => expect(mock.calls.some((c) => c.fn === 'confirm_handover')).toBe(true))
    expect(screen.getByRole('button', { name: 'Rückgabe bestätigen' })).toBeTruthy()
  })

  it('Eigene Ausleihen: zeigt Standort der eigenen Puzzles, Rückgabe melden und Verlauf', async () => {
    mock.rpc.shelf_items = [{ copy_id: 'c1', puzzle_id: 'p1', title: 'Alpenpanorama', brand: null, product_no: null, piece_count: 1000, image_path: null, owner_id: 'me', owner_name: 'Anna', holder_id: 'bea', holder_name: 'Bea', is_on_loan: true, is_reserved: false, is_lendable: true, best_seconds: null, attempts_count: 0 }]
    mock.rpc.my_loans = [
      loan({ loan_id: 'l5', owner_id: 'cor', owner_name: 'Cor', borrower_id: 'me', borrower_name: 'Anna', status: 'lent', title: 'Katzen' }),
      loan({ loan_id: 'l6', status: 'returned', returned_at: '2026-09-01T10:00:00Z' }),
    ]
    wrap('/ausleihen/meine', '/ausleihen/meine', <MyLoans />)
    expect(await screen.findByText('bei Bea')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Rückgabe melden' }))
    await waitFor(() => expect(mock.calls.find((c) => c.fn === 'request_return')).toBeTruthy())
    expect(screen.getByText('Verlauf (1)')).toBeTruthy()
    expect(screen.getByText('zurückgegeben')).toBeTruthy()
  })

  it('Mitteilungen: zeigt Text und Ungelesen-Markierung', async () => {
    mock.tables.notifications = { rows: [{ id: 'n1', type: 'loan_requested', payload: { borrower_name: 'Bea', puzzle_title: 'Alpen', page: 'requests' }, read_at: null, created_at: '2026-10-01T10:00:00Z' }] }
    wrap('/mitteilungen', '/mitteilungen', <Notifications />)
    expect(await screen.findByText('Bea möchte «Alpen» ausleihen.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Alle als gelesen markieren' })).toBeTruthy()
    expect((screen.getByRole('link', { name: 'Öffnen' }) as HTMLAnchorElement).getAttribute('href')).toBe('/ausleihen/anfragen')
  })
})
