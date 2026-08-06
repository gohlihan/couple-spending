import type { Budget, Transaction } from '../lib/db';
import { formatCurrency } from '../lib/currency';
import type { MemberNames } from '../lib/members';
import { Badge } from './ui/badge';
import ActivityTransactionList from './ActivityTransactionList';

const DAY_LABEL = new Intl.DateTimeFormat('en-MY', { weekday: 'narrow' });

interface InsightsDashboardProps {
  transactions: Transaction[];
  budget: Budget | null;
  memberNames: MemberNames;
  month: Date;
  onOpenTransaction: (transaction: Transaction) => void;
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
  tone?: 'default' | 'positive' | 'danger';
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

function buildRemainingPoints(
  transactions: Transaction[],
  budget: number,
  month: Date,
): ChartPoint[] {
  const days = lastSevenDays(month);
  const firstDay = days[0];
  const firstDayTimestamp = new Date(
    firstDay.getFullYear(),
    firstDay.getMonth(),
    firstDay.getDate(),
  ).getTime();
  let spentBeforeWindow = transactions.reduce((sum, transaction) => {
    const transactionDate = new Date(transaction.spent_at);
    const transactionDayTimestamp = new Date(
      transactionDate.getFullYear(),
      transactionDate.getMonth(),
      transactionDate.getDate(),
    ).getTime();
    return sum + (transactionDayTimestamp < firstDayTimestamp ? transaction.amount : 0);
  }, 0);

  return days.map((day) => {
    const dayKey = localDayKey(day);
    spentBeforeWindow += transactions.reduce((sum, transaction) => {
      const transactionDate = new Date(transaction.spent_at);
      return sum + (localDayKey(transactionDate) === dayKey ? transaction.amount : 0);
    }, 0);
    return { label: DAY_LABEL.format(day), value: budget - spentBeforeWindow };
  });
}

function MicroChart({ points, label }: { points: ChartPoint[]; label: string }) {
  const chartHeight = 46;
  const chartBottom = 42;
  const minValue = Math.min(...points.map((point) => point.value), 0);
  const maxValue = Math.max(...points.map((point) => point.value), 1);
  const valueRange = Math.max(maxValue - minValue, 1);
  const step = 100 / Math.max(points.length - 1, 1);

  return (
    <div className="microchart" role="img" aria-label={`${label} over the past seven days`}>
      <svg viewBox="0 0 100 52" preserveAspectRatio="none" aria-hidden="true">
        {points.map((point, index) => {
          const x = index * step;
          const y = chartBottom - ((point.value - minValue) / valueRange) * chartHeight;
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

/** Real-data monthly cards and an interactive, locally backed transaction list. */
export default function InsightsDashboard({
  transactions,
  budget,
  memberNames,
  month,
  onOpenTransaction,
}: InsightsDashboardProps) {
  const totalSpent = transactions.reduce((sum, transaction) => sum + transaction.amount, 0);
  const budgetAmount = budget?.amount ?? null;
  const remaining = budgetAmount === null ? null : budgetAmount - totalSpent;
  const activeDays = new Set(
    transactions.map((transaction) => localDayKey(new Date(transaction.spent_at))),
  ).size;
  const dailyAverage = activeDays > 0 ? totalSpent / activeDays : 0;
  const points = buildDailyPoints(transactions, month);
  const remainingPoints =
    budgetAmount === null ? points : buildRemainingPoints(transactions, budgetAmount, month);
  const weeklySpent = points.reduce((sum, point) => sum + point.value, 0);
  const remainingTone = remaining !== null && remaining < 0 ? 'danger' : 'positive';

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
              ? 'Open More to set a budget'
              : `of ${formatCurrency(budgetAmount)} monthly`
          }
          points={remainingPoints}
          tone={remaining === null ? 'default' : remainingTone}
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
          <Badge variant="outline" className="recent-count">
            {transactions.length}
          </Badge>
        </header>
        <ActivityTransactionList
          transactions={transactions}
          memberNames={memberNames}
          onOpen={onOpenTransaction}
        />
      </section>
    </>
  );
}
