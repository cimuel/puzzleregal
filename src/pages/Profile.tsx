import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { friendlyError } from '../lib/errors'
import { extractWjpcSlug } from '../lib/wjpc'
import { Button, Card, Field, Notice } from '../components/ui'

/** Anzeigename ändern (nur für das eigene Profil). */
export function NameCard() {
  const { profile, reloadProfile } = useAuth()
  const [name, setName] = useState(profile?.display_name ?? '')
  const [wjpc, setWjpc] = useState(profile?.wjpc_slug ? `https://worldjigsawpuzzle.org/player/${profile.wjpc_slug}` : '')
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!profile) return
    const slug = extractWjpcSlug(wjpc)
    if (wjpc.trim() && !slug) return setMsg({ kind: 'error', text: 'Die WJPC-Adresse ist ungültig. Beispiel: https://worldjigsawpuzzle.org/player/dein-name' })
    const { error } = await supabase.from('profiles').update({ display_name: name.trim(), wjpc_slug: slug }).eq('id', profile.id)
    if (error) setMsg({ kind: 'error', text: friendlyError(error.message.includes('profiles_wjpc_slug_key') ? 'Dieses WJPC-Profil gehört schon einem anderen Mitglied.' : error.message) })
    else {
      setMsg({ kind: 'success', text: 'Gespeichert.' })
      await reloadProfile()
    }
  }

  return (
    <Card className="max-w-md">
      <h2 className="mb-3 text-xl font-bold">Profil bearbeiten</h2>
      <form onSubmit={save} className="flex flex-col gap-4">
        <Field label="Anzeigename" required minLength={2} maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
        <Field label="WJPC-Profil (optional)" type="url" placeholder="https://worldjigsawpuzzle.org/player/dein-name" value={wjpc} onChange={(e) => setWjpc(e.target.value)} hint="Damit ordnet die App offizielle Resultate automatisch dir zu." />
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        <Button type="submit">Speichern</Button>
      </form>
    </Card>
  )
}

/** Passwort ändern (nur für das eigene Konto). */
export function PasswordCard() {
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  async function save(e: FormEvent) {
    e.preventDefault()
    if (pw.length < 8) return setMsg({ kind: 'error', text: 'Das Passwort braucht mindestens 8 Zeichen.' })
    if (pw !== pw2) return setMsg({ kind: 'error', text: 'Die beiden Passwörter sind nicht gleich.' })
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: pw })
    setBusy(false)
    if (error) return setMsg({ kind: 'error', text: friendlyError(error.message) })
    setPw(''); setPw2('')
    setMsg({ kind: 'success', text: 'Das Passwort wurde geändert.' })
  }

  return (
    <Card className="max-w-md">
      <h2 className="mb-3 text-xl font-bold">Passwort ändern</h2>
      <form onSubmit={save} className="flex flex-col gap-4">
        <Field label="Neues Passwort" type="password" autoComplete="new-password" minLength={8} required value={pw} onChange={(e) => setPw(e.target.value)} hint="Mindestens 8 Zeichen, besser 12 oder mehr." />
        <Field label="Neues Passwort wiederholen" type="password" autoComplete="new-password" required value={pw2} onChange={(e) => setPw2(e.target.value)} />
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        <Button type="submit" disabled={busy}>{busy ? 'Speichern …' : 'Passwort ändern'}</Button>
      </form>
    </Card>
  )
}
