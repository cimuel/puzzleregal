import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { Button, Card, Field, Logo, Notice } from '../components/ui'

export function Register() {
  const { session, signUp } = useAuth()
  const navigate = useNavigate()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState(false)
  const [busy, setBusy] = useState(false)

  if (session) return <Navigate to="/warten" replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) return setError('Das Passwort braucht mindestens 8 Zeichen.')
    setBusy(true)
    const res = await signUp({ email, password, displayName, inviteCode })
    setBusy(false)
    if (res.error) setError(res.error)
    else if (res.needsConfirmation) setConfirmation(true)
    else navigate('/warten')
  }

  if (confirmation) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6">
        <Notice kind="success">
          Fast geschafft: Wir haben dir eine E-Mail zur Bestätigung geschickt. Nach dem Klick auf den Link kannst du dich
          anmelden. Danach muss ein Admin dein Konto noch freigeben.
        </Notice>
        <Link className="text-teal-dark underline" to="/anmelden">Zur Anmeldung</Link>
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-5 p-6">
      <Link to="/" className="flex items-center gap-2 font-display text-2xl font-bold"><Logo /> Puzzleregal</Link>
      <Card>
        <h1 className="mb-1 text-2xl font-bold">Registrieren</h1>
        <p className="mb-4 text-ink-soft">Du brauchst einen Einladungscode. Danach gibt ein Admin dein Konto frei.</p>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field label="Name, wie er im Regal erscheint" autoComplete="name" required minLength={2} maxLength={60} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          <Field label="E-Mail-Adresse" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <Field label="Passwort" type="password" autoComplete="new-password" required minLength={8} hint="Mindestens 8 Zeichen." value={password} onChange={(e) => setPassword(e.target.value)} />
          <Field label="Einladungscode" autoComplete="off" required value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} />
          {error && <Notice kind="error">{error}</Notice>}
          <Button type="submit" disabled={busy}>{busy ? 'Registrieren …' : 'Registrieren'}</Button>
        </form>
      </Card>
      <p>
        Schon ein Konto? <Link className="text-teal-dark underline" to="/anmelden">Anmelden</Link>
      </p>
    </div>
  )
}
