import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/use-auth'

interface LoginProps {
  onSwitchToSignup: () => void
}

export default function Login({ onSwitchToSignup }: LoginProps) {
  const { refreshMembership, setPendingSetup, setAuthError, clearAuthError } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setPendingSetup(true)
    clearAuthError()
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      await refreshMembership()
      // Routing advances automatically once membership resolves.
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
      <p className="auth-subtitle">Log in to your shared budget</p>

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
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={submitting}
        />
      </label>

      <button type="submit" className="btn-primary" disabled={submitting}>
        {submitting ? 'Logging in…' : 'Log in'}
      </button>

      <button type="button" className="btn-link" onClick={onSwitchToSignup} disabled={submitting}>
        New here? Create an account
      </button>
    </form>
  )
}
