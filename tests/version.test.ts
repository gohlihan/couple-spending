import assert from 'node:assert/strict';
import test from 'node:test';
import { compareUpdatedAt, compareVersions, nextLocalUpdatedAt } from '../src/lib/version.ts';

test('compares Postgres microseconds and equivalent offsets exactly', () => {
  assert.equal(
    compareUpdatedAt('2026-07-27T01:02:03.123456Z', '2026-07-27T03:02:03.123456+02:00'),
    0,
  );
  assert.equal(compareUpdatedAt('2026-07-27T01:02:03.123457Z', '2026-07-27T01:02:03.123456Z'), 1);
});

test('uses updated_by as the deterministic same-timestamp tie-breaker', () => {
  const earlierWriter = { updated_at: '2026-07-27T01:02:03.123456Z', updated_by: 'a' };
  const laterWriter = { updated_at: '2026-07-27T01:02:03.123456Z', updated_by: 'b' };
  assert.equal(compareVersions(laterWriter, earlierWriter), 1);
  assert.equal(compareVersions(earlierWriter, laterWriter), -1);
});

test('generates a monotonic six-digit local timestamp', () => {
  const fixed = new Date('2026-07-27T01:02:03.123Z');
  const first = nextLocalUpdatedAt(fixed);
  const second = nextLocalUpdatedAt(fixed);
  assert.equal(compareUpdatedAt(second, first), 1);
  assert.match(second, /\.\d{6}Z$/);
});
