import type { Transaction } from '../lib/db';
import { formatCurrency } from '../lib/currency';
import { shortId, type MemberNames } from '../lib/members';
import { calculateStatistics } from '../lib/statistics';
import { Badge } from '../components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../components/ui/card';
import { Progress } from '../components/ui/progress';
import { Separator } from '../components/ui/separator';

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
        <Card as="article">
          <CardHeader className="statistics-metric-header">
            <CardTitle className="statistics-metric-label">Total spent</CardTitle>
          </CardHeader>
          <CardContent className="statistics-metric-content">
            <strong>{formatCurrency(statistics.totalSpent)}</strong>
          </CardContent>
        </Card>
        <Card as="article">
          <CardHeader className="statistics-metric-header">
            <CardTitle className="statistics-metric-label">Daily average</CardTitle>
          </CardHeader>
          <CardContent className="statistics-metric-content">
            <strong>{formatCurrency(statistics.averagePerActiveDay)}</strong>
          </CardContent>
        </Card>
        <Card as="article">
          <CardHeader className="statistics-metric-header">
            <CardTitle className="statistics-metric-label">Transactions</CardTitle>
          </CardHeader>
          <CardContent className="statistics-metric-content">
            <strong>{statistics.transactionCount}</strong>
          </CardContent>
        </Card>
        <Card as="article">
          <CardHeader className="statistics-metric-header">
            <CardTitle className="statistics-metric-label">Highest day</CardTitle>
          </CardHeader>
          <CardContent className="statistics-metric-content">
            <strong>
              {statistics.highestSpendDay ? formatCurrency(statistics.highestSpendDay.amount) : '—'}
            </strong>
            {statistics.highestSpendDay && (
              <small>
                {DATE_LABEL.format(new Date(`${statistics.highestSpendDay.date}T12:00:00`))}
              </small>
            )}
          </CardContent>
        </Card>
      </section>

      <Card as="section" className="statistics-panel" aria-labelledby="category-title">
        <CardHeader className="statistics-panel-header">
          <div className="section-title-row">
            <CardTitle id="category-title">By category</CardTitle>
            <Badge variant="outline">{statistics.categories.length}</Badge>
          </div>
        </CardHeader>
        <CardContent className="statistics-panel-content">
          {statistics.categories.length === 0 ? (
            <p className="plan-empty">Add spending to see category patterns.</p>
          ) : (
            <ol className="category-list">
              {statistics.categories.map((category, index) => (
                <li key={category.category}>
                  {index > 0 && <Separator className="statistics-list-separator" />}
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
        </CardContent>
      </Card>

      <Card as="section" className="statistics-panel" aria-labelledby="largest-title">
        <CardHeader className="statistics-panel-header">
          <div className="section-title-row">
            <CardTitle id="largest-title">Top 5 purchases</CardTitle>
            <Badge variant="outline">{statistics.largestPurchases.length}</Badge>
          </div>
        </CardHeader>
        <CardContent className="statistics-panel-content">
          {statistics.largestPurchases.length === 0 ? (
            <p className="plan-empty">Your biggest purchases will appear here.</p>
          ) : (
            <ol className="largest-purchases-list">
              {statistics.largestPurchases.map((transaction, index) => (
                <li key={transaction.id}>
                  {index > 0 && <Separator className="statistics-list-separator" />}
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
        </CardContent>
      </Card>
    </section>
  );
}
