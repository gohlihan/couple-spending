import type { Budget, Transaction } from '../lib/db';
import { shortId, type MemberNames } from '../lib/members';

const CURRENCY = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'USD',
});

const TIME_LABEL = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
});

interface WaterfallProps {
  transactions: Transaction[];
  budget: Budget | null;
  memberNames: MemberNames;
}

/**
 * Timeline of a month's transactions with the budget depleting as each spend
 * lands. Rows are chronological (oldest first) so the running remaining
 * descends down the list — the "waterfall". No chart libraries; a styled list.
 */
export default function Waterfall({ transactions, budget, memberNames }: WaterfallProps) {
  const budgetAmount = budget?.amount ?? null;
  const totalSpent = transactions.reduce((sum, t) => sum + t.amount, 0);
  const remaining = budgetAmount === null ? null : budgetAmount - totalSpent;

  // Precompute the running remaining after each transaction (ascending order).
  let running = budgetAmount ?? 0;
  const rows = transactions.map((transaction) => {
    running -= transaction.amount;
    return { transaction, remaining: budgetAmount === null ? null : running };
  });

  const whoEntered = (userId: string) => memberNames[userId] ?? shortId(userId);

  return (
    <section className="waterfall" aria-label="Spending timeline">
      <header className="waterfall-summary">
        <div className="waterfall-remaining">
          <span className="waterfall-remaining-label">Remaining</span>
          <span
            className={`waterfall-remaining-value${
              remaining !== null && remaining < 0 ? ' is-negative' : ''
            }`}
          >
            {remaining === null ? '—' : CURRENCY.format(remaining)}
          </span>
        </div>
        <p className="waterfall-summary-meta muted">
          {budgetAmount === null
            ? 'No budget set yet.'
            : `${CURRENCY.format(totalSpent)} of ${CURRENCY.format(budgetAmount)} spent`}
        </p>
      </header>

      {rows.length === 0 ? (
        <p className="muted waterfall-empty">No transactions this month yet.</p>
      ) : (
        <ol className="waterfall-list">
          {rows.map(({ transaction, remaining: rowRemaining }) => (
            <li key={transaction.id} className="waterfall-item">
              <div className="waterfall-item-main">
                <span className="waterfall-item-amount">
                  −{CURRENCY.format(transaction.amount)}
                </span>
                <span className="waterfall-item-running">
                  {rowRemaining === null ? '' : CURRENCY.format(rowRemaining)}
                </span>
              </div>
              <div className="waterfall-item-meta">
                <span className="waterfall-item-time">
                  {TIME_LABEL.format(new Date(transaction.spent_at))}
                </span>
                {transaction.chip && (
                  <span className="waterfall-chip">{transaction.chip}</span>
                )}
                <span className="waterfall-item-who">{whoEntered(transaction.created_by)}</span>
              </div>
              {transaction.note && (
                <p className="waterfall-item-note">{transaction.note}</p>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
