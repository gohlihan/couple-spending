import type { Transaction } from './db';

export interface CategoryStatistic {
  category: string;
  amount: number;
  count: number;
}

export interface StatisticsSummary {
  totalSpent: number;
  transactionCount: number;
  activeDays: number;
  averagePerActiveDay: number;
  largestPurchases: Transaction[];
  categories: CategoryStatistic[];
  highestSpendDay: { date: string; amount: number } | null;
}

export function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

function dayKey(timestamp: string): string {
  return localDayKey(new Date(timestamp));
}

export interface DailyStatisticPoint {
  date: string;
  value: number;
  count: number;
}

export interface HourlyStatisticPoint {
  hour: number;
  value: number;
}

function isCurrentMonth(month: Date, asOf: Date): boolean {
  return month.getFullYear() === asOf.getFullYear() && month.getMonth() === asOf.getMonth();
}

function monthEndDay(month: Date): number {
  return new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
}

function totalsByDay(transactions: Transaction[]): Map<string, { value: number; count: number }> {
  const totals = new Map<string, { value: number; count: number }>();
  for (const transaction of transactions) {
    const key = dayKey(transaction.spent_at);
    const current = totals.get(key) ?? { value: 0, count: 0 };
    current.value += transaction.amount;
    current.count += 1;
    totals.set(key, current);
  }
  return totals;
}

/** Build one local-calendar point for each day visible in the selected month. */
export function dailySpendingSeries(
  transactions: Transaction[],
  month: Date,
  asOf = new Date(),
): DailyStatisticPoint[] {
  const endDay = isCurrentMonth(month, asOf) ? asOf.getDate() : monthEndDay(month);
  const totals = totalsByDay(transactions);
  return Array.from({ length: endDay }, (_, index) => {
    const date = new Date(month.getFullYear(), month.getMonth(), index + 1, 12);
    const entry = totals.get(localDayKey(date));
    return { date: localDayKey(date), value: entry?.value ?? 0, count: entry?.count ?? 0 };
  });
}

/** Turn daily amounts into a running total. */
export function cumulativeSeries(points: DailyStatisticPoint[]): DailyStatisticPoint[] {
  let runningValue = 0;
  let runningCount = 0;
  return points.map((point) => {
    runningValue += point.value;
    runningCount += point.count;
    return { date: point.date, value: runningValue, count: runningCount };
  });
}

/** Calculate the remaining shared budget after each visible day. */
export function remainingBudgetSeries(
  points: DailyStatisticPoint[],
  budget: number,
): DailyStatisticPoint[] {
  return cumulativeSeries(points).map((point) => ({
    ...point,
    value: budget - point.value,
  }));
}

/** Calculate the running average across days that contain transactions. */
export function runningAverageSeries(points: DailyStatisticPoint[]): DailyStatisticPoint[] {
  let runningTotal = 0;
  let activeDays = 0;
  return points.map((point) => {
    runningTotal += point.value;
    if (point.count > 0) activeDays += 1;
    return {
      date: point.date,
      value: activeDays === 0 ? 0 : runningTotal / activeDays,
      count: point.count,
    };
  });
}

/** Calculate the running transaction count across the visible month. */
export function cumulativeTransactionSeries(points: DailyStatisticPoint[]): DailyStatisticPoint[] {
  return cumulativeSeries(points).map((point) => ({ ...point, value: point.count }));
}

/** Build a seven-day local-calendar window ending at the selected month endpoint. */
export function lastSevenDaysSpendingSeries(
  transactions: Transaction[],
  month: Date,
  asOf = new Date(),
): DailyStatisticPoint[] {
  const end = isCurrentMonth(month, asOf)
    ? new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate(), 12)
    : new Date(month.getFullYear(), month.getMonth() + 1, 0, 12);
  const totals = totalsByDay(transactions);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(end);
    date.setDate(end.getDate() - 6 + index);
    const entry = totals.get(localDayKey(date));
    return { date: localDayKey(date), value: entry?.value ?? 0, count: entry?.count ?? 0 };
  });
}

/** Sum spending into 24 local-hour buckets for a Today chart. */
export function hourlySpendingSeries(
  transactions: Transaction[],
  date: Date,
): HourlyStatisticPoint[] {
  const totals = Array.from({ length: 24 }, () => 0);
  const target = localDayKey(date);
  for (const transaction of transactions) {
    const spentAt = new Date(transaction.spent_at);
    if (localDayKey(spentAt) === target) totals[spentAt.getHours()] += transaction.amount;
  }
  return totals.map((value, hour) => ({ hour, value }));
}

function categoryName(transaction: Transaction): string {
  return transaction.chip?.trim() || 'Other';
}

/**
 * Calculate selected-month statistics from already-filtered active records.
 * All grouping is local-calendar aware so the UI and its date labels agree.
 */
export function calculateStatistics(transactions: Transaction[]): StatisticsSummary {
  const totalSpent = transactions.reduce((total, transaction) => total + transaction.amount, 0);
  const dailyTotals = new Map<string, number>();
  const categoryTotals = new Map<string, CategoryStatistic>();

  for (const transaction of transactions) {
    const day = dayKey(transaction.spent_at);
    dailyTotals.set(day, (dailyTotals.get(day) ?? 0) + transaction.amount);

    const category = categoryName(transaction);
    const current = categoryTotals.get(category) ?? { category, amount: 0, count: 0 };
    current.amount += transaction.amount;
    current.count += 1;
    categoryTotals.set(category, current);
  }

  const highestSpendDay =
    [...dailyTotals.entries()]
      .map(([date, amount]) => ({ date, amount }))
      .sort(
        (left, right) => right.amount - left.amount || right.date.localeCompare(left.date),
      )[0] ?? null;

  return {
    totalSpent,
    transactionCount: transactions.length,
    activeDays: dailyTotals.size,
    averagePerActiveDay: dailyTotals.size === 0 ? 0 : totalSpent / dailyTotals.size,
    largestPurchases: [...transactions]
      .sort(
        (left, right) =>
          right.amount - left.amount ||
          right.spent_at.localeCompare(left.spent_at) ||
          right.id.localeCompare(left.id),
      )
      .slice(0, 5),
    categories: [...categoryTotals.values()].sort(
      (left, right) => right.amount - left.amount || left.category.localeCompare(right.category),
    ),
    highestSpendDay,
  };
}

export interface TransactionDayGroup {
  date: string;
  transactions: Transaction[];
  total: number;
}

/** Group active transactions by local calendar day, newest day and row first. */
export function groupTransactionsByDay(transactions: Transaction[]): TransactionDayGroup[] {
  const groups = new Map<string, Transaction[]>();
  for (const transaction of [...transactions].sort(
    (left, right) => right.spent_at.localeCompare(left.spent_at) || right.id.localeCompare(left.id),
  )) {
    const date = dayKey(transaction.spent_at);
    const rows = groups.get(date);
    if (rows) rows.push(transaction);
    else groups.set(date, [transaction]);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([date, rows]) => ({
      date,
      transactions: rows,
      total: rows.reduce((sum, transaction) => sum + transaction.amount, 0),
    }));
}

/** Sum active transactions that fall on the same local calendar day. */
export function totalForLocalDay(transactions: Transaction[], date: Date): number {
  const target = localDayKey(date);
  return transactions.reduce(
    (total, transaction) =>
      dayKey(transaction.spent_at) === target ? total + transaction.amount : total,
    0,
  );
}
