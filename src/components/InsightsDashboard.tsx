import type { Budget, Transaction } from '../lib/db';
import { formatCurrency } from '../lib/currency';
import {
  cumulativeSeries,
  dailySpendingSeries,
  hourlySpendingSeries,
  lastSevenDaysSpendingSeries,
  remainingBudgetSeries,
  runningAverageSeries,
  totalForLocalDay,
} from '../lib/statistics';
import { useCurrentLocalDate } from '../lib/use-current-local-date';
import type { MemberNames } from '../lib/members';
import ActivityTransactionList from './ActivityTransactionList';
import StatisticCard, { type StatisticChartPoint } from './StatisticCard';
import { Badge } from './ui/badge';
import { Card } from './ui/card';

const DAY_LABEL = new Intl.DateTimeFormat('en-MY', {
  day: 'numeric',
  month: 'short',
});
const HOUR_LABEL = new Intl.DateTimeFormat('en-MY', { hour: 'numeric' });

interface InsightsDashboardProps {
  transactions: Transaction[];
  budget: Budget | null;
  memberNames: MemberNames;
  month: Date;
  onOpenTransaction: (transaction: Transaction) => void;
}

function dateFromKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

function dayLabel(key: string): string {
  return DAY_LABEL.format(dateFromKey(key));
}

function dailyChartPoints(
  points: Array<{ date: string; value: number; count: number }>,
): StatisticChartPoint[] {
  return points.map((point) => ({
    label: dayLabel(point.date),
    value: point.value,
    count: point.count,
  }));
}

/** Real-data monthly cards and an interactive, locally backed transaction list. */
export default function InsightsDashboard({
  transactions,
  budget,
  memberNames,
  month,
  onOpenTransaction,
}: InsightsDashboardProps) {
  const today = useCurrentLocalDate();
  const totalSpent = transactions.reduce((sum, transaction) => sum + transaction.amount, 0);
  const budgetAmount = budget?.amount ?? null;
  const remaining = budgetAmount === null ? null : budgetAmount - totalSpent;
  const dailyPoints = dailySpendingSeries(transactions, month, today);
  const spentPoints = cumulativeSeries(dailyPoints);
  const remainingPoints =
    budgetAmount === null
      ? dailyPoints.map((point) => ({ ...point, value: 0 }))
      : remainingBudgetSeries(dailyPoints, budgetAmount);
  const averagePoints = runningAverageSeries(dailyPoints);
  const lastSevenPoints = lastSevenDaysSpendingSeries(transactions, month, today);
  const weeklySpent = lastSevenPoints.reduce((sum, point) => sum + point.value, 0);
  const activeDays = dailyPoints.filter((point) => point.count > 0).length;
  const dailyAverage = activeDays > 0 ? totalSpent / activeDays : 0;
  const isCurrentMonth =
    month.getFullYear() === today.getFullYear() && month.getMonth() === today.getMonth();
  const todayTotal = isCurrentMonth ? totalForLocalDay(transactions, today) : 0;
  const todayTransactionCount = isCurrentMonth
    ? transactions.filter((transaction) => {
        const spentAt = new Date(transaction.spent_at);
        return (
          spentAt.getFullYear() === today.getFullYear() &&
          spentAt.getMonth() === today.getMonth() &&
          spentAt.getDate() === today.getDate()
        );
      }).length
    : 0;
  const todayPoints = hourlySpendingSeries(transactions, today).map((point) => ({
    label: HOUR_LABEL.format(
      new Date(today.getFullYear(), today.getMonth(), today.getDate(), point.hour, 0, 0, 0),
    ),
    value: point.value,
  }));
  const remainingTone = remaining !== null && remaining < 0 ? 'danger' : 'positive';

  return (
    <>
      <section className="analytics-grid" aria-label="Monthly analytics">
        {isCurrentMonth && (
          <StatisticCard
            label="Today"
            value={formatCurrency(todayTotal)}
            detail={
              todayTotal > 0
                ? `${todayTransactionCount} transaction${todayTransactionCount === 1 ? '' : 's'} today`
                : 'No spending logged today'
            }
            points={todayPoints}
            tone={todayTotal > 0 ? 'positive' : 'default'}
            chartLabel="Hourly spending for today"
          />
        )}
        <StatisticCard
          label="Spent"
          value={formatCurrency(totalSpent)}
          detail={`${transactions.length} transaction${transactions.length === 1 ? '' : 's'} this month`}
          points={dailyChartPoints(spentPoints)}
          chartLabel="Cumulative spending across the selected month"
        />
        <StatisticCard
          label="Remaining"
          value={remaining === null ? 'Set a budget' : formatCurrency(remaining)}
          detail={
            budgetAmount === null
              ? 'Open More to set a budget'
              : `of ${formatCurrency(budgetAmount)} monthly`
          }
          points={dailyChartPoints(remainingPoints)}
          tone={remaining === null ? 'default' : remainingTone}
          chartLabel="Remaining budget across the selected month"
        />
        <StatisticCard
          label="Daily average"
          value={formatCurrency(dailyAverage)}
          detail={
            activeDays > 0
              ? `across ${activeDays} active day${activeDays === 1 ? '' : 's'}`
              : 'No spending logged yet'
          }
          points={dailyChartPoints(averagePoints)}
          chartLabel="Running daily average across the selected month"
        />
        <StatisticCard
          label="Last 7 days"
          value={formatCurrency(weeklySpent)}
          detail="Rolling activity view"
          points={dailyChartPoints(lastSevenPoints)}
          chartLabel="Spending during the last seven days"
        />
      </section>

      <Card
        as="section"
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
      </Card>
    </>
  );
}
