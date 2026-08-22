import { liveQuery } from 'dexie';
import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { db, type PlannedItem, type PlanningEvent } from './db';
import {
  normalizePlanningEventInput,
  sortPlanningEvents,
  type PlanningEventInput,
} from './planning-events-core';
import { nextLocalUpdatedAt } from './version';

export interface EventAuthor {
  user: User | null;
  householdId: string | null;
}

function assertEventAuthor(
  author: EventAuthor,
): asserts author is { user: User; householdId: string } {
  if (!author.user || !author.householdId) {
    throw new Error('You must be signed in to a household before changing your plan.');
  }
}

function queueEventChange(
  event: PlanningEvent,
  op: 'insert' | 'update' | 'delete',
  queueId: string,
) {
  return {
    client_id: queueId,
    household_id: event.household_id,
    op,
    table: 'planning_events' as const,
    record_id: event.id,
    payload: event,
    created_at: event.updated_at,
    status: 'pending' as const,
    attempts: 0,
  };
}

/** Add a shared event locally and queue its insert for durable sync. */
export async function addPlanningEvent(
  input: PlanningEventInput,
  author: EventAuthor,
): Promise<PlanningEvent> {
  assertEventAuthor(author);
  const normalized = normalizePlanningEventInput(input);
  const now = nextLocalUpdatedAt();
  const clientId = crypto.randomUUID();
  const event: PlanningEvent = {
    id: crypto.randomUUID(),
    household_id: author.householdId,
    title: normalized.title,
    starts_on: normalized.startsOn,
    ends_on: normalized.endsOn,
    note: normalized.note,
    created_by: author.user.id,
    created_at: now,
    updated_at: now,
    updated_by: author.user.id,
    client_id: clientId,
  };

  await db.transaction('rw', db.planningEvents, db.pendingChanges, async () => {
    await db.planningEvents.add(event);
    await db.pendingChanges.add(queueEventChange(event, 'insert', clientId));
  });
  return event;
}

/** Edit an event locally and queue its LWW update. */
export async function updatePlanningEvent(
  existing: PlanningEvent,
  input: PlanningEventInput,
  author: EventAuthor,
): Promise<PlanningEvent> {
  assertEventAuthor(author);
  if (existing.household_id !== author.householdId) {
    throw new Error('This event belongs to a different household.');
  }
  const normalized = normalizePlanningEventInput(input);
  const event: PlanningEvent = {
    ...existing,
    title: normalized.title,
    starts_on: normalized.startsOn,
    ends_on: normalized.endsOn,
    note: normalized.note,
    updated_at: nextLocalUpdatedAt(new Date(), existing.updated_at),
    updated_by: author.user.id,
  };
  const queueId = crypto.randomUUID();

  await db.transaction('rw', db.planningEvents, db.pendingChanges, async () => {
    await db.planningEvents.put(event);
    await db.pendingChanges.add(queueEventChange(event, 'update', queueId));
  });
  return event;
}

/**
 * Delete an event and detach its linked items back onto the general to-buy
 * list. Every detach is queued as its own item update so each partner device
 * converges through normal LWW sync.
 */
export async function removePlanningEvent(
  existing: PlanningEvent,
  author: EventAuthor,
): Promise<void> {
  assertEventAuthor(author);
  if (existing.household_id !== author.householdId) {
    throw new Error('This event belongs to a different household.');
  }
  const detachedAt = nextLocalUpdatedAt(new Date(), existing.updated_at);
  const payload: PlanningEvent = {
    ...existing,
    updated_at: detachedAt,
    updated_by: author.user.id,
  };

  await db.transaction('rw', db.planningEvents, db.plannedItems, db.pendingChanges, async () => {
    const linked = await db.plannedItems
      .where('household_id')
      .equals(existing.household_id)
      .filter((item) => item.event_id === existing.id)
      .toArray();
    for (const item of linked) {
      if (!item.event_id) continue;
      const detached: PlannedItem = {
        ...item,
        event_id: null,
        updated_at: nextLocalUpdatedAt(new Date(), item.updated_at),
        updated_by: author.user.id,
      };
      await db.plannedItems.put(detached);
      await db.pendingChanges.add({
        client_id: crypto.randomUUID(),
        household_id: item.household_id,
        op: 'update',
        table: 'planned_items',
        record_id: detached.id,
        payload: detached,
        created_at: detached.updated_at,
        status: 'pending',
        attempts: 0,
      });
    }
    await db.planningEvents.delete(existing.id);
    await db.pendingChanges.add(queueEventChange(payload, 'delete', crypto.randomUUID()));
  });
}

/** Reactive household events sorted by start date with undated events last. */
export function usePlanningEvents(householdId: string | null): PlanningEvent[] {
  const [events, setEvents] = useState<PlanningEvent[]>([]);

  useEffect(() => {
    if (!householdId) {
      setEvents([]);
      return;
    }
    const subscription = liveQuery(async () => {
      const rows = await db.planningEvents.where('household_id').equals(householdId).toArray();
      return sortPlanningEvents(rows);
    }).subscribe({
      next: setEvents,
      error: (error) => console.warn('Could not read local planning events.', error),
    });
    return () => subscription.unsubscribe();
  }, [householdId]);

  return events;
}
