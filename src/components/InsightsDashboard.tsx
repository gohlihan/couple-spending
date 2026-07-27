import type { Budget, Transaction } from '../lib/db';
import { formatCurrency } from '../lib/currency';
import { shortId, type MemberNames } from '../lib/members';

const DAY_LABEL = new Intl.DateTimeFormat('en-MY', { weekday: 'narrow' });
const TRANSACTION_TIME = new Intl.DateTimeFormat('en-MY', {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
});

interface InsightsDashboardProps {
  transactions: Transaction[];
  budget: Budget | null;
  memberNames: MemberNames;
  month: Date;
}

interface ChartPoint {
  label: string;
  value: number;
}

interface AnalyticsCardProps {
  label: string;
  value: string;
  detail: string;
  points: ChartPoint[];
  tone?: 'default' | 'positive';
}

function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function lastSevenDays(month: Date): Date[] {
  const now = new Date();
  const isCurrentMonth =
    month.getFullYear() === now.getFullYear() && month.getMonth() === now.getMonth();
  const end = isCurrentMonth
    ? new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12)
    : new Date(month.getFullYear(), month.getMonth() + 1, 0, 12);

  return Array.from({ length: 7 }, (_, index) => addDays(end, index - 6));
}

function buildDailyPoints(transactions: Transaction[], month: Date): ChartPoint[] {
  const totals = new Map<string, number>();
  for (const transaction of transactions) {
    const key = localDayKey(new Date(transaction.spent_at));
    totals.set(key, (totals.get(key) ?? 0) + transaction.amount);
  }

  return lastSevenDays(month).map((day) => ({
    label: DAY_LABEL.format(day),
    value: totals.get(localDayKey(day)) ?? 0,
  }));
}

function titleCase(value: string): string {
  return value.replace(/\b\w/g, (character) => character.toUpperCase());
}

function transactionTitle(transaction: Transaction): string {
  return transaction.note?.trim() || (transaction.chip ? titleCase(transaction.chip) : 'Spending');
}

function transactionIcon(transaction: Transaction): string {
  const icons: Record<string, string> = {
    eat: 'E',
    shop: 'S',
    petrol: 'P',
    bills: 'B',
    fun: 'F',
  };
  return transaction.chip ? (icons[transaction.chip] ?? transaction.chip[0]?.toUpperCase()) : '•';
}

function MicroChart({ points, label }: { points: ChartPoint[]; label: string }) {
  const chartHeight = 46;
  const chartBottom = 42;
  const maxValue = Math.max(...points.map((point) => point.value), 1);
  const step = 100 / Math.max(points.length - 1, 1);

  return (
    <div className="microchart" role="img" aria-label={`${label} over the past seven days`}>
      <svg viewBox="0 0 100 52" preserveAspectRatio="none" aria-hidden="true">
        {points.map((point, index) => {
          const x = index * step;
          const y = chartBottom - (point.value / maxValue) * chartHeight;
          return (
            <g key={`${point.label}-${index}`}>
              <line className="microchart-stem" x1={x} x2={x} y1={chartBottom} y2={y} />
              <circle className="microchart-point" cx={x} cy={y} r="2.4" />
            </g>
          );
        })}
      </svg>
      <div className="microchart-labels" aria-hidden="true">
        {points.map((point, index) => (
          <span key={`${point.label}-${index}`}>{point.label}</span>
        ))}
      </div>
    </div>
  );
}

function AnalyticsCard({ label, value, detail, points, tone = 'default' }: AnalyticsCardProps) {
  return (
    <article className={`analytics-card analytics-card-${tone}`}>
      <p className="analytics-card-label">{label}</p>
      <p className="analytics-card-value">{value}</p>
      <p className="analytics-card-detail">{detail}</p>
      <MicroChart points={points} label={label} />
    </article>
  );
}

/**
 * Month analytics and the transaction list are derived solely from the local
 * Dexie-backed records supplied by Main, so the screen works offline too.
 */
export default function InsightsDashboard({
  transactions,
  budget,
  memberNames,
  month,
}: InsightsDashboardProps) {
  const totalSpent = transactions.reduce((sum, transaction) => sum + transaction.amount, 0);
  const budgetAmount = budget?.amount ?? null;
  const remaining = budgetAmount === null ? null : budgetAmount - totalSpent;
  const activeDays = new Set(
    transactions.map((transaction) => localDayKey(new Date(transaction.spent_at))),
  ).size;
  const dailyAverage = activeDays > 0 ? totalSpent / activeDays : 0;
  const points = buildDailyPoints(transactions, month);
  const weeklySpent = points.reduce((sum, point) => sum + point.value, 0);
  const recentTransactions = [...transactions]
    .sort((left, right) => right.spent_at.localeCompare(left.spent_at))
    .slice(0, 6);

  return (
    <>
      <section className="analytics-grid" aria-label="Monthly analytics">
        <AnalyticsCard
          label="Spent"
          value={formatCurrency(totalSpent)}
          detail={`${transactions.length} transaction${transactions.length === 1 ? '' : 's'} this month`}
          points={points}
        />
        <AnalyticsCard
          label="Remaining"
          value={remaining === null ? 'Set a budget' : formatCurrency(remaining)}
          detail={
            budgetAmount === null
              ? 'Tap Budget below to begin'
              : `of ${formatCurrency(budgetAmount)} monthly`
          }
          points={points}
          tone="positive"
        />
        <AnalyticsCard
          label="Daily average"
          value={formatCurrency(dailyAverage)}
          detail={
            activeDays > 0
              ? `across ${activeDays} active day${activeDays === 1 ? '' : 's'}`
              : 'No spending logged yet'
          }
          points={points}
        />
        <AnalyticsCard
          label="Last 7 days"
          value={formatCurrency(weeklySpent)}
          detail="Rolling activity view"
          points={points}
        />
      </section>

      <section
        className="recent-transactions"
        id="recent-transactions"
        aria-labelledby="recent-title"
      >
        <header className="recent-transactions-header">
          <div>
            <p className="section-eyebrow">Activity</p>
            <h2 id="recent-title">Recent transactions</h2>
          </div>
          <span className="recent-count">{transactions.length}</span>
        </header>

        {recentTransactions.length === 0 ? (
          <p className="recent-empty">No transactions for this month yet.</p>
        ) : (
          <ol className="transaction-list">
            {recentTransactions.map((transaction) => {
              const who = memberNames[transaction.created_by] ?? shortId(transaction.created_by);
              return (
                <li key={transaction.id} className="transaction-row">
                  <span className="transaction-category-icon" aria-hidden="true">
                    {transactionIcon(transaction)}
                  </span>
                  <div className="transaction-row-copy">
                    <p className="transaction-row-title">{transactionTitle(transaction)}</p>
                    <p className="transaction-row-meta">
                      {TRANSACTION_TIME.format(new Date(transaction.spent_at))} · {who}
                    </p>
                  </div>
                  <span className="transaction-row-amount">
                    {formatCurrency(transaction.amount)}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </>
  );
}
