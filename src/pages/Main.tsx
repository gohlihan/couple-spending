import { useEffect, useState } from 'react';
import type { Transaction } from '../lib/db';
import { formatCurrency } from '../lib/currency';
import { softDeleteTransaction } from '../lib/transactions';
import { useAuth } from '../lib/use-auth';
import { useBudget } from '../lib/budget';
import { shortId, useHouseholdMembers } from '../lib/members';
import { useMonthTransactions } from '../lib/use-month-transactions';
import { useSync } from '../lib/sync';
import DateBar from '../components/DateBar';
import InsightsDashboard from '../components/InsightsDashboard';
import AddTransaction from './AddTransaction';
import BudgetSettings from './BudgetSettings';
import Invite from './Invite';
import Plan from './Plan';
import Statistics from './Statistics';
import ChangePassword from './ChangePassword';
import {
  activityTitle,
  useHouseholdPresence,
  useRecentHouseholdActivity,
} from '../lib/household-activity';

type View = 'insights' | 'plan' | 'statistics';
type NavItem = View | 'add' | 'more';
type IconName = NavItem;

interface MainProps {
  onSignOut: () => void;
}

function NavIcon({ name }: { name: IconName }) {
  const common = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  if (name === 'insights') {
    return (
      <svg {...common}>
        <path d="M4 19V9m5 10V5m5 14v-7m5 7V3" />
      </svg>
    );
  }
  if (name === 'plan') {
    return (
      <svg {...common}>
        <path d="M5 4h14v16H5z" />
        <path d="m8 9 2 2 4-4M8 15h8" />
      </svg>
    );
  }
  if (name === 'add') {
    return (
      <svg {...common}>
        <path d="M12 5v14M5 12h14" />
      </svg>
    );
  }
  if (name === 'statistics') {
    return (
      <svg {...common}>
        <path d="M5 19V11m5 8V5m5 14v-5m5 5V8" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="5" cy="12" r="1" fill="currentColor" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
      <circle cx="19" cy="12" r="1" fill="currentColor" />
    </svg>
  );
}

function displayGreeting(name: string | null, email: string | undefined): string {
  if (name?.trim()) return name.trim();
  return email?.split('@')[0] || 'there';
}

const ACTIVITY_TIME_LABEL = new Intl.DateTimeFormat('en-MY', {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
});

export default function Main({ onSignOut }: MainProps) {
  const { user, displayName, householdId, inviteCode } = useAuth();
  const [month, setMonth] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  });
  const [view, setView] = useState<View>('insights');
  const [activeTab, setActiveTab] = useState<NavItem>('insights');
  const [showAdd, setShowAdd] = useState(false);
  const [showBudget, setShowBudget] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [detailTransaction, setDetailTransaction] = useState<Transaction | null>(null);
  const [editTransaction, setEditTransaction] = useState<Transaction | null>(null);
  const [deleteTransaction, setDeleteTransaction] = useState<Transaction | null>(null);
  const [transactionActionError, setTransactionActionError] = useState<string | null>(null);

  const budget = useBudget(householdId);
  const transactions = useMonthTransactions(householdId, month);
  const memberNames = useHouseholdMembers(householdId);
  const presence = useHouseholdPresence(householdId, user?.id ?? null, displayName);
  const recentActivity = useRecentHouseholdActivity(householdId);
  const sync = useSync(householdId);

  useEffect(() => {
    if (!menuOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        setActiveTab(view);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [menuOpen, view]);

  function activeView(): void {
    setActiveTab(view);
  }

  function closeMenu() {
    setMenuOpen(false);
    activeView();
  }

  function openView(nextView: View) {
    setView(nextView);
    setActiveTab(nextView);
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openBudget() {
    setMenuOpen(false);
    setShowBudget(true);
  }

  function openAdd() {
    setShowAdd(true);
    setActiveTab('add');
  }

  function openPassword() {
    setMenuOpen(false);
    setShowPassword(true);
  }

  function openMore(showInviteCode = false) {
    setShowInvite(showInviteCode);
    setMenuOpen(true);
    setActiveTab('more');
  }

  async function confirmDeleteTransaction() {
    if (!deleteTransaction) return;
    setTransactionActionError(null);
    try {
      await softDeleteTransaction(deleteTransaction, { user, householdId });
      setDeleteTransaction(null);
      setDetailTransaction(null);
    } catch (error) {
      setTransactionActionError(
        error instanceof Error ? error.message : 'Could not remove this transaction.',
      );
    }
  }

  const greeting = displayGreeting(displayName, user?.email);
  const screenTitle = view === 'insights' ? 'Insights' : view === 'plan' ? 'Plan' : 'Statistics';

  return (
    <div className="app-shell">
      {view === 'insights' && (
        <header className="insights-header" id="insights-top">
          <div>
            <p className="header-greeting">Hello, {greeting}</p>
            <h1>{screenTitle}</h1>
          </div>
        </header>
      )}

      {view !== 'plan' && <DateBar month={month} onChange={setMonth} />}

      <main className="app-main">
        {view === 'insights' && (
          <InsightsDashboard
            transactions={transactions}
            budget={budget}
            memberNames={memberNames}
            month={month}
            onOpenTransaction={setDetailTransaction}
          />
        )}
        {view === 'plan' && <Plan memberNames={memberNames} />}
        {view === 'statistics' && (
          <Statistics transactions={transactions} memberNames={memberNames} />
        )}
      </main>

      {menuOpen && (
        <div
          className="app-menu-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeMenu();
          }}
        >
          <aside
            id="app-menu"
            className="app-menu"
            role="dialog"
            aria-modal="true"
            aria-label="More options"
          >
            <div className="app-menu-header">
              <div>
                <p className="section-eyebrow">Couple Spending</p>
                <h2>More</h2>
              </div>
              <button
                type="button"
                className="menu-close-button"
                aria-label="Close menu"
                onClick={closeMenu}
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
                <p className="menu-sync-detail">
                  {sync.pendingCount > 0 && `${sync.pendingCount} pending`}
                  {sync.pendingCount > 0 && sync.failedCount > 0 && ' · '}
                  {sync.failedCount > 0 && `${sync.failedCount} failed`}
                </p>
              )}

              <section className="menu-panel" aria-labelledby="household-status-title">
                <p className="section-eyebrow">Household</p>
                <h3 id="household-status-title">Who's online</h3>
                <ul className="presence-list">
                  {Array.from(
                    new Set([...Object.keys(memberNames), ...(user ? [user.id] : [])]),
                  ).map((memberId) => {
                    const isCurrentUser = memberId === user?.id;
                    const online = isCurrentUser || presence.onlineUserIds.has(memberId);
                    return (
                      <li key={memberId}>
                        <span className={`presence-dot${online ? ' is-online' : ''}`} />
                        <span>
                          {memberNames[memberId] ?? (isCurrentUser ? greeting : shortId(memberId))}
                          {isCurrentUser ? ' (you)' : ''}
                        </span>
                        <small>{online ? 'Online' : 'Offline'}</small>
                      </li>
                    );
                  })}
                </ul>
                {!presence.connected && (
                  <p className="menu-panel-note">Presence reconnects when online.</p>
                )}
              </section>

              <section className="menu-panel" aria-labelledby="recent-activity-title">
                <div className="menu-panel-heading">
                  <div>
                    <p className="section-eyebrow">Shared history</p>
                    <h3 id="recent-activity-title">Recent activity</h3>
                  </div>
                </div>
                {recentActivity.length === 0 ? (
                  <p className="menu-panel-note">Recent synced changes will appear here.</p>
                ) : (
                  <ol className="recent-activity-list">
                    {recentActivity.map((activity) => (
                      <li key={activity.id}>
                        <p>
                          {activity.changed_by
                            ? (memberNames[activity.changed_by] ?? shortId(activity.changed_by))
                            : 'System'}{' '}
                          {activityTitle(activity)}
                        </p>
                        <span>{ACTIVITY_TIME_LABEL.format(new Date(activity.changed_at))}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </section>

              <button type="button" className="menu-item" onClick={openBudget}>
                Budget settings
              </button>
              {inviteCode && (
                <>
                  <button
                    type="button"
                    className="menu-item"
                    onClick={() => setShowInvite((visible) => !visible)}
                  >
                    {showInvite ? 'Hide invite code' : 'Invite partner'}
                  </button>
                  {showInvite && <Invite />}
                </>
              )}
              <button type="button" className="menu-item" onClick={openPassword}>
                Change password
              </button>
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

      <nav className="bottom-nav" aria-label="Primary navigation">
        <button
          type="button"
          className={`bottom-nav-item${activeTab === 'insights' ? ' is-active' : ''}`}
          aria-current={activeTab === 'insights' ? 'page' : undefined}
          onClick={() => openView('insights')}
        >
          <NavIcon name="insights" />
          <span>Insights</span>
        </button>
        <button
          type="button"
          className={`bottom-nav-item${activeTab === 'plan' ? ' is-active' : ''}`}
          aria-current={activeTab === 'plan' ? 'page' : undefined}
          onClick={() => openView('plan')}
        >
          <NavIcon name="plan" />
          <span>Plan</span>
        </button>
        <button
          type="button"
          className={`bottom-nav-item bottom-nav-add${activeTab === 'add' ? ' is-active' : ''}`}
          aria-current={activeTab === 'add' ? 'page' : undefined}
          onClick={openAdd}
        >
          <NavIcon name="add" />
          <span>Add</span>
        </button>
        <button
          type="button"
          className={`bottom-nav-item${activeTab === 'statistics' ? ' is-active' : ''}`}
          aria-current={activeTab === 'statistics' ? 'page' : undefined}
          onClick={() => openView('statistics')}
        >
          <NavIcon name="statistics" />
          <span>Statistics</span>
        </button>
        <button
          type="button"
          className={`bottom-nav-item${activeTab === 'more' ? ' is-active' : ''}`}
          aria-current={activeTab === 'more' ? 'page' : undefined}
          onClick={() => openMore()}
        >
          <NavIcon name="more" />
          <span>More</span>
        </button>
      </nav>

      {showBudget && (
        <div
          className="sheet-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Budget settings"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setShowBudget(false);
              activeView();
            }
          }}
        >
          <div className="sheet">
            <div className="sheet-handle-row">
              <button
                type="button"
                className="sheet-close-button"
                onClick={() => {
                  setShowBudget(false);
                  activeView();
                }}
                aria-label="Close budget settings"
              >
                Close
              </button>
            </div>
            <BudgetSettings budget={budget} />
          </div>
        </div>
      )}

      {showPassword && (
        <div
          className="sheet-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Change password"
          onClick={(event) => {
            if (event.target === event.currentTarget) setShowPassword(false);
          }}
        >
          <div className="sheet">
            <div className="sheet-handle-row">
              <button
                type="button"
                className="sheet-close-button"
                onClick={() => setShowPassword(false)}
                aria-label="Close change password"
              >
                Close
              </button>
            </div>
            <ChangePassword />
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
            if (event.target === event.currentTarget) {
              setShowAdd(false);
              activeView();
            }
          }}
        >
          <div className="sheet">
            <div className="sheet-handle-row">
              <button
                type="button"
                className="sheet-close-button"
                onClick={() => {
                  setShowAdd(false);
                  activeView();
                }}
                aria-label="Close add transaction"
              >
                Close
              </button>
            </div>
            <AddTransaction />
          </div>
        </div>
      )}

      {detailTransaction && (
        <div
          className="sheet-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Transaction details"
          onClick={(event) => {
            if (event.target === event.currentTarget) setDetailTransaction(null);
          }}
        >
          <div className="sheet transaction-detail-sheet">
            <div className="sheet-handle-row">
              <button
                type="button"
                className="sheet-close-button"
                onClick={() => setDetailTransaction(null)}
              >
                Close
              </button>
            </div>
            <section className="transaction-detail" aria-labelledby="transaction-detail-title">
              <p className="section-eyebrow">Transaction</p>
              <h2 id="transaction-detail-title">{formatCurrency(detailTransaction.amount)}</h2>
              <dl>
                <div>
                  <dt>Note</dt>
                  <dd>{detailTransaction.note || 'No note added'}</dd>
                </div>
                <div>
                  <dt>When</dt>
                  <dd>{new Date(detailTransaction.spent_at).toLocaleString('en-MY')}</dd>
                </div>
                <div>
                  <dt>Tag</dt>
                  <dd>{detailTransaction.chip || 'None'}</dd>
                </div>
              </dl>
              <div className="transaction-detail-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setEditTransaction(detailTransaction);
                    setDetailTransaction(null);
                  }}
                >
                  Edit transaction
                </button>
                <button
                  type="button"
                  className="detail-delete-button"
                  onClick={() => {
                    setDeleteTransaction(detailTransaction);
                    setDetailTransaction(null);
                  }}
                >
                  Delete transaction
                </button>
              </div>
            </section>
          </div>
        </div>
      )}

      {editTransaction && (
        <div
          className="sheet-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Edit transaction"
          onClick={(event) => {
            if (event.target === event.currentTarget) setEditTransaction(null);
          }}
        >
          <div className="sheet">
            <div className="sheet-handle-row">
              <button
                type="button"
                className="sheet-close-button"
                onClick={() => setEditTransaction(null)}
                aria-label="Close edit transaction"
              >
                Close
              </button>
            </div>
            <AddTransaction
              transaction={editTransaction}
              onSaved={() => setEditTransaction(null)}
            />
          </div>
        </div>
      )}

      {deleteTransaction && (
        <div
          className="sheet-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Delete transaction"
        >
          <div className="sheet delete-confirmation">
            <h2>Delete transaction?</h2>
            <p>This removes it from your timeline and keeps an audit record after sync.</p>
            {transactionActionError && (
              <p className="form-message form-error" role="alert">
                {transactionActionError}
              </p>
            )}
            <div className="delete-confirmation-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setDeleteTransaction(null)}
              >
                Keep it
              </button>
              <button
                type="button"
                className="detail-delete-button"
                onClick={() => void confirmDeleteTransaction()}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
