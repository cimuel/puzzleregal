import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { rpc, type RoundOverviewRow } from '../lib/api'
import { teamLabel } from '../lib/rank'
import { formatDate, formatDuration, formatInt } from '../lib/time'
import { useAsync } from '../hooks/useAsync'
import { Chip, ErrorBox } from '../components/Parts'
import { Spinner } from '../components/ui'

export function Championships() {
  const { profile } = useAuth()
  const { data, error, loading } = useAsync(() => rpc<RoundOverviewRow[]>('rounds_overview'), [])
  if (loading && !data) return <Spinner />
  const events = new Map<string, RoundOverviewRow[]>()
  for (const r of data ?? []) events.set(`${r.event_name} ${r.event_year}`, [...(events.get(`${r.event_name} ${r.event_year}`) ?? []), r])
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">Meisterschaften</h1>
        {profile?.role === 'admin' && <Link to="/admin/import" className="inline-flex min-h-11 items-center rounded-lg bg-teal px-4 font-semibold text-white hover:bg-teal-dark">Resultate importieren</Link>}
      </div>
      <p className="max-w-prose text-ink-soft">Offizielle Ergebnislisten der Meisterschaften, mit denen du dich vergleichen kannst. Die Daten stammen von der jeweiligen Ergebnisseite und wurden von einem Admin importiert.</p>
      <ErrorBox message={error} />
      {events.size === 0 && <p className="text-ink-soft">Noch keine Meisterschaften erfasst.{profile?.role === 'admin' ? ' Importiere die erste Ergebnisliste oben.' : ''}</p>}
      {[...events.entries()].map(([name, rounds]) => (
        <section key={name}>
          <h2 className="mb-2 text-xl font-bold">{name}</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {rounds.map((r) => (
              <li key={r.round_id} className="rounded-xl border border-line bg-card p-4">
                <p className="text-lg font-bold"><Link className="hover:text-teal-dark" to={`/runde/${r.round_id}`}>{r.round_name}</Link> <span className="font-normal text-ink-soft">({teamLabel(r.team_size)})</span></p>
                <p className="text-sm text-ink-soft">{r.piece_count ? `${formatInt(r.piece_count)} Teile` : 'Teilezahl unbekannt'}{r.time_limit_seconds ? ` · Zeitlimit ${formatDuration(r.time_limit_seconds)}` : ''}</p>
                <p className="mt-2 text-sm">Puzzle: {r.puzzle_id ? <Link className="text-teal-dark underline" to={`/puzzle/${r.puzzle_id}`}>{r.puzzle_title}</Link> : <span className="text-ink-soft">nicht verknüpft{r.puzzle_name_source ? ` (laut Seite: «${r.puzzle_name_source}»)` : ''}</span>}</p>
                <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">{r.entries_count > 0 ? <Chip tone="good">{r.entries_count} Einträge</Chip> : <Chip>keine Resultate</Chip>}{r.linked_members > 0 && <Chip>{r.linked_members} aus der Community</Chip>}{r.fetched_at && <span className="text-ink-soft">importiert am {formatDate(r.fetched_at)}</span>}</p>
              </li>))}
          </ul>
        </section>))}
    </div>
  )
}
