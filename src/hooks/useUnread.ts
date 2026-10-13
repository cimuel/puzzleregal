import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

/** Anzahl ungelesener Mitteilungen; wird beim Öffnen, bei Fokus und jede Minute aktualisiert. */
export function useUnread(refreshKey?: unknown): number {
  const [count, setCount] = useState(0)
  useEffect(() => {
    let alive = true
    const load = async () => {
      const { count: c } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null)
      if (alive) setCount(c ?? 0)
    }
    void load()
    const timer = window.setInterval(load, 60_000)
    window.addEventListener('focus', load)
    window.addEventListener('notifications-changed', load)
    return () => { alive = false; window.clearInterval(timer); window.removeEventListener('focus', load); window.removeEventListener('notifications-changed', load) }
  }, [refreshKey])
  return count
}
