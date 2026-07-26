import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { AuthContext, type AuthContextValue } from './use-auth'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [householdId, setHouseholdId] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [membershipLoading, setMembershipLoading] = useState(false)
  const [pendingSetup, setPendingSetup] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)

  // Latest-wins guard: if multiple membership fetches race (e.g. the
  // onAuthStateChange listener and an explicit refreshMembership during
  // signup), only the most recent one's result is applied.
  const membershipSeq = useRef(0)

  const loadMembership = useCallback(async (userId: string) => {
    const seq = ++membershipSeq.current
    setMembershipLoading(true)

    const { data, error } = await supabase
      .from('household_members')
      .select('household_id, display_name')
      .eq('user_id', userId)
      .maybeSingle()

    if (seq !== membershipSeq.current) return // a newer fetch supersedes this one

    if (error || !data) {
      setHouseholdId(null)
      setDisplayName(null)
      setInviteCode(null)
      setMembershipLoading(false)
      return
    }

    setHouseholdId(data.household_id)
    setDisplayName(data.display_name)

    // Fetch the household's invite code in the same pass so it's available to
    // the Invite screen without an extra round-trip on render.
    const { data: household } = await supabase
      .from('households')
      .select('invite_code')
      .eq('id', data.household_id)
      .maybeSingle()
    if (seq !== membershipSeq.current) return
    setInviteCode(household?.invite_code ?? null)
    setMembershipLoading(false)
  }, [])

  useEffect(() => {
    let active = true

    // Restore the persisted session on cold start (Supabase stores it in
    // localStorage by default), so a closed/reopened PWA is still signed in.
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setUser(data.session?.user ?? null)
      setLoading(false)
      if (data.session?.user) {
        void loadMembership(data.session.user.id)
      }
    })

    // Keep session + membership in sync on subsequent auth changes.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setUser(nextSession?.user ?? null)
      if (nextSession?.user) {
        void loadMembership(nextSession.user.id)
      } else {
        setHouseholdId(null)
        setDisplayName(null)
        setInviteCode(null)
      }
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [loadMembership])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setHouseholdId(null)
    setDisplayName(null)
    setInviteCode(null)
  }, [])

  const refreshMembership = useCallback(async (userId?: string) => {
    const id = userId ?? user?.id
    if (id) await loadMembership(id)
  }, [user, loadMembership])

  const clearAuthError = useCallback(() => setAuthError(null), [])

  const value: AuthContextValue = {
    session,
    user,
    householdId,
    displayName,
    inviteCode,
    loading,
    membershipLoading,
    pendingSetup,
    authError,
    setPendingSetup,
    setAuthError,
    clearAuthError,
    signOut,
    refreshMembership,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
