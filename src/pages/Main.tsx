import { useEffect, useState } from 'react';
import { useAuth } from '../lib/use-auth';
import { useBudget } from '../lib/budget';
import { useHouseholdMembers } from '../lib/members';
import { useMonthTransactions } from '../lib/use-month-transactions';
import { useSync } from '../lib/sync';
import DateBar from '../components/DateBar';
import Waterfall from '../components/Waterfall';
import AddTransaction from './AddTransaction';
import BudgetSettings from './BudgetSettings';
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
  const [showBudget, setShowBudget] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const budget = useBudget(householdId);
  const transactions = useMonthTransactions(householdId, month);
  const memberNames = useHouseholdMembers(householdId);
  const sync = useSync(householdId);

  useEffect(() => {
    if (!menuOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [menuOpen]);

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Couple Spending</h1>
        <button
          type="button"
          className="hamburger-button"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          aria-controls="app-menu"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span aria-hidden="true">☰</span>
        </button>
      </header>

      {menuOpen && (
        <div
          className="app-menu-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) setMenuOpen(false);
          }}
        >
          <aside id="app-menu" className="app-menu" role="dialog" aria-modal="true" aria-label="App menu">
            <div className="app-menu-header">
              <h2>Menu</h2>
              <button
                type="button"
                className="menu-close-button"
                aria-label="Close menu"
                onClick={() => setMenuOpen(false)}
              >
                ×
              </button>
            </div>

            <div className="app-menu-content">
              <div className="menu-sync-row">
                <span className="menu-sync-label">Sync status</span>
                <span
                  className={`sync-status sync-status-${sync.status.replace(' ', '-')}`}
                  role="status"
                  aria-live="polite"
                >
                  {sync.status}
                </span>
              </div>
              {(sync.pendingCount > 0 || sync.failedCount > 0) && (
                <p className="menu-sync-detail muted">
                  {sync.pendingCount > 0 && `${sync.pendingCount} pending`}
                  {sync.pendingCount > 0 && sync.failedCount > 0 && ' · '}
                  {sync.failedCount > 0 && `${sync.failedCount} failed`}
                </p>
              )}

              <button
                type="button"
                className="menu-item"
                onClick={() => {
                  setMenuOpen(false);
                  setShowBudget(true);
                }}
              >
                Budget settings
              </button>

              {inviteCode && (
                <>
                  <button
                    type="button"
                    className="menu-item"
                    onClick={() => setShowInvite((visible) => !visible)}
                  >
                    {showInvite ? 'Hide invite code' : 'Show invite code'}
                  </button>
                  {showInvite && <Invite />}
                </>
              )}

              <button
                type="button"
                className="menu-item menu-item-danger"
                onClick={() => {
                  setMenuOpen(false);
                  onSignOut();
                }}
              >
                Sign out
              </button>
            </div>
          </aside>
        </div>
      )}

      <DateBar month={month} onChange={setMonth} />

      <main className="app-main">
        <p className="welcome">Hi, {displayName ?? user?.email ?? 'there'} 👋</p>

        <Waterfall transactions={transactions} budget={budget} memberNames={memberNames} />
      </main>

      <button
        type="button"
        className="fab"
        onClick={() => setShowAdd(true)}
        aria-label="Add transaction"
      >
        +
      </button>

      {showBudget && (
        <div
          className="sheet-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Budget settings"
          onClick={(event) => {
            if (event.target === event.currentTarget) setShowBudget(false);
          }}
        >
          <div className="sheet">
            <div className="sheet-handle-row">
              <button
                type="button"
                className="btn-link"
                onClick={() => setShowBudget(false)}
                aria-label="Close budget settings"
              >
                Close
              </button>
            </div>
            <BudgetSettings budget={budget} />
          </div>
        </div>
      )}

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
