import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { Button, Card, Notice, Spinner } from '../components/ui'

export function Waiting() {
  const { session, profile, loading, reloadProfile, signOut } = useAuth()
  const navigate = useNavigate()

  if (loading) return <Spinner />
  if (!session) return <Navigate to="/anmelden" replace />
  if (profile?.status === 'approved') return <Navigate to="/start" replace />

  const blocked = profile?.status === 'blocked'
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-5 p-6">
      <Card>
        <h1 className="mb-3 text-2xl font-bold">{blocked ? 'Zugang gesperrt' : 'Dein Konto wartet auf Freigabe'}</h1>
        {blocked ? (
          <Notice kind="error">Dein Konto wurde gesperrt. Wende dich an den Admin der Community.</Notice>
        ) : (
          <p className="text-ink-soft">
            Du bist registriert{profile ? `, ${profile.display_name}` : ''}. Sobald ein Admin dein Konto freigibt, kannst du
            Regale und Statistiken sehen. Sag am besten kurz Bescheid, dass du dich registriert hast.
          </p>
        )}
        <div className="mt-5 flex flex-wrap gap-3">
          {!blocked && <Button onClick={() => void reloadProfile()}>Status neu laden</Button>}
          <Button variant="secondary" onClick={async () => { await signOut(); navigate('/') }}>Abmelden</Button>
        </div>
      </Card>
    </div>
  )
}
