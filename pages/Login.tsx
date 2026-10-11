import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { Button, Card, Field, Logo, Notice } from '../components/ui'

export function Login() {
  const { session, signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (session) return <Navigate to="/start" replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const err = await signIn(email, password)
    setBusy(false)
    if (err) setError(err)
    else navigate('/start')
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-5 p-6">
      <Link to="/" className="flex items-center gap-2 font-display text-2xl font-bold"><Logo /> Puzzleregal</Link>
      <Card>
        <h1 className="mb-4 text-2xl font-bold">Anmelden</h1>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field label="E-Mail-Adresse" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <Field label="Passwort" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <Notice kind="error">{error}</Notice>}
          <Button type="submit" disabled={busy}>{busy ? 'Anmelden …' : 'Anmelden'}</Button>
        </form>
      </Card>
      <p>
        Noch kein Konto? <Link className="text-teal-dark underline" to="/registrieren">Mit Einladungscode registrieren</Link>
      </p>
    </div>
  )
}
