import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { friendlyError } from '../lib/errors'
import { useAuth } from '../lib/use-auth'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { Field, FieldLabel } from '../components/ui/field'
import { Input } from '../components/ui/input'

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
      setAuthError(friendlyError(err, 'Could not log in.'))
    } finally {
      setSubmitting(false)
      setPendingSetup(false)
    }
  }

  return (
    <main className="auth-screen">
      <Card className="auth-card">
        <div className="auth-brand" aria-hidden="true">
          <span className="auth-brand-mark">CS</span>
          <span>Shared money, made simple</span>
        </div>
        <form className="auth-form" onSubmit={handleSubmit}>
          <h1 className="auth-title">Couple Spending</h1>
          <p className="auth-subtitle">Log in to your shared budget</p>

          <Field>
            <FieldLabel htmlFor="login-email">Email</FieldLabel>
            <Input
              id="login-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={submitting}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="login-password">Password</FieldLabel>
            <Input
              id="login-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
            />
          </Field>

          <Button className="w-full" type="submit" disabled={submitting}>
            {submitting ? 'Logging in…' : 'Log in'}
          </Button>

          <Button
            type="button"
            variant="link"
            size="sm"
            className="self-center px-0"
            onClick={onSwitchToSignup}
            disabled={submitting}
          >
            New here? Create an account
          </Button>
        </form>
      </Card>
    </main>
  )
}
