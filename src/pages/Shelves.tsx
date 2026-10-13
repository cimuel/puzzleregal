import { Link } from 'react-router-dom'
import { rpc, type MemberRow } from '../lib/api'
import { useAsync } from '../hooks/useAsync'
import { ErrorBox } from '../components/Parts'
import { Spinner } from '../components/ui'

export function Shelves() {
  const { data, error, loading } = useAsync(() => rpc<MemberRow[]>('member_overview'), [])
  if (loading && !data) return <Spinner />
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-3xl font-bold">Alle Regale</h1>
      <ErrorBox message={error} />
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(data ?? []).map((m) => (
          <li key={m.profile_id} className="rounded-xl border border-line bg-card p-5">
            <h2 className="text-xl font-bold"><Link className="hover:text-teal-dark" to={`/regal/${m.profile_id}`}>{m.display_name}</Link></h2>
            <p className="text-ink-soft">{m.copies_held} {m.copies_held === 1 ? 'Puzzle' : 'Puzzles'} im Regal · {m.copies_owned} besessen</p>
            <p className="text-ink-soft">{m.solved_puzzles} gelöst · {m.attempts_count} Einzelversuche</p>
            <p className="mt-3 flex gap-4"><Link className="text-teal-dark underline" to={`/regal/${m.profile_id}`}>Regal ansehen</Link><Link className="text-teal-dark underline" to={`/person/${m.profile_id}`}>Statistiken</Link></p>
          </li>))}
      </ul>
    </div>
  )
}
