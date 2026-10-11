import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { Spinner } from '../components/ui'

/** Nur für angemeldete und freigegebene Mitglieder.
 *  Achtung: Das ist reine Bedienführung. Die echte Durchsetzung passiert in der Datenbank (RLS). */
export function RequireApproved() {
  const { session, profile, loading } = useAuth()
  if (loading) return <Spinner />
  if (!session) return <Navigate to="/anmelden" replace />
  if (!profile || profile.status !== 'approved') return <Navigate to="/warten" replace />
  return <Outlet />
}

export function RequireAdmin() {
  const { profile } = useAuth()
  if (profile?.role !== 'admin') return <Navigate to="/start" replace />
  return <Outlet />
}
