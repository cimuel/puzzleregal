import { useMemo } from 'react'
import { rpc, type LoanRow } from '../lib/api'
import { isActive } from '../lib/loans'
import { useAuth } from '../auth/AuthContext'
import { useAsync } from './useAsync'

/** Eigene Ausleihen (als Besitzer und als Ausleihende) und die laufende Ausleihe pro Exemplar. */
export function useMyLoans() {
  const { profile } = useAuth()
  const state = useAsync(() => rpc<LoanRow[]>('my_loans'), [])
  const myActiveByCopy = useMemo(() => {
    const m = new Map<string, LoanRow>()
    for (const l of state.data ?? []) if (l.borrower_id === profile?.id && isActive(l.status)) m.set(l.copy_id, l)
    return m
  }, [state.data, profile?.id])
  return { ...state, myActiveByCopy }
}
