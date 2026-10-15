import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { friendlyError } from '../lib/errors'

export type UserRole = 'member' | 'admin'
export type UserStatus = 'pending' | 'approved' | 'blocked'
export interface Profile {
  id: string
  display_name: string
  role: UserRole
  status: UserStatus
  created_at: string
  wjpc_slug: string | null
}

interface AuthState {
  session: Session | null
  profile: Profile | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<string | null>
  signUp: (p: { email: string; password: string; displayName: string; inviteCode: string }) => Promise<{ error: string | null; needsConfirmation: boolean }>
  signOut: () => Promise<void>
  reloadProfile: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [sessionLoaded, setSessionLoaded] = useState(false)
  const [profileLoading, setProfileLoading] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setSessionLoaded(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id ?? null

  const loadProfile = useCallback(async () => {
    if (!userId) {
      setProfile(null)
      return
    }
    setProfileLoading(true)
    const { data } = await supabase
      .from('profiles')
      .select('id, display_name, role, status, created_at, wjpc_slug')
      .eq('id', userId)
      .maybeSingle()
    setProfile((data as Profile | null) ?? null)
    setProfileLoading(false)
  }, [userId])

  useEffect(() => {
    void loadProfile()
  }, [loadProfile])

  const value = useMemo<AuthState>(
    () => ({
      session,
      profile,
      loading: !sessionLoaded || (userId !== null && profileLoading && profile === null),
      signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        return error ? friendlyError(error.message) : null
      },
      signUp: async ({ email, password, displayName, inviteCode }) => {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { display_name: displayName.trim(), invite_code: inviteCode.trim() } },
        })
        if (error) return { error: friendlyError(error.message), needsConfirmation: false }
        return { error: null, needsConfirmation: data.session === null }
      },
      signOut: async () => {
        await supabase.auth.signOut()
        setProfile(null)
      },
      reloadProfile: loadProfile,
    }),
    [session, profile, sessionLoaded, userId, profileLoading, loadProfile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth muss innerhalb von AuthProvider verwendet werden')
  return ctx
}
