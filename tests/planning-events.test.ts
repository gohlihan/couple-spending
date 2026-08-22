import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizePlanningEventInput,
  partitionItemsByEvent,
  sortPlanningEvents,
} from '../src/lib/planning-events-core.ts';

test('normalizes event input and rejects invalid names or dates', () => {
  assert.deepEqual(normalizePlanningEventInput({ title: ' Bali trip ' }), {
    title: 'Bali trip',
    startsOn: null,
    endsOn: null,
    note: null,
  });
  assert.deepEqual(
    normalizePlanningEventInput({ title: 'Trip', startsOn: '2026-09-12', note: ' ' }),
    { title: 'Trip', startsOn: '2026-09-12', endsOn: null, note: null },
  );
  assert.throws(() => normalizePlanningEventInput({ title: '   ' }), /event name/);
  assert.throws(
    () => normalizePlanningEventInput({ title: 'Trip', startsOn: '09/12/2026' }),
    /start date/,
  );
  assert.throws(
    () => normalizePlanningEventInput({ title: 'Trip', endsOn: 'tomorrow' }),
    /end date/,
  );
  assert.throws(
    () =>
      normalizePlanningEventInput({
        title: 'Trip',
        startsOn: '2026-09-19',
        endsOn: '2026-09-12',
      }),
    /before the start/,
  );
});

test('sorts events by start date with undated events last', () => {
  const sorted = sortPlanningEvents([
    { id: 'undated', title: 'Someday', starts_on: null, created_at: '2026-08-01T00:00:00Z' },
    { id: 'late', title: 'Later', starts_on: '2026-10-01', created_at: '2026-08-01T00:00:00Z' },
    {
      id: 'soon-b',
      title: 'Same day B',
      starts_on: '2026-09-01',
      created_at: '2026-08-02T00:00:00Z',
    },
    {
      id: 'soon-a',
      title: 'Same day A',
      starts_on: '2026-09-01',
      created_at: '2026-08-01T00:00:00Z',
    },
  ]);

  assert.deepEqual(
    sorted.map((event) => event.id),
    ['soon-a', 'soon-b', 'late', 'undated'],
  );
});

test('partitions items into per-event buckets and the general list', () => {
  const items = [
    { id: 'a', event_id: null },
    { id: 'b', event_id: 'trip' },
    { id: 'c' },
    { id: 'd', event_id: 'trip' },
    { id: 'e', event_id: 'gift' },
  ];

  const { general, byEvent } = partitionItemsByEvent(items);
  assert.deepEqual(
    general.map((item) => item.id),
    ['a', 'c'],
  );
  assert.deepEqual([...byEvent.keys()].sort(), ['gift', 'trip']);
  assert.deepEqual(
    byEvent.get('trip')?.map((item) => item.id),
    ['b', 'd'],
  );
  assert.deepEqual(
    byEvent.get('gift')?.map((item) => item.id),
    ['e'],
  );
});
