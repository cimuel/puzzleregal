import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { friendlyError } from '../lib/errors'
import type { NotificationRow } from '../lib/api'
import { notificationLink, notificationText } from '../lib/loans'
import { useAsync } from '../hooks/useAsync'
import { Button, Spinner } from '../components/ui'
import { ErrorBox } from '../components/Parts'
import { useState } from 'react'

export function Notifications() {
  const { data, error, loading, reload } = useAsync(async () => {
    const { data: rows, error: err } = await supabase.from('notifications').select('id, type, payload, read_at, created_at').order('created_at', { ascending: false }).limit(100)
    if (err) throw new Error(friendlyError(err.message))
    return rows as NotificationRow[]
  }, [])
  const [msg, setMsg] = useState<string | null>(null)

  async function markRead(ids?: string[]) {
    let q = supabase.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null)
    if (ids) q = q.in('id', ids)
    const { error: err } = await q
    if (err) return setMsg(friendlyError(err.message))
    setMsg(null); reload(); window.dispatchEvent(new Event('notifications-changed'))
  }

  if (loading && !data) return <Spinner />
  const unread = (data ?? []).filter((n) => !n.read_at)
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">Mitteilungen</h1>
        {unread.length > 0 && <Button variant="secondary" onClick={() => markRead()}>Alle als gelesen markieren</Button>}
      </div>
      <ErrorBox message={msg ?? error} />
      {(data ?? []).length === 0 ? <p className="text-ink-soft">Noch keine Mitteilungen.</p> : (
        <ul className="flex flex-col gap-2">
          {(data ?? []).map((n) => (
            <li key={n.id} className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 ${n.read_at ? 'border-line bg-card' : 'border-teal/40 bg-teal/5'}`}>
              <div><p className={n.read_at ? '' : 'font-semibold'}>{notificationText(n)}</p>
                <p className="text-sm text-ink-soft">{new Date(n.created_at).toLocaleString('de-CH', { dateStyle: 'short', timeStyle: 'short' })}</p></div>
              <div className="flex gap-3">
                <Link className="text-teal-dark underline" to={notificationLink(n)} onClick={() => !n.read_at && void markRead([n.id])}>Öffnen</Link>
                {!n.read_at && <button className="text-ink-soft underline" onClick={() => markRead([n.id])}>Gelesen</button>}
              </div>
            </li>))}
        </ul>)}
    </div>
  )
}
