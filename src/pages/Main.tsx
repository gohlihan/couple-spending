import { useState } from 'react'
import { useAuth } from '../lib/use-auth'
import Invite from './Invite'

interface MainProps {
  onSignOut: () => void
}

/**
 * Placeholder main screen (Phase 3+ fills in the waterfall / add-transaction
 * UI). For now it shows who is signed in and the invite panel so the first user
 * can share their code.
 */
export default function Main({ onSignOut }: MainProps) {
  const { user, displayName, inviteCode } = useAuth()
  const [showInvite, setShowInvite] = useState(false)

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Couple Spending</h1>
        <button type="button" className="btn-header" onClick={onSignOut}>
          Sign out
        </button>
      </header>

      <main className="app-main">
        <p className="welcome">
          Hi, {displayName ?? user?.email ?? 'there'} 👋
        </p>
        <p className="muted">
          The budget and spending timeline arrive in Phase 3. For now, you’re linked to your
          household.
        </p>

        {showInvite ? (
          <Invite />
        ) : (
          inviteCode && (
            <button type="button" className="btn-secondary" onClick={() => setShowInvite(true)}>
              Show invite code
            </button>
          )
        )}
        {showInvite && (
          <button type="button" className="btn-link" onClick={() => setShowInvite(false)}>
            Hide
          </button>
        )}
      </main>
    </div>
  )
}
