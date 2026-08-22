import { useMemo, useState } from 'react';
import type { Transaction } from '../lib/db';
import { categoryIcon } from '../lib/category-icons';
import { formatCurrency } from '../lib/currency';
import { shortId, type MemberNames } from '../lib/members';
import {
  calendarWeeks,
  dailySpendingSeries,
  localDayKey,
  type DailyStatisticPoint,
} from '../lib/statistics';
import { useCurrentLocalDate } from '../lib/use-current-local-date';
import { Badge } from './ui/badge';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from './ui/sheet';

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_LABEL = new Intl.DateTimeFormat('en-MY', {
  weekday: 'long',
  day: 'numeric',
  month: 'short',
});
const TIME_LABEL = new Intl.DateTimeFormat('en-MY', {
  hour: 'numeric',
  minute: '2-digit',
});

function compactAmount(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(Math.round(value));
}

function intensityClass(total: number, max: number): string {
  if (total <= 0 || max <= 0) return '';
  const ratio = total / max;
  if (ratio > 0.66) return ' calendar-day-high';
  if (ratio > 0.33) return ' calendar-day-mid';
  return ' calendar-day-low';
}

function titleFor(transaction: Transaction): string {
  return transaction.note?.trim() || transaction.chip || 'Spending';
}

interface SpendingCalendarProps {
  transactions: Transaction[];
  month: Date;
  memberNames: MemberNames;
  onOpenTransaction: (transaction: Transaction) => void;
}

/** Month grid of daily spending; tap a day to review its transactions. */
export default function SpendingCalendar({
  transactions,
  month,
  memberNames,
  onOpenTransaction,
}: SpendingCalendarProps) {
  const asOf = useCurrentLocalDate();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const pointsByDay = useMemo(() => {
    const points = dailySpendingSeries(transactions, month, asOf);
    return new Map(points.map((point) => [point.date, point]));
  }, [transactions, month, asOf]);
  const totalsByDay = useMemo(() => {
    const totals = new Map<string, number>();
    for (const transaction of transactions) {
      const key = localDayKey(new Date(transaction.spent_at));
      totals.set(key, (totals.get(key) ?? 0) + transaction.amount);
    }
    return totals;
  }, [transactions]);

  const weeks = useMemo(() => calendarWeeks(month), [month]);
  const todayKey = localDayKey(asOf);
  const maxTotal = Math.max(0, ...[...pointsByDay.values()].map((point) => point.value));
  const peakKey =
    [...pointsByDay.entries()]
      .filter(([, point]) => point.value === maxTotal && point.value > 0)
      .map(([key]) => key)[0] ?? null;

  const selectedPoint: DailyStatisticPoint | undefined = selectedKey
    ? pointsByDay.get(selectedKey)
    : undefined;
  const selectedTransactions = useMemo(() => {
    if (!selectedKey) return [];
    return [...transactions]
      .filter((transaction) => localDayKey(new Date(transaction.spent_at)) === selectedKey)
      .sort(
        (left, right) =>
          right.spent_at.localeCompare(left.spent_at) || right.id.localeCompare(left.id),
      );
  }, [transactions, selectedKey]);
  const selectedTotal = selectedKey ? (totalsByDay.get(selectedKey) ?? 0) : 0;

  function dayCellClass(key: string, total: number): string {
    let className = 'calendar-day';
    className += intensityClass(total, maxTotal);
    if (key === todayKey) className += ' calendar-day-today';
    if (key === peakKey && maxTotal > 0) className += ' calendar-day-peak';
    if (total > 0) className += ' calendar-day-active';
    return className;
  }

  return (
    <div className="spending-calendar">
      <div className="calendar-weekday-row" aria-hidden="true">
        {WEEKDAY_LABELS.map((label, index) => (
          <span key={`${label}-${index}`}>{label}</span>
        ))}
      </div>
      <div className="calendar-grid" role="grid" aria-label="Daily spending calendar">
        {weeks.map((week, weekIndex) => (
          <div key={weekIndex} className="calendar-grid-row" role="row">
            {week.map((cell, cellIndex) => {
              if (!cell) {
                return (
                  <span
                    key={`empty-${weekIndex}-${cellIndex}`}
                    className="calendar-day calendar-day-empty"
                    role="gridcell"
                  />
                );
              }
              const point = pointsByDay.get(cell.dateKey);
              const total = point?.value ?? 0;
              const date = new Date(`${cell.dateKey}T12:00:00`);
              if (total <= 0) {
                return (
                  <span
                    key={cell.dateKey}
                    className={dayCellClass(cell.dateKey, total)}
                    role="gridcell"
                  >
                    <span className="calendar-day-number">{cell.dayOfMonth}</span>
                  </span>
                );
              }
              return (
                <button
                  key={cell.dateKey}
                  type="button"
                  role="gridcell"
                  className={dayCellClass(cell.dateKey, total)}
                  aria-label={`${DAY_LABEL.format(date)}, ${formatCurrency(total)}. Show transactions.`}
                  onClick={() => setSelectedKey(cell.dateKey)}
                >
                  <span className="calendar-day-number">{cell.dayOfMonth}</span>
                  <span className="calendar-day-amount">{compactAmount(total)}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <Sheet
        open={Boolean(selectedKey)}
        onOpenChange={(open) => {
          if (!open) setSelectedKey(null);
        }}
      >
        {selectedKey && selectedPoint && (
          <SheetContent side="bottom" className="sheet" aria-describedby="day-sheet-description">
            <SheetHeader className="sr-only">
              <SheetTitle>
                Spending on {DAY_LABEL.format(new Date(`${selectedKey}T12:00:00`))}
              </SheetTitle>
              <SheetDescription id="day-sheet-description">
                Transactions recorded on this day.
              </SheetDescription>
            </SheetHeader>
            <section className="day-sheet-body">
              <header className="activity-date-heading">
                <p className="activity-date-label">
                  {DAY_LABEL.format(new Date(`${selectedKey}T12:00:00`))}
                </p>
                <Badge variant="positive">{formatCurrency(selectedTotal)}</Badge>
              </header>
              <ol className="day-transaction-list">
                {selectedTransactions.length === 0 ? (
                  <li className="plan-empty">No spending recorded on this day.</li>
                ) : (
                  selectedTransactions.map((transaction, index) => {
                    const Icon = categoryIcon(transaction.chip);
                    return (
                      <li key={transaction.id}>
                        {index > 0 && (
                          <span className="day-transaction-separator" aria-hidden="true" />
                        )}
                        <button
                          type="button"
                          className="day-transaction-row"
                          aria-label={`${titleFor(transaction)}, ${formatCurrency(transaction.amount)}. Open details.`}
                          onClick={() => onOpenTransaction(transaction)}
                        >
                          <span className="transaction-category-icon" aria-hidden="true">
                            <Icon size={16} strokeWidth={2.2} />
                          </span>
                          <span className="day-transaction-copy">
                            <span>{titleFor(transaction)}</span>
                            <span>
                              {TIME_LABEL.format(new Date(transaction.spent_at))} · Paid by{' '}
                              {memberNames[transaction.payer_id ?? transaction.created_by] ??
                                shortId(transaction.payer_id ?? transaction.created_by)}
                            </span>
                          </span>
                          <strong>{formatCurrency(transaction.amount)}</strong>
                        </button>
                      </li>
                    );
                  })
                )}
              </ol>
            </section>
          </SheetContent>
        )}
      </Sheet>
    </div>
  );
}
