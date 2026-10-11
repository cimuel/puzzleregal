import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { Logo } from '../components/ui'

export function Landing() {
  const { session, profile } = useAuth()
  if (session && profile?.status === 'approved') return <Navigate to="/start" replace />

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 p-6">
      <Logo size={48} />
      <h1 className="text-4xl font-bold md:text-5xl">Puzzleregal</h1>
      <p className="max-w-prose text-lg text-ink-soft">
        Das gemeinsame Regal unserer Puzzle-Community: Wer besitzt welches Puzzle, wer hat es gerade, und wie schnell
        wurde es gelöst.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link to="/anmelden" className="inline-flex min-h-11 items-center rounded-lg bg-teal px-5 font-semibold text-white hover:bg-teal-dark">
          Anmelden
        </Link>
        <Link to="/registrieren" className="inline-flex min-h-11 items-center rounded-lg border border-line bg-white px-5 font-semibold hover:bg-paper">
          Mit Einladungscode registrieren
        </Link>
      </div>
      <p className="text-sm text-ink-soft">Regale und Statistiken sind nur für freigegebene Mitglieder sichtbar.</p>
    </div>
  )
}
