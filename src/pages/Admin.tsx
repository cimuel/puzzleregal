import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { friendlyError } from '../lib/errors'
import { generateInviteCode } from '../lib/inviteCode'
import { useAuth, type Profile, type UserRole, type UserStatus } from '../auth/AuthContext'
import { Button, Card, Field, Notice, Spinner } from '../components/ui'
import { Link } from 'react-router-dom'
import { rpc, type LoanRow } from '../lib/api'
import { LoanItem } from '../components/Loans'
import { isActive } from '../lib/loans'

interface InviteCode {
  id: string
  code: string
  note: string | null
  max_uses: number | null
  uses: number
  active: boolean
  created_at: string
}

const statusLabel: Record<UserStatus, string> = { pending: 'Wartet auf Freigabe', approved: 'Freigegeben', blocked: 'Gesperrt' }
const roleLabel: Record<UserRole, string> = { member: 'Mitglied', admin: 'Admin' }
const fmt = (iso: string) => new Date(iso).toLocaleDateString('de-CH')

export function Admin() {
  const { profile: me } = useAuth()
  const [users, setUsers] = useState<Profile[] | null>(null)
  const [codes, setCodes] = useState<InviteCode[] | null>(null)
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [note, setNote] = useState('')
  const [maxUses, setMaxUses] = useState('')
  const [newCode, setNewCode] = useState<string | null>(null)

  const [loans, setLoans] = useState<LoanRow[] | null>(null)
  const load = useCallback(async () => {
    rpc<LoanRow[]>('my_loans', { p_all: true }).then(setLoans).catch((e: unknown) => setMsg({ kind: 'error', text: e instanceof Error ? e.message : 'Fehler' }))
    const [u, c] = await Promise.all([
      supabase.from('profiles').select('id, display_name, role, status, created_at').order('created_at'),
      supabase.from('invite_codes').select('id, code, note, max_uses, uses, active, created_at').order('created_at', { ascending: false }),
    ])
    if (u.error || c.error) setMsg({ kind: 'error', text: friendlyError((u.error ?? c.error)?.message) })
    setUsers((u.data as Profile[]) ?? [])
    setCodes((c.data as InviteCode[]) ?? [])
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function setStatus(id: string, status: UserStatus) {
    const { error } = await supabase.rpc('admin_set_user_status', { p_user: id, p_status: status })
    setMsg(error ? { kind: 'error', text: friendlyError(error.message) } : { kind: 'success', text: 'Status geändert.' })
    await load()
  }

  async function setRole(id: string, role: UserRole) {
    const { error } = await supabase.rpc('admin_set_user_role', { p_user: id, p_role: role })
    setMsg(error ? { kind: 'error', text: friendlyError(error.message) } : { kind: 'success', text: 'Rolle geändert.' })
    await load()
  }

  async function createCode(e: FormEvent) {
    e.preventDefault()
    const code = generateInviteCode()
    const { error } = await supabase.from('invite_codes').insert({
      code,
      note: note.trim() || null,
      max_uses: maxUses ? Number(maxUses) : null,
      created_by: me?.id,
    })
    if (error) return setMsg({ kind: 'error', text: friendlyError(error.message) })
    setNewCode(code)
    setNote('')
    setMaxUses('')
    setMsg(null)
    await load()
  }

  async function toggleCode(c: InviteCode) {
    const { error } = await supabase.from('invite_codes').update({ active: !c.active }).eq('id', c.id)
    if (error) setMsg({ kind: 'error', text: friendlyError(error.message) })
    await load()
  }

  if (!users || !codes) return <Spinner />
  const pending = users.filter((u) => u.status === 'pending')

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold">Administration</h1>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}

      <Card>
        <h2 className="mb-3 text-xl font-bold">Freigaben ({pending.length})</h2>
        {pending.length === 0 ? (
          <p className="text-ink-soft">Niemand wartet auf Freigabe.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {pending.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center justify-between gap-3">
                <span><strong>{u.display_name}</strong> <span className="text-ink-soft">(registriert am {fmt(u.created_at)})</span></span>
                <span className="flex gap-2">
                  <Button onClick={() => setStatus(u.id, 'approved')}>Freigeben</Button>
                  <Button variant="danger" onClick={() => setStatus(u.id, 'blocked')}>Ablehnen</Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 text-xl font-bold">Mitglieder ({users.length})</h2>
        <ul className="divide-y divide-line">
          {users.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <span>
                <strong>{u.display_name}</strong>{u.id === me?.id && ' (du)'}
                <br />
                <span className="text-sm text-ink-soft">{roleLabel[u.role]} · {statusLabel[u.status]}</span>
              </span>
              {u.id !== me?.id && (
                <span className="flex flex-wrap gap-2">
                  {u.status === 'approved' && <Button variant="secondary" onClick={() => setRole(u.id, u.role === 'admin' ? 'member' : 'admin')}>{u.role === 'admin' ? 'Admin-Rechte entziehen' : 'Zum Admin machen'}</Button>}
                  {u.status === 'approved' && <Button variant="danger" onClick={() => setStatus(u.id, 'blocked')}>Sperren</Button>}
                  {u.status === 'blocked' && <Button variant="secondary" onClick={() => setStatus(u.id, 'approved')}>Entsperren</Button>}
                </span>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <h2 className="mb-1 text-xl font-bold">Wettkampfresultate</h2>
        <p className="mb-3 text-sm text-ink-soft">Ergebnislisten von worldjigsawpuzzle.org einlesen und Runden mit Puzzles verknüpfen.</p>
        <Link to="/admin/import" className="inline-flex min-h-11 items-center rounded-lg bg-teal px-4 font-semibold text-white hover:bg-teal-dark">Resultate importieren</Link>
      </Card>

      <Card>
        <h2 className="mb-1 text-xl font-bold">Laufende Ausleihen ({(loans ?? []).filter((l) => isActive(l.status)).length})</h2>
        <p className="mb-3 text-sm text-ink-soft">Als Admin kannst du hängende Ausleihen abschliessen, wenn sich die Beteiligten nicht melden.</p>
        {(loans ?? []).filter((l) => isActive(l.status)).length === 0 ? <p className="text-ink-soft">Keine laufenden Ausleihen.</p> : (
          <ul className="flex flex-col gap-3">{(loans ?? []).filter((l) => isActive(l.status)).map((l) => <LoanItem key={l.loan_id} loan={l} role="admin" onChange={load} />)}</ul>)}
      </Card>

      <Card>
        <h2 className="mb-3 text-xl font-bold">Einladungscodes</h2>
        <form onSubmit={createCode} className="mb-4 grid gap-3 sm:grid-cols-[1fr_9rem_auto] sm:items-end">
          <Field label="Notiz (optional)" placeholder="z. B. für Michael" value={note} onChange={(e) => setNote(e.target.value)} />
          <Field label="Max. Nutzungen" type="number" min={1} placeholder="unbegrenzt" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} />
          <Button type="submit">Neuen Code erzeugen</Button>
        </form>
        {newCode && (
          <Notice kind="success">
            Neuer Code: <strong className="select-all font-mono">{newCode}</strong>. Gib ihn nur persönlich weiter.
          </Notice>
        )}
        <ul className="mt-4 divide-y divide-line">
          {codes.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <span>
                <span className="select-all font-mono">{c.code}</span>
                {c.note && <span className="text-ink-soft"> – {c.note}</span>}
                <br />
                <span className="text-sm text-ink-soft">
                  {c.uses} von {c.max_uses ?? '∞'} genutzt · {c.active ? 'aktiv' : 'deaktiviert'} · erstellt am {fmt(c.created_at)}
                </span>
              </span>
              <Button variant="secondary" onClick={() => toggleCode(c)}>{c.active ? 'Deaktivieren' : 'Aktivieren'}</Button>
            </li>
          ))}
          {codes.length === 0 && <li className="py-3 text-ink-soft">Noch keine Codes.</li>}
        </ul>
      </Card>
    </div>
  )
}
