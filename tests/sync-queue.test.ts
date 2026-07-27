import assert from 'node:assert/strict';
import test from 'node:test';
import type { PendingChange } from '../src/lib/db.ts';
import { hasUnresolvedEarlierChange } from '../src/lib/sync-queue.ts';

function makeChange(overrides: Partial<PendingChange> = {}): PendingChange {
  return {
    client_id: 'change-1',
    household_id: 'household-1',
    op: 'insert',
    table: 'transactions',
    record_id: 'record-1',
    payload: {},
    created_at: '2026-07-27T01:02:03.000000Z',
    status: 'pending',
    attempts: 0,
    ...overrides,
  };
}

test('keeps a later update behind an unresolved earlier insert', () => {
  const insert = makeChange({ client_id: 'insert', status: 'failed' });
  const update = makeChange({
    client_id: 'update',
    op: 'update',
    created_at: '2026-07-27T01:02:04.000000Z',
  });

  assert.equal(hasUnresolvedEarlierChange([insert, update], update), true);
  assert.equal(hasUnresolvedEarlierChange([insert, update], update, new Set(['insert'])), false);
});

test('does not block changes for another record', () => {
  const earlier = makeChange({ client_id: 'earlier' });
  const later = makeChange({
    client_id: 'later',
    record_id: 'record-2',
    created_at: '2026-07-27T01:02:04.000000Z',
  });

  assert.equal(hasUnresolvedEarlierChange([earlier, later], later), false);
});

test('keeps planned-item completion behind an unresolved planned-item write', () => {
  const insert = makeChange({
    client_id: 'plan-insert',
    table: 'planned_items',
    record_id: 'plan-1',
    status: 'failed',
  });
  const complete = makeChange({
    client_id: 'plan-complete',
    table: 'planned_items',
    record_id: 'plan-1',
    op: 'complete',
    created_at: '2026-07-27T01:02:04.000000Z',
  });

  assert.equal(hasUnresolvedEarlierChange([insert, complete], complete), true);
  assert.equal(
    hasUnresolvedEarlierChange([insert, complete], complete, new Set(['plan-insert'])),
    false,
  );
});
