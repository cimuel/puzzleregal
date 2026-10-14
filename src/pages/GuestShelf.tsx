import { Link } from 'react-router-dom'
import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { rpc, type GuestItem } from '../lib/api'
import { formatDate, formatInt } from '../lib/time'
import { useAsync } from '../hooks/useAsync'
import { Button, Spinner } from '../components/ui'
import { Chip, ErrorBox, PuzzleImage } from '../components/Parts'

/** Alle Puzzles, die gerade bei Gästen ohne Konto sind. Sie lassen sich in dieser Zeit nicht ausleihen. */
export function GuestShelf() {
  const { profile } = useAuth()
  const items = useAsync(() => rpc<GuestItem[]>('guest_items'), [])
  const [error, setError] = useState<string | null>(null)

  async function back(copyId: string) {
    try { await rpc('return_from_guest', { p_copy: copyId }); setError(null); items.reload() } catch (e) { setError(e instanceof Error ? e.message : 'Unbekannter Fehler.') }
  }

  if (items.loading && !items.data) return <Spinner />
  const list = items.data ?? []
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold">Gästeregal</h1>
      <p className="max-w-prose text-ink-soft">
        Hier stehen Puzzles von Mitgliedern, die gerade bei Freunden ohne Konto sind. So siehst du, wo sie sind, und dass du sie nicht
        ausleihen kannst. Eigene Puzzles trägst du in <Link className="text-teal-dark underline" to="/mein-regal">deinem Regal</Link> ein
        («An einen Gast ohne Konto ausgeliehen»).
      </p>
      <ErrorBox message={error ?? items.error} />
      {list.length === 0 ? <p className="text-ink-soft">Gerade ist kein Puzzle bei einem Gast.</p> : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((r) => (
            <li key={r.copy_id} className="flex flex-col overflow-hidden rounded-xl border border-line bg-card">
              <Link to={`/puzzle/${r.puzzle_id}`}><PuzzleImage path={r.image_path} alt={r.title} className="aspect-[4/3] w-full" /></Link>
              <div className="flex flex-1 flex-col gap-2 p-3">
                <h2 className="text-lg font-bold leading-tight"><Link className="hover:text-teal-dark" to={`/puzzle/${r.puzzle_id}`}>{r.title}</Link></h2>
                <p className="text-ink-soft">{[r.brand, `${formatInt(r.piece_count)} Teile`].filter(Boolean).join(', ')}</p>
                <p className="text-sm">Gehört <Link className="text-teal-dark underline" to={`/regal/${r.owner_id}`}>{r.owner_name}</Link></p>
                <p className="text-sm">Bei: <strong>{r.guest_name ?? 'einem Gast'}</strong> · seit {formatDate(r.guest_since)}</p>
                <div className="mt-auto flex flex-wrap items-center gap-2 pt-1"><Chip tone="warn">nicht ausleihbar</Chip>
                  {r.owner_id === profile?.id && <Button variant="secondary" onClick={() => back(r.copy_id)}>Vom Gast zurück erhalten</Button>}</div>
              </div>
            </li>))}
        </ul>)}
    </div>
  )
}
