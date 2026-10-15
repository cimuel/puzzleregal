// @vitest-environment jsdom
// Rauchtest: Seiten mit nachgebildeten Daten rendern. Prüft Laufzeitfehler und Kernanzeigen, nicht das Aussehen.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
import { GuestShelf } from './GuestShelf'
import { Championships } from './Championships'
import { RoundResults } from './RoundResults'
import { AdminImport } from './AdminImport'

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
    guest_items: [],
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
    expect(screen.getAllByText(/Nicht möglich, solange das Puzzle reserviert/).length).toBeGreaterThan(0)
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

const shelfRow = (o: Record<string, unknown>) => ({ copy_id: 'c1', puzzle_id: 'p1', title: 'Alpenpanorama', brand: null, product_no: null, piece_count: 1000, image_path: null,
  owner_id: 'me', owner_name: 'Anna', holder_id: 'me', holder_name: 'Anna', is_on_loan: false, is_reserved: false, is_lendable: true, best_seconds: null, attempts_count: 0,
  is_with_guest: false, guest_name: null, guest_since: null, ...o })

describe('Gästeregal (Rauchtest)', () => {
  it('eigenes Regal: Puzzle an einen Gast eintragen sendet Exemplar und Name', async () => {
    mock.rpc.shelf_items = [shelfRow({})]
    wrap('/mein-regal', '/mein-regal', <Shelf own />)
    await screen.findByText('Alpenpanorama')
    await userEvent.click(screen.getByText('An einen Gast ohne Konto ausgeliehen'))
    await userEvent.type(screen.getByLabelText('Name des Gastes (optional)'), 'Michael')
    await userEvent.click(screen.getByRole('button', { name: 'Eintragen' }))
    await waitFor(() => expect(mock.calls.find((c) => c.fn === 'lend_to_guest')).toBeTruthy())
    expect(mock.calls.find((c) => c.fn === 'lend_to_guest')!.args).toEqual({ p_copy: 'c1', p_guest_name: 'Michael' })
  })

  it('eigenes Regal: ohne Namen wird kein Name gesendet', async () => {
    mock.rpc.shelf_items = [shelfRow({})]
    wrap('/mein-regal', '/mein-regal', <Shelf own />)
    await screen.findByText('Alpenpanorama')
    await userEvent.click(screen.getByText('An einen Gast ohne Konto ausgeliehen'))
    await userEvent.click(screen.getByRole('button', { name: 'Eintragen' }))
    await waitFor(() => expect(mock.calls.find((c) => c.fn === 'lend_to_guest')).toBeTruthy())
    expect(mock.calls.find((c) => c.fn === 'lend_to_guest')!.args).toEqual({ p_copy: 'c1', p_guest_name: null })
  })

  it('eigenes Regal: Puzzle bei Gast zeigt den Namen und lässt sich zurückmelden', async () => {
    mock.rpc.shelf_items = [shelfRow({ is_with_guest: true, guest_name: 'Michael', guest_since: '2026-10-01T10:00:00Z' })]
    wrap('/mein-regal', '/mein-regal', <Shelf own />)
    expect(await screen.findByText('bei Gast (Michael)')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Vom Gast zurück erhalten' }))
    await waitFor(() => expect(mock.calls.find((c) => c.fn === 'return_from_guest')).toBeTruthy())
    expect(mock.calls.find((c) => c.fn === 'return_from_guest')!.args).toEqual({ p_copy: 'c1' })
  })

  it('fremdes Regal: Puzzle bei Gast hat keine Anfrage-Schaltfläche und sagt warum', async () => {
    mock.rpc.shelf_items = [shelfRow({ owner_id: 'bea', owner_name: 'Bea', holder_id: 'bea', holder_name: 'Bea', is_with_guest: true, guest_name: 'Michael' })]
    wrap('/regal/bea', '/regal/:id', <Shelf />)
    expect(await screen.findByText(/Gerade bei einem Gast \(Michael\)/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Ausleihe anfragen' })).toBeNull()
  })

  it('Gästeregal-Seite listet Puzzles mit Besitzer und Gast, nur der Besitzer sieht «zurück erhalten»', async () => {
    mock.rpc.guest_items = [
      { copy_id: 'c1', puzzle_id: 'p1', title: 'Alpenpanorama', brand: null, piece_count: 1000, image_path: null, owner_id: 'me', owner_name: 'Anna', guest_name: 'Michael', guest_since: '2026-10-01T10:00:00Z' },
      { copy_id: 'c2', puzzle_id: 'p2', title: 'Katzen im Garten', brand: null, piece_count: 500, image_path: null, owner_id: 'bea', owner_name: 'Bea', guest_name: null, guest_since: '2026-10-02T10:00:00Z' },
    ]
    wrap('/gaesteregal', '/gaesteregal', <GuestShelf />)
    expect(await screen.findByText('Michael')).toBeTruthy()
    expect(screen.getByText('einem Gast')).toBeTruthy()           // ohne Namen
    expect(screen.getAllByText('nicht ausleihbar')).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Vom Gast zurück erhalten' })).toHaveLength(1)
  })

  it('Gästeregal-Seite: leer zeigt einen verständlichen Hinweis', async () => {
    wrap('/gaesteregal', '/gaesteregal', <GuestShelf />)
    expect(await screen.findByText('Gerade ist kein Puzzle bei einem Gast.')).toBeTruthy()
  })
})

const ROUND = { round_id: 'r1', event_name: 'SPM 2026', event_year: 2026, round_name: 'Finale', team_size: 4, piece_count: 1000, time_limit_seconds: 7200,
  results_url: 'https://worldjigsawpuzzle.org/x', puzzle_id: 'p1', puzzle_title: 'Lavaux Vineyards', puzzle_name_source: 'Lavaux Vineyards', entries_count: 2, linked_members: 1, fetched_at: '2026-10-14T03:00:00Z' }

describe('Wettkampf (Rauchtest)', () => {
  it('Meisterschaften: zeigt Runden mit Puzzle, Teilezahl und Anzahl Einträge', async () => {
    mock.rpc.rounds_overview = [ROUND, { ...ROUND, round_id: 'r2', round_name: 'E', entries_count: 0, linked_members: 0, puzzle_id: null, puzzle_title: null }]
    wrap('/meisterschaften', '/meisterschaften', <Championships />)
    expect(await screen.findByText('SPM 2026 2026')).toBeTruthy()
    expect(screen.getByText('2 Einträge')).toBeTruthy()
    expect(screen.getByText('keine Resultate')).toBeTruthy()
    expect(screen.getByText('1 aus der Community')).toBeTruthy()
  })

  it('Rundenresultate: Gleichstand, Nicht-fertig und Community-Markierung', async () => {
    mock.rpc.rounds_overview = [ROUND]
    mock.tables.official_results = { rows: [
      { id: 'o1', rank: 27, entry_name: 'Kniffle Drachen', country: 'Switzerland', status: 'finished', finish_seconds: 6022, pieces_placed: null, fetched_at: 'x', official_result_members: [{ id: 'm1', member_name: 'Janin Sommer', wjpc_slug: 'janin-sommer', profile_id: null }] },
      { id: 'o2', rank: 35, entry_name: 'Fast Pi', country: 'Switzerland', status: 'finished', finish_seconds: 6403, pieces_placed: null, fetched_at: 'x', official_result_members: [{ id: 'm2', member_name: 'Corina Spreiter', wjpc_slug: 'corina-spreiter', profile_id: 'me' }] },
      { id: 'o3', rank: 51, entry_name: 'Oktopuzzlers', country: 'Switzerland', status: 'unfinished', finish_seconds: null, pieces_placed: 992, fetched_at: 'x', official_result_members: [] },
    ] }
    wrap('/runde/r1', '/runde/:id', <RoundResults />)
    expect(await screen.findByText('Fast Pi')).toBeTruthy()
    expect(screen.getByText('1:46:43')).toBeTruthy()
    expect(screen.getByText(/nicht fertig \(992 Teile\)/)).toBeTruthy()
    expect(screen.getByText('Community')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Corina Spreiter' }).getAttribute('href')).toBe('/person/me')
    expect(screen.getByRole('link', { name: 'Lavaux Vineyards' })).toBeTruthy()
  })

  it('Rangschätzung auf der Puzzle-Seite: zeigt Hypothese mit Quelle, und Gründe bei Nicht-Vergleichbarem', async () => {
    mock.rpc.puzzle_attempts = [
      { attempt_id: 'a1', solved_on: '2026-05-01', duration_seconds: 6403, kind: 'training', team_size: 4, participant_names: 'Anna', participant_ids: ['me'], created_by: 'me', notes: null, round_id: null },
    ]
    mock.rpc.rank_estimates = [
      { round_id: 'r1', event_name: 'SPM 2026', event_year: 2026, round_name: 'Finale', round_team_size: 4, piece_count: 1000, time_limit_seconds: 7200, results_url: 'https://worldjigsawpuzzle.org/x', eligible: true, reason: null, estimated_rank: 35, finished_count: 50, entries_count: 70, faster_count: 34, same_time_count: 0, fetched_at: '2026-10-14T03:00:00Z' },
      { round_id: 'r2', event_name: 'SPM 2026', event_year: 2026, round_name: 'E', round_team_size: 1, piece_count: 1000, time_limit_seconds: 7200, results_url: null, eligible: false, reason: 'different_format', estimated_rank: null, finished_count: 20, entries_count: 20, faster_count: 0, same_time_count: 0, fetched_at: null },
    ]
    wrap('/puzzle/p1', '/puzzle/:id', <PuzzleDetail />)
    expect(await screen.findByText('Hypothetische Rangschätzung')).toBeTruthy()
    expect(await screen.findByText(/etwa auf Rang 35 von 50 fertigen Einträgen/)).toBeTruthy()
    expect(screen.getByText(/Quelle: offizielle Ergebnisliste/)).toBeTruthy()
    expect(screen.getByText(/Einzel-, Paar- und Teamzeiten sind nicht vergleichbar/)).toBeTruthy()
    const call = mock.calls.filter((c) => c.fn === 'rank_estimates').at(-1)!
    expect(call.args).toEqual({ p_puzzle: 'p1', p_seconds: 6403, p_team_size: 4 })
  })

  it('Rangschätzung: ohne eigene Zeit wird zuerst zum Erfassen aufgefordert', async () => {
    mock.rpc.puzzle_attempts = []
    wrap('/puzzle/p1', '/puzzle/:id', <PuzzleDetail />)
    expect(await screen.findByText(/noch keine Zeit erfasst/)).toBeTruthy()
    expect(mock.calls.find((c) => c.fn === 'rank_estimates')).toBeUndefined()
  })

  it('Profil: zeigt offizielle Resultate mit Rang von Anzahl', async () => {
    mock.rpc.player_official_results = [{ result_id: 'o2', round_id: 'r1', event_name: 'SPM 2026', event_year: 2026, round_name: 'Finale', team_size: 4, entry_name: 'Fast Pi', rank: 35, status: 'finished', finish_seconds: 6403, pieces_placed: null, piece_count: 1000, entries_count: 70, puzzle_id: 'p1', puzzle_title: 'Lavaux Vineyards' }]
    wrap('/profil', '/profil', <PlayerProfile own />)
    expect(await screen.findByText('Offizielle Resultate')).toBeTruthy()
    expect(screen.getByText(/von 70/)).toBeTruthy()
    expect(screen.getByText(/Fast Pi/)).toBeTruthy()
  })
})

const FLAG = '<img title="Switzerland">'
const IMPORT_PAGE = `<html><head><title>Classification SPM Schweizer Puzzle Meisterschaft 2026 - Teams</title>
<link rel="canonical" href="https://worldjigsawpuzzle.org/schweizerpuzzlemeisterschaft/2026/teams/finale"></head><body>
<div><span>1.000</span><span>02:00:00</span></div><img src="https://x/img/puzzles/a.jpg" alt="Lavaux Vineyards">
<table><thead><tr><th>#</th><th></th><th>Name</th><th>Origin</th><th>Country</th><th>Time</th></tr></thead><tbody>
<tr><td>1</td><td>${FLAG}</td><td>${FLAG} Switzerland <b>Magical</b> <a href="https://worldjigsawpuzzle.org/player/stefan-enzler">Stefan Enzler</a> / Helene Beutler / A B / C D Bern</td><td>Bern</td><td>Switzerland</td><td>00:58:03</td></tr>
<tr><td>35</td><td>${FLAG}</td><td>${FLAG} Switzerland <b>Fast Pi</b> <a href="https://worldjigsawpuzzle.org/player/corina-spreiter">Corina Spreiter</a> / Cinja Müller / Caroline Böttger / Severina Haas Aarau</td><td>Aarau</td><td>Switzerland</td><td>01:46:43</td></tr>
<tr><td>51</td><td>${FLAG}</td><td>${FLAG} Switzerland <b>Oktopuzzlers</b> E F / G H / I J / K L Sursee</td><td>Sursee</td><td>Switzerland</td><td>992 Pieces</td></tr>
</tbody></table></body></html>`

describe('Import (Rauchtest)', () => {
  it('Datei einlesen → Vorschau mit Zahlen → Formular vorbelegt → Import sendet Runde und Zeilen', async () => {
    mock.rpc.find_similar_puzzles = [{ puzzle_id: 'p1', title: 'Lavaux Vineyards', brand: null, product_no: null, piece_count: 1000, image_path: null, reason: 'similar_title', score: 0.9 }]
    mock.rpc.admin_ensure_round = 'r9'
    mock.rpc.import_round_results = { imported: 3, members: 12, linked: 1 }
    wrap('/admin/import', '/admin/import', <AdminImport />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(input, new File([IMPORT_PAGE], 'finale.html', { type: 'text/html' }))
    expect(await screen.findByText('3 Einträge')).toBeTruthy()
    expect(screen.getByText(/2 fertig, 1 nicht fertig/)).toBeTruthy()
    expect((screen.getByLabelText('Meisterschaft') as HTMLInputElement).value).toBe('SPM Schweizer Puzzle Meisterschaft 2026')
    expect((screen.getByLabelText('Runde') as HTMLInputElement).value).toBe('Finale')
    expect((screen.getByLabelText('Teilezahl der Runde') as HTMLInputElement).value).toBe('1000')
    expect((screen.getByLabelText('Zeitlimit') as HTMLInputElement).value).toBe('2:00:00')
    await waitFor(() => expect((screen.getByLabelText('Puzzle der Runde') as HTMLSelectElement).value).toBe('p1'))   // Vorschlag automatisch übernommen

    await userEvent.click(screen.getByRole('button', { name: '3 Resultate importieren' }))
    await waitFor(() => expect(mock.calls.find((c) => c.fn === 'import_round_results')).toBeTruthy())
    const ensure = mock.calls.find((c) => c.fn === 'admin_ensure_round')!.args as Record<string, unknown>
    expect(ensure).toMatchObject({ p_event_name: 'SPM Schweizer Puzzle Meisterschaft 2026', p_event_year: 2026, p_round_name: 'Finale', p_team_size: 4, p_piece_count: 1000, p_time_limit_seconds: 7200, p_puzzle: 'p1', p_puzzle_name_source: 'Lavaux Vineyards' })
    const imp = mock.calls.find((c) => c.fn === 'import_round_results')!.args as { p_round: string; p_rows: { rank: number; entry_name: string; members: { name: string; slug: string | null }[] }[] }
    expect(imp.p_round).toBe('r9')
    expect(imp.p_rows.map((r) => r.rank)).toEqual([1, 35, 51])
    expect(imp.p_rows[1].members.map((m) => m.name)).toEqual(['Corina Spreiter', 'Cinja Müller', 'Caroline Böttger', 'Severina Haas'])
    expect(imp.p_rows[1].members[0].slug).toBe('corina-spreiter')
    expect(await screen.findByText(/Importiert: 3 Einträge, 1 Personen/)).toBeTruthy()
  })

  it('CSV-Weg: Text einlesen und Vorschau zeigen', async () => {
    wrap('/admin/import', '/admin/import', <AdminImport />)
    await userEvent.click(screen.getByText('CSV oder Text einfügen'))
    fireEvent.change(screen.getByPlaceholderText(/Rang;Name;Mitglieder/), { target: { value: 'Rang;Name;Mitglieder;Land;Zeit\n1;Fast Pi;Corina / Cinja / Caroline / Severina;Schweiz;1:46:43\n2;Andere;Anna / Bea;Schweiz;992 Pieces' } })
    await userEvent.click(screen.getByRole('button', { name: 'Einlesen' }))
    expect(await screen.findByText('2 Einträge')).toBeTruthy()
    expect(screen.getByText('Corina, Cinja, Caroline, Severina')).toBeTruthy()
    expect(screen.getByText('1:46:43')).toBeTruthy()
  })

  it('Datei ohne Tabelle zeigt einen verständlichen Fehler und bietet keinen Import an', async () => {
    wrap('/admin/import', '/admin/import', <AdminImport />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(input, new File(['<html><body>nichts</body></html>'], 'leer.html', { type: 'text/html' }))
    expect(await screen.findByText(/Keine Ergebniszeilen gefunden/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Resultate importieren/ })).toBeNull()
  })
})
