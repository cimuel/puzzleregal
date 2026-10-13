import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { rpc, type ShelfRow } from '../lib/api'
import { formatDuration, formatInt } from '../lib/time'
import { useAsync } from '../hooks/useAsync'
import { useMembers } from '../hooks/useMembers'
import { supabase } from '../lib/supabase'
import { friendlyError } from '../lib/errors'
import { useMyLoans } from '../hooks/useMyLoans'
import { Button, Spinner } from '../components/ui'
import { Chip, ErrorBox, PuzzleImage } from '../components/Parts'
import { RequestLoan } from '../components/Loans'

const sorts = [['pieces', 'Anzahl Teile'], ['time', 'Beste Lösungszeit'], ['brand', 'Marke'], ['availability', 'Verfügbarkeit']] as const

function OwnCopyTools({ row, members, onChange }: { row: ShelfRow; members: { id: string; display_name: string }[]; onChange: () => void }) {
  const [to, setTo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const busy = row.is_on_loan || row.is_reserved

  async function toggle(next: boolean) {
    const { error: err } = await supabase.from('copies').update({ is_lendable: next }).eq('id', row.copy_id)
    if (err) return setError(friendlyError(err.message))
    setError(null); onChange()
  }
  async function transfer() {
    if (!to || !window.confirm(`«${row.title}» wirklich an ${members.find((m) => m.id === to)?.display_name} übertragen? Das Puzzle gehört dann nicht mehr dir.`)) return
    try { await rpc('transfer_copy', { p_copy: row.copy_id, p_new_owner: to }); setError(null); onChange() } catch (e) { setError(e instanceof Error ? e.message : 'Unbekannter Fehler.') }
  }
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-2 text-sm">
      <label className="flex items-center gap-2"><input type="checkbox" className="size-5" checked={row.is_lendable} onChange={(e) => toggle(e.target.checked)} />Zum Ausleihen freigegeben</label>
      <details><summary className="cursor-pointer text-teal-dark underline">Eigentum übertragen</summary>
        <div className="mt-2 flex flex-wrap gap-2">
          <select aria-label="Neue Besitzerin oder neuer Besitzer" value={to} onChange={(e) => setTo(e.target.value)} className="min-h-10 rounded-lg border border-line bg-white px-2"><option value="">Person wählen</option>{members.map((m) => <option key={m.id} value={m.id}>{m.display_name}</option>)}</select>
          <Button variant="secondary" disabled={!to || busy} onClick={transfer}>Übertragen</Button>
        </div>
        {busy && <p className="mt-1 text-ink-soft">Nicht möglich, solange das Puzzle reserviert oder verliehen ist.</p>}
      </details>
      <ErrorBox message={error} />
    </div>
  )
}

export function Shelf({ own = false }: { own?: boolean }) {
  const params = useParams()
  const { profile } = useAuth()
  const members = useMembers()
  const ownerId = own ? profile?.id : params.id
  const [sort, setSort] = useState<(typeof sorts)[number][0]>('pieces')
  const [onlyLendable, setOnlyLendable] = useState(false)
  const loans = useMyLoans()
  const shelf = useAsync(() => (ownerId ? rpc<ShelfRow[]>('shelf_items', { p_profile: ownerId }) : Promise.resolve([] as ShelfRow[])), [ownerId])
  const name = own ? profile?.display_name : members.names.get(ownerId ?? '')
  const isMine = ownerId === profile?.id

  const rows = useMemo(() => {
    const list = (shelf.data ?? []).filter((r) => !onlyLendable || (r.is_lendable && !r.is_on_loan))
    const byPieces = (a: ShelfRow, b: ShelfRow) => a.piece_count - b.piece_count || a.title.localeCompare(b.title, 'de')
    const cmp = {
      pieces: byPieces,
      time: (a: ShelfRow, b: ShelfRow) => (a.best_seconds ?? Infinity) - (b.best_seconds ?? Infinity) || byPieces(a, b),
      brand: (a: ShelfRow, b: ShelfRow) => (a.brand ?? '\uffff').localeCompare(b.brand ?? '\uffff', 'de') || byPieces(a, b),
      availability: (a: ShelfRow, b: ShelfRow) => Number(a.is_on_loan) - Number(b.is_on_loan) || Number(b.is_lendable) - Number(a.is_lendable) || byPieces(a, b),
    }[sort]
    return [...list].sort(cmp)
  }, [shelf.data, sort, onlyLendable])

  if (!ownerId || (shelf.loading && !shelf.data)) return <Spinner />
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-3xl font-bold">{isMine ? 'Mein Regal' : `Regal von ${name ?? '…'}`}</h1>
          <p className="text-ink-soft"><Link className="text-teal-dark underline" to={isMine ? '/profil' : `/person/${ownerId}`}>Profil und Statistiken</Link></p></div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2"><input type="checkbox" className="size-5" checked={onlyLendable} onChange={(e) => setOnlyLendable(e.target.checked)} />Nur verfügbare</label>
          <select aria-label="Sortierung" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="min-h-11 rounded-lg border border-line bg-white px-3">
            {sorts.map(([v, l]) => <option key={v} value={v}>Sortiert nach: {l}</option>)}
          </select>
        </div>
      </div>
      <ErrorBox message={shelf.error} />
      {rows.length === 0 ? <p className="text-ink-soft">{shelf.data?.length ? 'Keine Puzzles mit diesem Filter.' : isMine ? <>Dein Regal ist noch leer. <Link className="text-teal-dark underline" to="/puzzle-neu">Erfasse dein erstes Puzzle.</Link></> : 'Dieses Regal ist noch leer.'}</p> : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((r) => {
            const borrowed = r.owner_id !== ownerId
            return (
              <li key={r.copy_id} className="flex flex-col overflow-hidden rounded-xl border border-line bg-card">
                <Link to={`/puzzle/${r.puzzle_id}`}><PuzzleImage path={r.image_path} alt={r.title} className="aspect-[4/3] w-full" /></Link>
                <div className="flex flex-1 flex-col gap-2 p-3">
                  <h2 className="text-lg font-bold leading-tight"><Link to={`/puzzle/${r.puzzle_id}`} className="hover:text-teal-dark">{r.title}</Link></h2>
                  <p className="text-ink-soft">{[r.brand, `${formatInt(r.piece_count)} Teile`].filter(Boolean).join(', ')}</p>
                  <p className="text-sm">Beste Zeit {name ? `von ${name}` : ''}: <strong>{formatDuration(r.best_seconds)}</strong> · {r.attempts_count} {r.attempts_count === 1 ? 'Versuch' : 'Versuche'}</p>
                  <div className="mt-auto flex flex-wrap gap-2 pt-1">
                    {borrowed ? <Chip tone="warn">ausgeliehen von {r.owner_name}</Chip> : r.is_on_loan ? <Chip tone="warn">ausgeliehen an {r.holder_name}</Chip> : r.is_reserved ? <Chip tone="warn">reserviert</Chip> : <Chip tone="good">zu Hause</Chip>}
                    {r.is_lendable && !borrowed ? <Chip>ausleihbar</Chip> : !borrowed && <Chip>nicht ausleihbar</Chip>}
                  </div>
                  {r.owner_id === profile?.id
                    ? <OwnCopyTools row={r} members={members.approved.filter((m) => m.id !== profile?.id)} onChange={() => { shelf.reload(); loans.reload() }} />
                    : r.is_lendable
                      ? <RequestLoan copyId={r.copy_id} mine={loans.myActiveByCopy.get(r.copy_id)} onDone={() => { shelf.reload(); loans.reload() }} />
                      : <p className="text-sm text-ink-soft">Nicht zum Ausleihen freigegeben.</p>}
                </div>
              </li>)
          })}
        </ul>)}
    </div>
  )
}
