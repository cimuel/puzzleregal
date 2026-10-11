import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { friendlyError } from '../lib/errors'
import { Button, Card, Field, Notice } from '../components/ui'

export function Profile() {
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
    <div className="flex flex-col gap-4">
      <h1 className="text-3xl font-bold">Mein Profil</h1>
      <Card className="max-w-md">
        <form onSubmit={save} className="flex flex-col gap-4">
          <Field label="Anzeigename" required minLength={2} maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
          {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
          <Button type="submit">Speichern</Button>
        </form>
      </Card>
      <p className="text-ink-soft">Statistiken und Bestleistungen erscheinen hier, sobald Zeiten erfasst werden können (Phase 3).</p>
    </div>
  )
}
