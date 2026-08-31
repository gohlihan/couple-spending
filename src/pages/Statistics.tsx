import { lazy, Suspense, useState } from 'react';
import { CalendarDays, ChartColumn } from 'lucide-react';
import type { Transaction } from '../lib/db';
import { formatCurrency } from '../lib/currency';
import { shortId, type MemberNames } from '../lib/members';
import {
  cumulativeSeries,
  cumulativeTransactionSeries,
  dailySpendingSeries,
  memberSpendingTotals,
  runningAverageSeries,
  calculateStatistics,
} from '../lib/statistics';
import { useCurrentLocalDate } from '../lib/use-current-local-date';
import type { CategoryChartPoint } from '../components/CategorySpendingChart';
import type { MemberChartPoint } from '../components/MemberSpendingChart';
import SpendingCalendar from '../components/SpendingCalendar';
import StatisticCard, { type StatisticChartPoint } from '../components/StatisticCard';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Separator } from '../components/ui/separator';

const CategorySpendingChart = lazy(() => import('../components/CategorySpendingChart'));
const MemberSpendingChart = lazy(() => import('../components/MemberSpendingChart'));

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

function dateFromKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

function dayLabel(key: string): string {
  return DATE_LABEL.format(dateFromKey(key));
}

function chartPoints(
  points: Array<{ date: string; value: number; count: number }>,
): StatisticChartPoint[] {
  return points.map((point) => ({
    label: dayLabel(point.date),
    value: point.value,
    count: point.count,
  }));
}

const MEDAL_RANKS = ['purchase-rank-gold', 'purchase-rank-silver', 'purchase-rank-bronze'];

function rankClass(index: number): string {
  return MEDAL_RANKS[index] ?? '';
}

export default function Statistics({
  transactions,
  memberNames,
  month,
  onOpenTransaction,
}: {
  transactions: Transaction[];
  memberNames: MemberNames;
  month: Date;
  onOpenTransaction: (transaction: Transaction) => void;
}) {
  const asOf = useCurrentLocalDate();
  const [breakdownView, setBreakdownView] = useState<'chart' | 'calendar'>('chart');
  const statistics = calculateStatistics(transactions);
  const dailyPoints = dailySpendingSeries(transactions, month, asOf);
  const spentPoints = cumulativeSeries(dailyPoints);
  const averagePoints = runningAverageSeries(dailyPoints);
  const transactionPoints = cumulativeTransactionSeries(dailyPoints);
  const highestDayPoint = statistics.highestSpendDay
    ? chartPoints(dailyPoints).find(
        (point) => point.label === dayLabel(statistics.highestSpendDay!.date),
      )
    : undefined;
  const categoryChartData = statistics.categories.map((category) => ({
    category: category.category,
    amount: category.amount,
    count: category.count,
  }));
  const memberChartData = memberSpendingTotals(transactions, Object.keys(memberNames)).map(
    (member) => ({
      ...member,
      member: memberNames[member.memberId] ?? shortId(member.memberId),
    }),
  );

  return (
    <section className="statistics-screen" aria-labelledby="statistics-title">
      <header className="view-header">
        <div>
          <p className="section-eyebrow">Monthly breakdown</p>
          <h1 id="statistics-title">Statistics</h1>
        </div>
        <p>Understand where your shared budget is going.</p>
      </header>

      <section className="analytics-grid statistics-summary-grid" aria-label="Spending summary">
        <StatisticCard
          label="Total spent"
          value={formatCurrency(statistics.totalSpent)}
          detail={`${statistics.transactionCount} transaction${statistics.transactionCount === 1 ? '' : 's'} this month`}
          points={chartPoints(spentPoints)}
          tone="positive"
          chartLabel="Cumulative total spending for the selected month"
        />
        <StatisticCard
          label="Daily average"
          value={formatCurrency(statistics.averagePerActiveDay)}
          detail={`${statistics.activeDays} active day${statistics.activeDays === 1 ? '' : 's'}`}
          points={chartPoints(averagePoints)}
          chartLabel="Running average spending per active day"
        />
        <StatisticCard
          label="Transactions"
          value={String(statistics.transactionCount)}
          detail="Recorded in the selected month"
          points={chartPoints(transactionPoints)}
          valueFormat="number"
          chartLabel="Cumulative transaction count for the selected month"
        />
        <StatisticCard
          label="Highest day"
          value={
            statistics.highestSpendDay ? formatCurrency(statistics.highestSpendDay.amount) : '—'
          }
          detail={
            statistics.highestSpendDay
              ? DATE_LABEL.format(dateFromKey(statistics.highestSpendDay.date))
              : 'No spending logged yet'
          }
          points={chartPoints(dailyPoints)}
          chartLabel="Daily spending, with the highest day highlighted"
          highlight={
            highestDayPoint
              ? { label: highestDayPoint.label, value: highestDayPoint.value }
              : undefined
          }
        />
      </section>

      <Card as="section" className="statistics-panel" aria-labelledby="member-spending-title">
        <CardHeader className="statistics-panel-header">
          <div className="section-title-row">
            <CardTitle id="member-spending-title">By household member</CardTitle>
            <Badge variant="outline">{memberChartData.length}</Badge>
          </div>
        </CardHeader>
        <CardContent className="statistics-panel-content">
          {transactions.length === 0 ? (
            <p className="plan-empty">Add spending to compare household members.</p>
          ) : (
            <Suspense
              fallback={<div className="member-spending-chart chart-loading" aria-hidden="true" />}
            >
              <MemberSpendingChart data={memberChartData as MemberChartPoint[]} />
            </Suspense>
          )}
        </CardContent>
      </Card>

      <Card as="section" className="statistics-panel" aria-labelledby="category-title">
        <CardHeader className="statistics-panel-header">
          <div className="section-title-row">
            <CardTitle id="category-title">
              {breakdownView === 'chart' ? 'By category' : 'Calendar'}
            </CardTitle>
            <div className="breakdown-toggle" role="group" aria-label="Breakdown view">
              <Button
                variant="ghost"
                size="icon"
                className={breakdownView === 'chart' ? 'breakdown-toggle-active' : ''}
                aria-pressed={breakdownView === 'chart'}
                aria-label="Show category chart"
                onClick={() => setBreakdownView('chart')}
              >
                <ChartColumn size={18} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className={breakdownView === 'calendar' ? 'breakdown-toggle-active' : ''}
                aria-pressed={breakdownView === 'calendar'}
                aria-label="Show spending calendar"
                onClick={() => setBreakdownView('calendar')}
              >
                <CalendarDays size={18} />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="statistics-panel-content">
          {breakdownView === 'chart' ? (
            statistics.categories.length === 0 ? (
              <p className="plan-empty">Add spending to see category patterns.</p>
            ) : (
              <Suspense
                fallback={<div className="category-chart chart-loading" aria-hidden="true" />}
              >
                <CategorySpendingChart data={categoryChartData as CategoryChartPoint[]} />
              </Suspense>
            )
          ) : transactions.length === 0 ? (
            <p className="plan-empty">Add spending to see the calendar.</p>
          ) : (
            <SpendingCalendar
              transactions={transactions}
              month={month}
              memberNames={memberNames}
              onOpenTransaction={onOpenTransaction}
            />
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
                  <span className={`purchase-rank ${rankClass(index)}`}>{index + 1}</span>
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
