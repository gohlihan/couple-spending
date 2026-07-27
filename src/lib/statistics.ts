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

function dayKey(timestamp: string): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
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
    .map(([date, rows]) => ({ date, transactions: rows }));
}
