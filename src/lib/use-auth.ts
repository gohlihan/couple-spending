import { createContext, useContext } from 'react'
import type { Session, User } from '@supabase/supabase-js'

export interface AuthContextValue {
  session: Session | null
  user: User | null
  householdId: string | null
  displayName: string | null
  inviteCode: string | null
  /** True until the initial getSession() resolves on cold start. */
  loading: boolean
  /** True while a household-membership query is in flight. */
  membershipLoading: boolean
  /**
   * True while a multi-step auth operation (signup+setup, join) is in flight.
   * The router holds its current view while this is set so the in-progress
   * form stays mounted instead of flashing the next route prematurely.
   */
  pendingSetup: boolean
  authError: string | null
  setPendingSetup: (value: boolean) => void
  setAuthError: (value: string | null) => void
  clearAuthError: () => void
  signOut: () => Promise<void>
  /** Re-fetch the current user's household membership. */
  refreshMembership: (userId?: string) => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
