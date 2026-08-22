import { useState } from 'react';
import {
  ChartColumn,
  ChartNoAxesCombined,
  Ellipsis,
  KeyRound,
  Link2,
  ListChecks,
  LogOut,
  Plus,
  Settings2,
  UserPlus,
} from 'lucide-react';
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
import LinkPartner from './LinkPartner';
import {
  activityTitle,
  useHouseholdPresence,
  useRecentHouseholdActivity,
} from '../lib/household-activity';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { FieldError } from '../components/ui/field';
import { Separator } from '../components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '../components/ui/sheet';

type View = 'insights' | 'plan' | 'statistics';
type NavItem = View | 'add' | 'more';

interface MainProps {
  onSignOut: () => void;
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
  const [showLinkPartner, setShowLinkPartner] = useState(false);
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

  function activeView(): void {
    setActiveTab(view);
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

  function closeMenuFromSheet(open: boolean) {
    setMenuOpen(open);
    if (!open) {
      setShowInvite(false);
      setShowLinkPartner(false);
      activeView();
    }
  }

  function closeBudgetSheet(open: boolean) {
    setShowBudget(open);
    if (!open) activeView();
  }

  function closePasswordSheet(open: boolean) {
    setShowPassword(open);
    if (!open) activeView();
  }

  function closeAddSheet(open: boolean) {
    setShowAdd(open);
    if (!open) activeView();
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
          <Statistics
            transactions={transactions}
            memberNames={memberNames}
            month={month}
            onOpenTransaction={setDetailTransaction}
          />
        )}
      </main>

      <Sheet open={menuOpen} onOpenChange={closeMenuFromSheet}>
        <SheetContent side="right" className="app-menu" aria-describedby="more-description">
          <SheetHeader className="app-menu-header">
            <p className="section-eyebrow">Couple Spending</p>
            <SheetTitle>More</SheetTitle>
            <SheetDescription id="more-description" className="sr-only">
              Household status, sharing, account, and synchronization settings.
            </SheetDescription>
          </SheetHeader>

          <div className="app-menu-content">
            <Card className="menu-sync-row">
              <span className="menu-sync-label">Sync status</span>
              <Badge
                variant="outline"
                className={`sync-status sync-status-${sync.status.replace(' ', '-')}`}
                role="status"
                aria-live="polite"
              >
                {sync.status}
              </Badge>
            </Card>
            {(sync.pendingCount > 0 || sync.failedCount > 0) && (
              <p className="menu-sync-detail">
                {sync.pendingCount > 0 && `${sync.pendingCount} pending`}
                {sync.pendingCount > 0 && sync.failedCount > 0 && ' · '}
                {sync.failedCount > 0 && `${sync.failedCount} failed`}
              </p>
            )}

            <Card as="section" className="menu-panel" aria-labelledby="household-status-title">
              <p className="section-eyebrow">Household</p>
              <h3 id="household-status-title">Who's online</h3>
              <ul className="presence-list">
                {Array.from(new Set([...Object.keys(memberNames), ...(user ? [user.id] : [])])).map(
                  (memberId) => {
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
                  },
                )}
              </ul>
              {!presence.connected && (
                <p className="menu-panel-note">Presence reconnects when online.</p>
              )}
            </Card>

            <Card as="section" className="menu-panel" aria-labelledby="recent-activity-title">
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
            </Card>

            <Separator className="menu-separator" />

            <Button variant="ghost" className="menu-item" onClick={openBudget}>
              <Settings2 aria-hidden="true" />
              Budget settings
            </Button>
            {inviteCode && (
              <>
                <Button
                  variant="ghost"
                  className="menu-item"
                  onClick={() => setShowInvite((visible) => !visible)}
                >
                  <UserPlus aria-hidden="true" />
                  {showInvite ? 'Hide invite code' : 'Invite partner'}
                </Button>
                {showInvite && <Invite />}
              </>
            )}
            <Button
              variant="ghost"
              className="menu-item"
              onClick={() => setShowLinkPartner((visible) => !visible)}
            >
              <Link2 aria-hidden="true" />
              {showLinkPartner ? 'Hide link form' : 'Link with partner'}
            </Button>
            {showLinkPartner && <LinkPartner />}
            <Button variant="ghost" className="menu-item" onClick={openPassword}>
              <KeyRound aria-hidden="true" />
              Change password
            </Button>
            <Button
              variant="ghost"
              className="menu-item menu-item-danger"
              onClick={() => {
                setMenuOpen(false);
                onSignOut();
              }}
            >
              <LogOut aria-hidden="true" />
              Sign out
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <nav className="bottom-nav" aria-label="Primary navigation">
        <Button
          variant="ghost"
          className={`bottom-nav-item${activeTab === 'insights' ? ' is-active' : ''}`}
          aria-current={activeTab === 'insights' ? 'page' : undefined}
          onClick={() => openView('insights')}
        >
          <ChartNoAxesCombined aria-hidden="true" />
          <span>Insights</span>
        </Button>
        <Button
          variant="ghost"
          className={`bottom-nav-item${activeTab === 'plan' ? ' is-active' : ''}`}
          aria-current={activeTab === 'plan' ? 'page' : undefined}
          onClick={() => openView('plan')}
        >
          <ListChecks aria-hidden="true" />
          <span>Plan</span>
        </Button>
        <Button
          variant="ghost"
          className={`bottom-nav-item bottom-nav-add${activeTab === 'add' ? ' is-active' : ''}`}
          aria-current={activeTab === 'add' ? 'page' : undefined}
          onClick={openAdd}
        >
          <Plus aria-hidden="true" />
          <span>Add</span>
        </Button>
        <Button
          variant="ghost"
          className={`bottom-nav-item${activeTab === 'statistics' ? ' is-active' : ''}`}
          aria-current={activeTab === 'statistics' ? 'page' : undefined}
          onClick={() => openView('statistics')}
        >
          <ChartColumn aria-hidden="true" />
          <span>Statistics</span>
        </Button>
        <Button
          variant="ghost"
          className={`bottom-nav-item${activeTab === 'more' ? ' is-active' : ''}`}
          aria-current={activeTab === 'more' ? 'page' : undefined}
          onClick={() => openMore()}
        >
          <Ellipsis aria-hidden="true" />
          <span>More</span>
        </Button>
      </nav>

      <Sheet open={showBudget} onOpenChange={closeBudgetSheet}>
        <SheetContent side="bottom" className="sheet" aria-describedby="budget-sheet-description">
          <SheetHeader className="sr-only">
            <SheetTitle>Budget settings</SheetTitle>
            <SheetDescription id="budget-sheet-description">
              Update the shared monthly budget.
            </SheetDescription>
          </SheetHeader>
          <BudgetSettings budget={budget} />
        </SheetContent>
      </Sheet>

      <Sheet open={showPassword} onOpenChange={closePasswordSheet}>
        <SheetContent side="bottom" className="sheet" aria-describedby="password-sheet-description">
          <SheetHeader className="sr-only">
            <SheetTitle>Change password</SheetTitle>
            <SheetDescription id="password-sheet-description">
              Change the password for your Couple Spending account.
            </SheetDescription>
          </SheetHeader>
          <ChangePassword />
        </SheetContent>
      </Sheet>

      <Sheet open={showAdd} onOpenChange={closeAddSheet}>
        <SheetContent side="bottom" className="sheet" aria-describedby="add-sheet-description">
          <SheetHeader className="sr-only">
            <SheetTitle>Add transaction</SheetTitle>
            <SheetDescription id="add-sheet-description">
              Record a new shared spending transaction.
            </SheetDescription>
          </SheetHeader>
          <AddTransaction />
        </SheetContent>
      </Sheet>

      <Dialog
        open={Boolean(detailTransaction)}
        onOpenChange={(open) => {
          if (!open) setDetailTransaction(null);
        }}
      >
        {detailTransaction && (
          <DialogContent className="transaction-detail-dialog">
            <section className="transaction-detail">
              <DialogHeader>
                <p className="section-eyebrow">Transaction</p>
                <DialogTitle>{formatCurrency(detailTransaction.amount)}</DialogTitle>
                <DialogDescription className="sr-only">
                  Details and actions for this transaction.
                </DialogDescription>
              </DialogHeader>
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
                  <dt>Paid by</dt>
                  <dd>
                    {memberNames[detailTransaction.payer_id ?? detailTransaction.created_by] ??
                      shortId(detailTransaction.payer_id ?? detailTransaction.created_by)}
                  </dd>
                </div>
                <div>
                  <dt>Logged by</dt>
                  <dd>
                    {memberNames[detailTransaction.created_by] ??
                      shortId(detailTransaction.created_by)}
                  </dd>
                </div>
                <div>
                  <dt>Tag</dt>
                  <dd>{detailTransaction.chip || 'None'}</dd>
                </div>
              </dl>
              <div className="transaction-detail-actions">
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditTransaction(detailTransaction);
                    setDetailTransaction(null);
                  }}
                >
                  Edit transaction
                </Button>
                <Button
                  variant="destructive"
                  className="detail-delete-button"
                  onClick={() => {
                    setTransactionActionError(null);
                    setDeleteTransaction(detailTransaction);
                    setDetailTransaction(null);
                  }}
                >
                  Delete transaction
                </Button>
              </div>
            </section>
          </DialogContent>
        )}
      </Dialog>

      <Sheet
        open={Boolean(editTransaction)}
        onOpenChange={(open) => {
          if (!open) setEditTransaction(null);
        }}
      >
        {editTransaction && (
          <SheetContent side="bottom" className="sheet" aria-describedby="edit-sheet-description">
            <SheetHeader className="sr-only">
              <SheetTitle>Edit transaction</SheetTitle>
              <SheetDescription id="edit-sheet-description">
                Update this spending transaction.
              </SheetDescription>
            </SheetHeader>
            <AddTransaction
              transaction={editTransaction}
              onSaved={() => setEditTransaction(null)}
            />
          </SheetContent>
        )}
      </Sheet>

      <AlertDialog
        open={Boolean(deleteTransaction)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTransaction(null);
            setTransactionActionError(null);
          }
        }}
      >
        {deleteTransaction && (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete transaction?</AlertDialogTitle>
              <AlertDialogDescription>
                This removes it from your timeline and keeps an audit record after sync.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {transactionActionError && (
              <FieldError className="form-message">{transactionActionError}</FieldError>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel>Keep it</AlertDialogCancel>
              <AlertDialogAction
                onClick={(event) => {
                  event.preventDefault();
                  void confirmDeleteTransaction();
                }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </div>
  );
}
