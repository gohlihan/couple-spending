import assert from 'node:assert/strict';
import test from 'node:test';
import type { Transaction } from '../src/lib/db.ts';
import { calculateStatistics, groupTransactionsByDay } from '../src/lib/statistics.ts';

function transaction(overrides: Partial<Transaction>): Transaction {
  return {
    id: 'transaction-1',
    household_id: 'household-1',
    amount: 10,
    spent_at: '2026-07-27T03:00:00.000Z',
    note: null,
    chip: null,
    payer_id: 'user-1',
    created_by: 'user-1',
    created_at: '2026-07-27T03:00:00.000Z',
    updated_at: '2026-07-27T03:00:00.000Z',
    updated_by: 'user-1',
    deleted_at: null,
    deleted_by: null,
    client_id: 'client-1',
    ...overrides,
  };
}

test('calculates category totals, active-day average, and deterministic top five purchases', () => {
  const summary = calculateStatistics([
    transaction({ id: 'a', amount: 20, chip: 'eat', spent_at: '2026-07-26T12:00:00Z' }),
    transaction({ id: 'b', amount: 80, chip: 'shop', spent_at: '2026-07-27T12:00:00Z' }),
    transaction({ id: 'c', amount: 40, chip: 'eat', spent_at: '2026-07-27T14:00:00Z' }),
    transaction({ id: 'd', amount: 80, chip: null, spent_at: '2026-07-27T13:00:00Z' }),
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
    transaction({ id: 'morning', spent_at: '2026-07-27T12:00:00Z' }),
    transaction({ id: 'evening', spent_at: '2026-07-27T13:00:00Z' }),
    transaction({ id: 'older', spent_at: '2026-07-26T12:00:00Z' }),
  ]);

  assert.deepEqual(
    groups.map((group) => [group.date, group.transactions.map((item) => item.id)]),
    [
      ['2026-07-27', ['evening', 'morning']],
      ['2026-07-26', ['older']],
    ],
  );
});
