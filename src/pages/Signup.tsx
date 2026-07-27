import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/use-auth'
import { createHouseholdForUser, joinHouseholdByCode } from '../lib/household'

interface SignupProps {
  /** Invite code carried from the `?invite=` URL param. When present, signup
   * joins the existing household instead of creating a new one, so the second
   * user shares the first user's household_id (issue #3 acceptance). */
  initialInviteCode: string | null
  onSwitchToLogin: () => void
}

export default function Signup({ initialInviteCode, onSwitchToLogin }: SignupProps) {
  const { refreshMembership, setPendingSetup, setAuthError, clearAuthError } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const joining = initialInviteCode !== null

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setPendingSetup(true)
    clearAuthError()
    try {
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) throw error
      if (!data.user) throw new Error('Sign-up did not return a user.')

      // If email confirmation is enabled (mailer_autoconfirm off), no session is
      // established yet — the user must confirm then log in. Membership setup
      // happens after they log in (routed to the Join screen).
      if (!data.session) {
        setAuthError('Account created. Check your email to confirm, then log in.')
        return
      }

      // signUp emits SIGNED_IN before the browser auth store is always ready
      // for the immediately-following RLS bootstrap writes. Re-assert the
      // returned session so auth.uid() is present on household creation.
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      })
      if (sessionError) throw sessionError

      if (initialInviteCode) {
        await joinHouseholdByCode(data.user.id, initialInviteCode, displayName)
      } else {
        await createHouseholdForUser(data.user.id, displayName)
      }
      await refreshMembership(data.user.id)
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
      setPendingSetup(false)
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <h1 className="auth-title">Couple Spending</h1>
      <p className="auth-subtitle">
        {joining ? 'Create your account to join the household' : 'Create your account'}
      </p>

      <label className="field">
        <span className="field-label">Email</span>
        <input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={submitting}
        />
      </label>

      <label className="field">
        <span className="field-label">Password</span>
        <input
          type="password"
          autoComplete="new-password"
          minLength={6}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={submitting}
        />
      </label>

      <label className="field">
        <span className="field-label">Your name</span>
        <input
          type="text"
          autoComplete="nickname"
          placeholder="e.g. Han"
          required
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          disabled={submitting}
        />
      </label>

      <button type="submit" className="btn-primary" disabled={submitting}>
        {submitting ? 'Creating account…' : 'Sign up'}
      </button>

      <button type="button" className="btn-link" onClick={onSwitchToLogin} disabled={submitting}>
        Already have an account? Log in
      </button>
    </form>
  )
}
