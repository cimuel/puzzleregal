import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { rpc, type PuzzleListRow } from '../lib/api'
import { useAsync } from '../hooks/useAsync'
import { ErrorBox, PuzzleCard } from '../components/Parts'
import { Spinner } from '../components/ui'

const buckets = [
  ['', 'Alle Teilezahlen'], ['0-499', 'bis 499'], ['500-999', '500 bis 999'], ['1000-1999', '1000 bis 1999'], ['2000-99999', '2000 und mehr'],
] as const
const sorts = [
  ['title', 'Name'], ['pieces-asc', 'Teile aufsteigend'], ['pieces-desc', 'Teile absteigend'], ['best', 'Beste Zeit'], ['solvers', 'Meiste Löser'],
] as const

export function Puzzles() {
  const { data, error, loading } = useAsync(() => rpc<PuzzleListRow[]>('puzzle_list'), [])
  const [q, setQ] = useState('')
  const [brand, setBrand] = useState('')
  const [bucket, setBucket] = useState('')
  const [sort, setSort] = useState('title')

  const brands = useMemo(() => [...new Set((data ?? []).map((p) => p.brand).filter((b): b is string => !!b))].sort(), [data])
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const [lo, hi] = bucket ? bucket.split('-').map(Number) : [0, Infinity]
    const list = (data ?? []).filter((p) =>
      (!needle || [p.title, p.brand, p.product_no].some((v) => v?.toLowerCase().includes(needle))) &&
      (!brand || p.brand === brand) && p.piece_count >= lo && p.piece_count <= hi)
    const cmp: Record<string, (a: PuzzleListRow, b: PuzzleListRow) => number> = {
      title: (a, b) => a.title.localeCompare(b.title, 'de'),
      'pieces-asc': (a, b) => a.piece_count - b.piece_count || a.title.localeCompare(b.title, 'de'),
      'pieces-desc': (a, b) => b.piece_count - a.piece_count || a.title.localeCompare(b.title, 'de'),
      best: (a, b) => (a.best_seconds ?? Infinity) - (b.best_seconds ?? Infinity),
      solvers: (a, b) => b.solvers_count - a.solvers_count,
    }
    return [...list].sort(cmp[sort])
  }, [data, q, brand, bucket, sort])

  const field = 'min-h-11 rounded-lg border border-line bg-white px-3 py-2'
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">Alle Puzzles</h1>
        <Link to="/puzzle-neu" className="inline-flex min-h-11 items-center rounded-lg bg-teal px-4 font-semibold text-white hover:bg-teal-dark">Neues Puzzle erfassen</Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <input type="search" aria-label="Suche" placeholder="Titel, Marke oder Produktnummer" value={q} onChange={(e) => setQ(e.target.value)} className={`${field} sm:col-span-2 lg:col-span-1`} />
        <select aria-label="Marke" value={brand} onChange={(e) => setBrand(e.target.value)} className={field}>
          <option value="">Alle Marken</option>{brands.map((b) => <option key={b}>{b}</option>)}
        </select>
        <select aria-label="Teilezahl" value={bucket} onChange={(e) => setBucket(e.target.value)} className={field}>
          {buckets.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select aria-label="Sortierung" value={sort} onChange={(e) => setSort(e.target.value)} className={field}>
          {sorts.map(([v, l]) => <option key={v} value={v}>Sortiert nach: {l}</option>)}
        </select>
      </div>
      <ErrorBox message={error} />
      {loading && !data ? <Spinner /> : rows.length === 0 ? (
        <p className="text-ink-soft">{data?.length ? 'Keine Puzzles gefunden. Passe die Suche oder die Filter an.' : 'Noch keine Puzzles. Erfasse das erste mit «Neues Puzzle erfassen».'}</p>
      ) : (
        <>
          <p className="text-ink-soft">{rows.length} {rows.length === 1 ? 'Puzzle' : 'Puzzles'}</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{rows.map((p) => <PuzzleCard key={p.puzzle_id} p={p} />)}</div>
        </>
      )}
    </div>
  )
}
