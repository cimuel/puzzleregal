import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useMyLoans } from '../hooks/useMyLoans'
import { isActive } from '../lib/loans'
import { LoanItem } from '../components/Loans'
import { ErrorBox } from '../components/Parts'
import { Spinner } from '../components/ui'

/** Ausleihen meiner Puzzles, bei denen etwas zu tun ist oder die gerade laufen. */
export function LoanRequests() {
  const { profile } = useAuth()
  const { data, error, loading, reload } = useMyLoans()
  if (loading && !data) return <Spinner />
  const mine = (data ?? []).filter((l) => l.owner_id === profile?.id && isActive(l.status))
  const groups = [
    ['Offene Anfragen', mine.filter((l) => l.status === 'requested'), 'Niemand wartet auf eine Antwort von dir.'],
    ['Angenommen, Übergabe noch offen', mine.filter((l) => l.status === 'accepted'), 'Keine offenen Übergaben.'],
    ['Zurzeit verliehen', mine.filter((l) => l.status === 'lent' || l.status === 'return_requested'), 'Keines deiner Puzzles ist verliehen.'],
  ] as const
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold">Ausleihanfragen</h1>
      <p className="max-w-prose text-ink-soft">Hier siehst du, wer deine Puzzles ausleihen möchte. Das Puzzle wechselt erst ins Regal der anderen Person, wenn du die Übergabe bestätigst. <Link className="text-teal-dark underline" to="/ausleihen/meine">Zu deinen eigenen Ausleihen</Link></p>
      <ErrorBox message={error} />
      {groups.map(([title, rows, empty]) => (
        <section key={title}>
          <h2 className="mb-2 text-xl font-bold">{title} ({rows.length})</h2>
          {rows.length === 0 ? <p className="text-ink-soft">{empty}</p> : <ul className="flex flex-col gap-3">{rows.map((l) => <LoanItem key={l.loan_id} loan={l} role="owner" onChange={reload} />)}</ul>}
        </section>))}
    </div>
  )
}
