import type { Transaction } from '../lib/db';
import { formatCurrency } from '../lib/currency';
import { shortId, type MemberNames } from '../lib/members';
import { calculateStatistics } from '../lib/statistics';
import { Badge } from '../components/ui/badge';
import { Progress } from '../components/ui/progress';

const DATE_LABEL = new Intl.DateTimeFormat('en-MY', { day: 'numeric', month: 'short' });
const TIME_LABEL = new Intl.DateTimeFormat('en-MY', {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
});

function titleFor(transaction: Transaction): string {
  return transaction.note?.trim() || transaction.chip || 'Spending';
}

export default function Statistics({
  transactions,
  memberNames,
}: {
  transactions: Transaction[];
  memberNames: MemberNames;
}) {
  const statistics = calculateStatistics(transactions);
  const categoryMax = statistics.categories[0]?.amount ?? 1;

  return (
    <section className="statistics-screen" aria-labelledby="statistics-title">
      <header className="view-header">
        <div>
          <p className="section-eyebrow">Monthly breakdown</p>
          <h1 id="statistics-title">Statistics</h1>
          <p>Understand where your shared budget is going.</p>
        </div>
      </header>

      <section className="statistics-summary-grid" aria-label="Spending summary">
        <article>
          <span>Total spent</span>
          <strong>{formatCurrency(statistics.totalSpent)}</strong>
        </article>
        <article>
          <span>Daily average</span>
          <strong>{formatCurrency(statistics.averagePerActiveDay)}</strong>
        </article>
        <article>
          <span>Transactions</span>
          <strong>{statistics.transactionCount}</strong>
        </article>
        <article>
          <span>Highest day</span>
          <strong>
            {statistics.highestSpendDay ? formatCurrency(statistics.highestSpendDay.amount) : '—'}
          </strong>
          {statistics.highestSpendDay && (
            <small>
              {DATE_LABEL.format(new Date(`${statistics.highestSpendDay.date}T12:00:00`))}
            </small>
          )}
        </article>
      </section>

      <section className="statistics-panel" aria-labelledby="category-title">
        <div className="section-title-row">
          <h2 id="category-title">By category</h2>
          <Badge variant="outline">{statistics.categories.length}</Badge>
        </div>
        {statistics.categories.length === 0 ? (
          <p className="plan-empty">Add spending to see category patterns.</p>
        ) : (
          <ol className="category-list">
            {statistics.categories.map((category) => (
              <li key={category.category}>
                <div className="category-row">
                  <span>{category.category}</span>
                  <strong>{formatCurrency(category.amount)}</strong>
                </div>
                <Progress
                  className="category-progress"
                  value={category.amount}
                  max={categoryMax}
                  aria-label={`${category.category} spending share`}
                />
                <small>
                  {category.count} transaction{category.count === 1 ? '' : 's'}
                </small>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="statistics-panel" aria-labelledby="largest-title">
        <div className="section-title-row">
          <h2 id="largest-title">Top 5 purchases</h2>
          <Badge variant="outline">{statistics.largestPurchases.length}</Badge>
        </div>
        {statistics.largestPurchases.length === 0 ? (
          <p className="plan-empty">Your biggest purchases will appear here.</p>
        ) : (
          <ol className="largest-purchases-list">
            {statistics.largestPurchases.map((transaction, index) => (
              <li key={transaction.id}>
                <span className="purchase-rank">{index + 1}</span>
                <div>
                  <p>{titleFor(transaction)}</p>
                  <span>
                    {TIME_LABEL.format(new Date(transaction.spent_at))} · Paid by{' '}
                    {memberNames[transaction.payer_id ?? transaction.created_by] ??
                      shortId(transaction.payer_id ?? transaction.created_by)}
                  </span>
                </div>
                <strong>{formatCurrency(transaction.amount)}</strong>
              </li>
            ))}
          </ol>
        )}
      </section>
    </section>
  );
}
