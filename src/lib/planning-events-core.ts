/**
 * Pure planning-event helpers kept free of Dexie so node:test can run them
 * without an IndexedDB implementation.
 */

export interface PlanningEventInput {
  title: string;
  startsOn?: string | null;
  endsOn?: string | null;
  note?: string | null;
}

export interface NormalizedPlanningEventInput {
  title: string;
  startsOn: string | null;
  endsOn: string | null;
  note: string | null;
}

export interface PlanningEventLike {
  id: string;
  title: string;
  starts_on: string | null;
  created_at: string;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function normalizedDate(value: string | null | undefined, label: string): string | null {
  const trimmed = value?.trim() || null;
  if (trimmed && !DATE_PATTERN.test(trimmed)) {
    throw new Error(`Choose a valid ${label}.`);
  }
  return trimmed;
}

export function normalizePlanningEventInput(
  input: PlanningEventInput,
): NormalizedPlanningEventInput {
  const title = input.title.trim();
  if (!title) throw new Error('Enter an event name.');
  const startsOn = normalizedDate(input.startsOn, 'start date');
  const endsOn = normalizedDate(input.endsOn, 'end date');
  if (startsOn && endsOn && endsOn < startsOn) {
    throw new Error('The end date cannot be before the start date.');
  }
  return { title, startsOn, endsOn, note: input.note?.trim() || null };
}

/** Upcoming events first by start date; undated events keep creation order last. */
export function sortPlanningEvents<T extends PlanningEventLike>(events: T[]): T[] {
  return [...events].sort((left, right) => {
    const leftStart = left.starts_on ?? '9999-12-31';
    const rightStart = right.starts_on ?? '9999-12-31';
    return (
      leftStart.localeCompare(rightStart) ||
      left.created_at.localeCompare(right.created_at) ||
      left.id.localeCompare(right.id)
    );
  });
}

/** Split items into per-event buckets plus the general (event-less) list. */
export function partitionItemsByEvent<T extends { event_id?: string | null }>(
  items: T[],
): { general: T[]; byEvent: Map<string, T[]> } {
  const general: T[] = [];
  const byEvent = new Map<string, T[]>();
  for (const item of items) {
    if (!item.event_id) {
      general.push(item);
      continue;
    }
    const bucket = byEvent.get(item.event_id);
    if (bucket) bucket.push(item);
    else byEvent.set(item.event_id, [item]);
  }
  return { general, byEvent };
}
