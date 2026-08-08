import assert from 'node:assert/strict';
import test from 'node:test';
import type { Transaction } from '../src/lib/db.ts';
import {
  calculateStatistics,
  groupTransactionsByDay,
  totalForLocalDay,
} from '../src/lib/statistics.ts';

function localDate(year: number, month: number, day: number, hour = 12): Date {
  return new Date(year, month - 1, day, hour, 0, 0, 0);
}

function localTimestamp(year: number, month: number, day: number, hour = 12): string {
  return localDate(year, month, day, hour).toISOString();
}

function transaction(overrides: Partial<Transaction>): Transaction {
  return {
    id: 'transaction-1',
    household_id: 'household-1',
    amount: 10,
    spent_at: localTimestamp(2026, 7, 27, 12),
    note: null,
    chip: null,
    payer_id: 'user-1',
    created_by: 'user-1',
    created_at: localTimestamp(2026, 7, 27, 12),
    updated_at: localTimestamp(2026, 7, 27, 12),
    updated_by: 'user-1',
    deleted_at: null,
    deleted_by: null,
    client_id: 'client-1',
    ...overrides,
  };
}

test('calculates category totals, active-day average, and deterministic top five purchases', () => {
  const summary = calculateStatistics([
    transaction({ id: 'a', amount: 20, chip: 'eat', spent_at: localTimestamp(2026, 7, 26, 12) }),
    transaction({ id: 'b', amount: 80, chip: 'shop', spent_at: localTimestamp(2026, 7, 27, 12) }),
    transaction({ id: 'c', amount: 40, chip: 'eat', spent_at: localTimestamp(2026, 7, 27, 14) }),
    transaction({ id: 'd', amount: 80, chip: null, spent_at: localTimestamp(2026, 7, 27, 13) }),
  ]);

  assert.equal(summary.totalSpent, 220);
  assert.equal(summary.transactionCount, 4);
  assert.equal(summary.activeDays, 2);
  assert.equal(summary.averagePerActiveDay, 110);
  assert.deepEqual(summary.categories, [
    { category: 'Other', amount: 80, count: 1 },
    { category: 'shop', amount: 80, count: 1 },
    { category: 'eat', amount: 60, count: 2 },
  ]);
  assert.deepEqual(
    summary.largestPurchases.map((item) => item.id),
    ['d', 'b', 'c', 'a'],
  );
  assert.deepEqual(summary.highestSpendDay, { date: '2026-07-27', amount: 200 });
});

test('groups rows newest day first and newest transaction first within each day', () => {
  const groups = groupTransactionsByDay([
    transaction({ id: 'morning', amount: 10, spent_at: localTimestamp(2026, 7, 27, 12) }),
    transaction({ id: 'evening', spent_at: localTimestamp(2026, 7, 27, 13) }),
    transaction({ id: 'older', amount: 25, spent_at: localTimestamp(2026, 7, 26, 12) }),
  ]);

  assert.deepEqual(
    groups.map((group) => [group.date, group.transactions.map((item) => item.id)]),
    [
      ['2026-07-27', ['evening', 'morning']],
      ['2026-07-26', ['older']],
    ],
  );
  assert.deepEqual(
    groups.map((group) => [group.date, group.total]),
    [
      ['2026-07-27', 20],
      ['2026-07-26', 25],
    ],
  );
});

test('sums transactions for a local calendar day', () => {
  const transactions = [
    transaction({ id: 'morning', amount: 12, spent_at: localTimestamp(2026, 7, 27, 1) }),
    transaction({ id: 'evening', amount: 8, spent_at: localTimestamp(2026, 7, 27, 14) }),
    transaction({ id: 'other-day', amount: 100, spent_at: localTimestamp(2026, 7, 28, 1) }),
  ];

  assert.equal(totalForLocalDay(transactions, localDate(2026, 7, 27)), 20);
  assert.equal(totalForLocalDay(transactions, localDate(2026, 7, 29)), 0);
  assert.equal(totalForLocalDay([], localDate(2026, 7, 27)), 0);
});
