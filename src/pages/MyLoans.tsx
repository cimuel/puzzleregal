import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useMyLoans } from '../hooks/useMyLoans'
import { useAsync } from '../hooks/useAsync'
import { rpc, type ShelfRow } from '../lib/api'
import { isActive } from '../lib/loans'
import { LoanItem } from '../components/Loans'
import { Chip, ErrorBox } from '../components/Parts'
import { Card, Spinner } from '../components/ui'

/** Wo sind meine Puzzles, was habe ich ausgeliehen, was ist offen, und der Verlauf. */
export function MyLoans() {
  const { profile } = useAuth()
  const loans = useMyLoans()
  const shelf = useAsync(() => (profile ? rpc<ShelfRow[]>('shelf_items', { p_profile: profile.id }) : Promise.resolve([] as ShelfRow[])), [profile?.id])
  if ((loans.loading && !loans.data) || !profile) return <Spinner />
  const all = loans.data ?? []
  const asBorrower = all.filter((l) => l.borrower_id === profile.id && isActive(l.status))
  const history = all.filter((l) => !isActive(l.status))
  const mineCopies = (shelf.data ?? []).filter((r) => r.owner_id === profile.id)
  const reload = () => { loans.reload(); shelf.reload() }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold">Eigene Ausleihen</h1>
      <ErrorBox message={loans.error ?? shelf.error} />

      <Card>
        <h2 className="mb-3 text-xl font-bold">Wo sind meine Puzzles?</h2>
        {mineCopies.length === 0 ? <p className="text-ink-soft">Du besitzt noch keine Puzzles.</p> : (
          <ul className="divide-y divide-line">{mineCopies.map((r) => (
            <li key={r.copy_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <Link className="font-semibold text-teal-dark underline" to={`/puzzle/${r.puzzle_id}`}>{r.title}</Link>
              {r.is_on_loan ? <Chip tone="warn">bei {r.holder_name}</Chip> : r.is_reserved ? <Chip tone="warn">reserviert, Übergabe offen</Chip> : <Chip tone="good">zu Hause</Chip>}
            </li>))}</ul>)}
      </Card>

      <section>
        <h2 className="mb-2 text-xl font-bold">Von mir angefragt oder ausgeliehen ({asBorrower.length})</h2>
        {asBorrower.length === 0 ? <p className="text-ink-soft">Du hast nichts ausgeliehen und keine offenen Anfragen. Such in den <Link className="text-teal-dark underline" to="/regale">Regalen</Link> nach einem Puzzle.</p>
          : <ul className="flex flex-col gap-3">{asBorrower.map((l) => <LoanItem key={l.loan_id} loan={l} role="borrower" onChange={reload} />)}</ul>}
      </section>

      <section>
        <h2 className="mb-2 text-xl font-bold">Verlauf ({history.length})</h2>
        {history.length === 0 ? <p className="text-ink-soft">Noch keine abgeschlossenen Ausleihen.</p>
          : <ul className="flex flex-col gap-3">{history.map((l) => <LoanItem key={l.loan_id} loan={l} role={l.owner_id === profile.id ? 'owner' : 'borrower'} onChange={reload} />)}</ul>}
      </section>
    </div>
  )
}
