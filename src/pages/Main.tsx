import { useState } from 'react';
import { useAuth } from '../lib/use-auth';
import { useBudget } from '../lib/budget';
import { useHouseholdMembers } from '../lib/members';
import { useMonthTransactions } from '../lib/use-month-transactions';
import DateBar from '../components/DateBar';
import Waterfall from '../components/Waterfall';
import AddTransaction from './AddTransaction';
import Invite from './Invite';

interface MainProps {
  onSignOut: () => void;
}

export default function Main({ onSignOut }: MainProps) {
  const { user, displayName, householdId, inviteCode } = useAuth();
  const [month, setMonth] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  });
  const [showAdd, setShowAdd] = useState(false);
  const [showInvite, setShowInvite] = useState(false);

  const budget = useBudget(householdId);
  const transactions = useMonthTransactions(householdId, month);
  const memberNames = useHouseholdMembers(householdId);

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Couple Spending</h1>
        <button type="button" className="btn-header" onClick={onSignOut}>
          Sign out
        </button>
      </header>

      <DateBar month={month} onChange={setMonth} />

      <main className="app-main">
        <p className="welcome">Hi, {displayName ?? user?.email ?? 'there'} 👋</p>

        <Waterfall transactions={transactions} budget={budget} memberNames={memberNames} />

        {showInvite ? (
          <>
            <Invite />
            <button type="button" className="btn-link" onClick={() => setShowInvite(false)}>
              Hide invite code
            </button>
          </>
        ) : (
          inviteCode && (
            <button type="button" className="btn-secondary" onClick={() => setShowInvite(true)}>
              Show invite code
            </button>
          )
        )}
      </main>

      <button
        type="button"
        className="fab"
        onClick={() => setShowAdd(true)}
        aria-label="Add transaction"
      >
        +
      </button>

      {showAdd && (
        <div
          className="sheet-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Add transaction"
          onClick={(event) => {
            if (event.target === event.currentTarget) setShowAdd(false);
          }}
        >
          <div className="sheet">
            <div className="sheet-handle-row">
              <button
                type="button"
                className="btn-link"
                onClick={() => setShowAdd(false)}
                aria-label="Close"
              >
                Close
              </button>
            </div>
            <AddTransaction />
          </div>
        </div>
      )}
    </div>
  );
}
