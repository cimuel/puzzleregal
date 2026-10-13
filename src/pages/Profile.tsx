import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { friendlyError } from '../lib/errors'
import { Button, Card, Field, Notice } from '../components/ui'

/** Anzeigename ändern (nur für das eigene Profil). */
export function NameCard() {
  const { profile, reloadProfile } = useAuth()
  const [name, setName] = useState(profile?.display_name ?? '')
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!profile) return
    const { error } = await supabase.from('profiles').update({ display_name: name.trim() }).eq('id', profile.id)
    if (error) setMsg({ kind: 'error', text: friendlyError(error.message) })
    else {
      setMsg({ kind: 'success', text: 'Gespeichert.' })
      await reloadProfile()
    }
  }

  return (
    <Card className="max-w-md">
      <h2 className="mb-3 text-xl font-bold">Anzeigename ändern</h2>
      <form onSubmit={save} className="flex flex-col gap-4">
        <Field label="Anzeigename" required minLength={2} maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        <Button type="submit">Speichern</Button>
      </form>
    </Card>
  )
}
