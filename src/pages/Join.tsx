import { useState } from 'react'
import { useAuth } from '../lib/use-auth'
import { createHouseholdForUser, joinHouseholdByCode, normalizeInviteCode } from '../lib/household'

interface JoinProps {
  /** Invite code carried from the `?invite=` URL param, prefilled into the form. */
  initialInviteCode: string | null
}

export default function Join({ initialInviteCode }: JoinProps) {
  const { user, refreshMembership, setPendingSetup, setAuthError, clearAuthError } = useAuth()
  const [inviteCode, setInviteCode] = useState(initialInviteCode ?? '')
  const [displayName, setDisplayName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [mode, setMode] = useState<'join' | 'create'>(initialInviteCode ? 'join' : 'join')

  async function handleJoin(event: React.FormEvent) {
    event.preventDefault()
    if (!user) return
    setSubmitting(true)
    setPendingSetup(true)
    clearAuthError()
    try {
      await joinHouseholdByCode(user.id, inviteCode, displayName)
      await refreshMembership()
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
      setPendingSetup(false)
    }
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault()
    if (!user) return
    setSubmitting(true)
    setPendingSetup(true)
    clearAuthError()
    try {
      await createHouseholdForUser(user.id, displayName)
      await refreshMembership()
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
      setPendingSetup(false)
    }
  }

  return (
    <form className="auth-form" onSubmit={mode === 'join' ? handleJoin : handleCreate}>
      <h1 className="auth-title">Almost there</h1>
      <p className="auth-subtitle">
        {mode === 'join'
          ? 'Enter your partner’s invite code to share a household'
          : 'Start a new household for you and your partner'}
      </p>

      {mode === 'join' && (
        <label className="field">
          <span className="field-label">Invite code</span>
          <input
            type="text"
            required
            value={inviteCode}
            onChange={(e) => setInviteCode(normalizeInviteCode(e.target.value))}
            placeholder="e.g. AB3K9XYZ"
            disabled={submitting}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
          />
        </label>
      )}

      <label className="field">
        <span className="field-label">Your name</span>
        <input
          type="text"
          autoComplete="nickname"
          placeholder="e.g. Partner"
          required
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          disabled={submitting}
        />
      </label>

      <button type="submit" className="btn-primary" disabled={submitting}>
        {submitting
          ? mode === 'join'
            ? 'Joining…'
            : 'Creating…'
          : mode === 'join'
            ? 'Join household'
            : 'Create household'}
      </button>

      {mode === 'join' ? (
        <button
          type="button"
          className="btn-link"
          onClick={() => setMode('create')}
          disabled={submitting}
        >
          Don’t have a code? Start a new household
        </button>
      ) : (
        <button
          type="button"
          className="btn-link"
          onClick={() => setMode('join')}
          disabled={submitting}
        >
          Have an invite code? Join instead
        </button>
      )}
    </form>
  )
}
