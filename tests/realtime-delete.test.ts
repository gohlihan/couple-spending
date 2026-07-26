import assert from 'node:assert/strict';
import test from 'node:test';
import { parseRealtimeDelete } from '../src/lib/realtime-delete.ts';

test('accepts a complete scoped delete version without a refetch', () => {
  assert.deepEqual(
    parseRealtimeDelete({
      id: 'transaction-1',
      household_id: 'household-1',
      updated_at: '2026-07-27T01:02:03.123456Z',
      updated_by: 'user-1',
    }),
    {
      recordId: 'transaction-1',
      householdId: 'household-1',
      updatedAt: '2026-07-27T01:02:03.123456Z',
      updatedBy: 'user-1',
      requiresRefetch: false,
    },
  );
});

test('requires a refetch when RLS omits the household scope or version', () => {
  assert.equal(
    parseRealtimeDelete({ id: 'transaction-1', updated_at: '2026-07-27T01:02:03.123456Z' })
      .requiresRefetch,
    true,
  );
  assert.equal(
    parseRealtimeDelete({ id: 'transaction-1', household_id: 'household-1' }).requiresRefetch,
    true,
  );
});

test('does not invent an identity for malformed delete payloads', () => {
  const info = parseRealtimeDelete({});
  assert.equal(info.recordId, null);
  assert.equal(info.requiresRefetch, true);
});
