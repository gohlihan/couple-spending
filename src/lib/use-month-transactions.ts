import { liveQuery } from 'dexie';
import { useEffect, useState } from 'react';
import { db, type Transaction } from './db';

export interface MonthBounds {
  /** Inclusive ISO timestamp for the first instant of the month. */
  start: string;
  /** Exclusive ISO timestamp for the first instant of the next month. */
  end: string;
}

/** Compute the [start, end) bounds of the month containing `date` (local time). */
export function monthBounds(date: Date): MonthBounds {
  const start = new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1, 0, 0, 0, 0);
  return { start: start.toISOString(), end: end.toISOString() };
}

/**
 * Reactive read of a household's transactions for the month containing
 * `month`, excluding soft-deleted rows. Sorted chronologically ascending so a
 * running budget balance descends across the month. Re-queries on any local
 * Dexie write via `liveQuery`.
 */
export function useMonthTransactions(
  householdId: string | null,
  month: Date,
): Transaction[] {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const { start, end } = monthBounds(month);

  useEffect(() => {
    if (!householdId) {
      setTransactions([]);
      return;
    }

    const subscription = liveQuery(async () => {
      const rows = await db.transactions
        .where('household_id')
        .equals(householdId)
        .filter(
          (transaction) =>
            transaction.deleted_at === null &&
            transaction.spent_at >= start &&
            transaction.spent_at < end,
        )
        .toArray();

      return rows.sort((a, b) => a.spent_at.localeCompare(b.spent_at));
    }).subscribe({
      next: setTransactions,
      error: (error) => console.warn('Could not read local transactions.', error),
    });

    return () => subscription.unsubscribe();
  }, [householdId, start, end]);

  return transactions;
}
