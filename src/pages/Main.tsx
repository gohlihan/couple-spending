import { liveQuery } from 'dexie';
import { useEffect, useState } from 'react';
import { db } from '../lib/db';
import { useAuth } from '../lib/use-auth';
import AddTransaction from './AddTransaction';
import Invite from './Invite';

interface MainProps {
  onSignOut: () => void;
}

export default function Main({ onSignOut }: MainProps) {
  const { user, displayName, householdId, inviteCode } = useAuth();
  const [showInvite, setShowInvite] = useState(false);
  const [transactionCount, setTransactionCount] = useState(0);

  useEffect(() => {
    if (!householdId) {
      setTransactionCount(0);
      return;
    }

    const subscription = liveQuery(() =>
      db.transactions
        .where('household_id')
        .equals(householdId)
        .filter((transaction) => transaction.deleted_at === null)
        .count(),
    ).subscribe({
      next: setTransactionCount,
      error: (error) => console.warn('Could not read local transactions.', error),
    });

    return () => subscription.unsubscribe();
  }, [householdId]);

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Couple Spending</h1>
        <button type="button" className="btn-header" onClick={onSignOut}>
          Sign out
        </button>
      </header>

      <main className="app-main">
        <p className="welcome">Hi, {displayName ?? user?.email ?? 'there'} 👋</p>
        <AddTransaction />

        <section className="recent-placeholder" aria-label="Recent transactions">
          <h2>Recent transactions</h2>
          <p className="muted">
            {transactionCount === 0
              ? 'No local transactions yet.'
              : `${transactionCount} local transaction${transactionCount === 1 ? '' : 's'}.`}
          </p>
        </section>

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
  );
}
