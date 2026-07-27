import { useEffect, useState } from 'react';
import { useAuth } from '../lib/use-auth';
import { useBudget } from '../lib/budget';
import { useHouseholdMembers } from '../lib/members';
import { useMonthTransactions } from '../lib/use-month-transactions';
import { useSync } from '../lib/sync';
import DateBar from '../components/DateBar';
import InsightsDashboard from '../components/InsightsDashboard';
import AddTransaction from './AddTransaction';
import BudgetSettings from './BudgetSettings';
import Invite from './Invite';

type NavItem = 'insights' | 'activity' | 'add' | 'budget' | 'more';
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
  if (name === 'activity') {
    return (
      <svg {...common}>
        <path d="M3 12h4l2.2-5 4 10 2.1-5H21" />
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
  if (name === 'budget') {
    return (
      <svg {...common}>
        <rect x="4" y="6" width="16" height="12" rx="2" />
        <path d="M16 12h.01" />
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

export default function Main({ onSignOut }: MainProps) {
  const { householdId, inviteCode } = useAuth();
  const [month, setMonth] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  });
  const [showAdd, setShowAdd] = useState(false);
  const [showBudget, setShowBudget] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<NavItem>('insights');

  const budget = useBudget(householdId);
  const transactions = useMonthTransactions(householdId, month);
  const memberNames = useHouseholdMembers(householdId);
  const sync = useSync(householdId);

  useEffect(() => {
    if (!menuOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        setActiveTab('insights');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [menuOpen]);

  function openBudget() {
    setMenuOpen(false);
    setShowBudget(true);
    setActiveTab('budget');
  }

  function openAdd() {
    setShowAdd(true);
    setActiveTab('add');
  }

  function openMore(showInviteCode = false) {
    setShowInvite(showInviteCode);
    setMenuOpen(true);
    setActiveTab('more');
  }

  function showActivity() {
    setActiveTab('activity');
    document.getElementById('recent-transactions')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }

  return (
    <div className="app-shell">
      <header className="insights-header" id="insights-top">
        <h1>Insights</h1>
        {inviteCode && (
          <button type="button" className="invite-promo" onClick={() => openMore(true)}>
            Invite partner
          </button>
        )}
      </header>

      <DateBar month={month} onChange={setMonth} />

      <main className="app-main">
        <InsightsDashboard
          transactions={transactions}
          budget={budget}
          memberNames={memberNames}
          month={month}
        />
      </main>

      {menuOpen && (
        <div
          className="app-menu-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setMenuOpen(false);
              setActiveTab('insights');
            }
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
                onClick={() => {
                  setMenuOpen(false);
                  setActiveTab('insights');
                }}
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

      <nav className="bottom-nav" aria-label="Primary navigation">
        <button
          type="button"
          className={`bottom-nav-item${activeTab === 'insights' ? ' is-active' : ''}`}
          aria-current={activeTab === 'insights' ? 'page' : undefined}
          onClick={() => {
            setActiveTab('insights');
            document.getElementById('insights-top')?.scrollIntoView({ behavior: 'smooth' });
          }}
        >
          <NavIcon name="insights" />
          <span>Insights</span>
        </button>
        <button
          type="button"
          className={`bottom-nav-item${activeTab === 'activity' ? ' is-active' : ''}`}
          aria-current={activeTab === 'activity' ? 'page' : undefined}
          onClick={showActivity}
        >
          <NavIcon name="activity" />
          <span>Activity</span>
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
          className={`bottom-nav-item${activeTab === 'budget' ? ' is-active' : ''}`}
          aria-current={activeTab === 'budget' ? 'page' : undefined}
          onClick={openBudget}
        >
          <NavIcon name="budget" />
          <span>Budget</span>
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
              setActiveTab('insights');
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
                  setActiveTab('insights');
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

      {showAdd && (
        <div
          className="sheet-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Add transaction"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setShowAdd(false);
              setActiveTab('insights');
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
                  setActiveTab('insights');
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
    </div>
  );
}
