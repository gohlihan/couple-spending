import assert from 'node:assert/strict';
import test from 'node:test';
import type { Transaction } from '../src/lib/db.ts';
import {
  calculateStatistics,
  calendarWeeks,
  groupTransactionsByDay,
  cumulativeSeries,
  cumulativeTransactionSeries,
  dailySpendingSeries,
  hourlySpendingSeries,
  lastSevenDaysSpendingSeries,
  memberSpendingTotals,
  remainingBudgetSeries,
  runningAverageSeries,
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

test('calculates payer totals and retains household members with no spending', () => {
  const totals = memberSpendingTotals(
    [
      transaction({ id: 'a', amount: 20, payer_id: 'user-2' }),
      transaction({ id: 'b', amount: 80, payer_id: 'user-1' }),
      transaction({ id: 'c', amount: 40, payer_id: null, created_by: 'user-2' }),
    ],
    ['user-1', 'user-2', 'user-3'],
  );

  assert.deepEqual(totals, [
    { memberId: 'user-1', amount: 80, count: 1 },
    { memberId: 'user-2', amount: 60, count: 2 },
    { memberId: 'user-3', amount: 0, count: 0 },
  ]);
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

test('builds zero-filled monthly series and running metrics from local days', () => {
  const transactions = [
    transaction({ id: 'first', amount: 10, spent_at: localTimestamp(2026, 7, 1, 9) }),
    transaction({ id: 'third-a', amount: 5, spent_at: localTimestamp(2026, 7, 3, 9) }),
    transaction({ id: 'third-b', amount: 2, spent_at: localTimestamp(2026, 7, 3, 18) }),
  ];
  const daily = dailySpendingSeries(transactions, localDate(2026, 7, 1), localDate(2026, 7, 3, 20));

  assert.deepEqual(
    daily.map((point) => point.value),
    [10, 0, 7],
  );
  assert.deepEqual(
    cumulativeSeries(daily).map((point) => point.value),
    [10, 10, 17],
  );
  assert.deepEqual(
    remainingBudgetSeries(daily, 100).map((point) => point.value),
    [90, 90, 83],
  );
  assert.deepEqual(
    runningAverageSeries(daily).map((point) => point.value),
    [10, 10, 8.5],
  );
  assert.deepEqual(
    cumulativeTransactionSeries(daily).map((point) => point.value),
    [1, 1, 3],
  );
});

test('builds historical month, rolling seven-day, and hourly series boundaries', () => {
  const transactions = [
    transaction({ id: 'morning', amount: 10, spent_at: localTimestamp(2026, 7, 1, 2) }),
    transaction({ id: 'evening', amount: 5, spent_at: localTimestamp(2026, 7, 1, 14) }),
  ];
  const currentMonth = localDate(2026, 7, 1);
  const asOf = localDate(2026, 7, 7);

  assert.equal(dailySpendingSeries(transactions, currentMonth, asOf).length, 7);
  assert.equal(dailySpendingSeries(transactions, currentMonth, localDate(2026, 8, 1)).length, 31);
  assert.deepEqual(
    lastSevenDaysSpendingSeries(transactions, currentMonth, asOf).map((point) => point.value),
    [15, 0, 0, 0, 0, 0, 0],
  );
  const hourly = hourlySpendingSeries(transactions, localDate(2026, 7, 1));
  assert.equal(hourly.length, 24);
  assert.equal(hourly[2]?.value, 10);
  assert.equal(hourly[14]?.value, 5);
});

test('builds a sunday-first calendar grid with leading blanks and exact week counts', () => {
  const july = calendarWeeks(localDate(2026, 7, 1));

  assert.equal(july[0]?.length, 7);
  assert.deepEqual(july[0]?.slice(0, 3), [null, null, null]);
  assert.equal(july[0]?.[3]?.dayOfMonth, 1);
  assert.equal(july[0]?.[3]?.dateKey, '2026-07-01');
  const flatJuly = july.flat();
  assert.equal(flatJuly.filter((cell) => cell === null).length, 3);
  assert.equal(flatJuly.at(-1)?.dayOfMonth, 31);
  assert.equal(july.length, 5);

  const february = calendarWeeks(localDate(2026, 2, 1));
  assert.equal(february.length, 4);
  assert.deepEqual(february[0]?.[0], { dateKey: '2026-02-01', dayOfMonth: 1 });
  assert.equal(february.at(-1)?.at(-1)?.dayOfMonth, 28);

  const february2027 = calendarWeeks(localDate(2027, 2, 1));
  assert.deepEqual(february2027[0]?.slice(0, 1), [null]);
  assert.equal(february2027[0]?.[1]?.dateKey, '2027-02-01');
  assert.equal(february2027.length, 5);
});
