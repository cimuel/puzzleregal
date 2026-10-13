import { useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAsync } from './useAsync'
import type { UserStatus } from '../auth/AuthContext'

export interface Member { id: string; display_name: string; status: UserStatus }

export function useMembers() {
  const state = useAsync(async () => {
    const { data, error } = await supabase.from('profiles').select('id, display_name, status').order('display_name')
    if (error) throw new Error(error.message)
    return data as Member[]
  }, [])
  const names = useMemo(() => new Map((state.data ?? []).map((m) => [m.id, m.display_name])), [state.data])
  const approved = useMemo(() => (state.data ?? []).filter((m) => m.status === 'approved'), [state.data])
  return { ...state, names, approved }
}
