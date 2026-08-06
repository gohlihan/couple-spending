import { liveQuery } from 'dexie';
import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { db, type PlannedItem, type Transaction } from './db';
import { nextLocalUpdatedAt } from './version';

export interface PlanAuthor {
  user: User | null;
  householdId: string | null;
}

export interface PlanItemInput {
  title: string;
  amount: number;
  plannedFor?: string | null;
}

export interface PlanCompletionPayload {
  planned_item: PlannedItem;
  transaction: Transaction;
  completion_client_id: string;
}

function assertPlanAuthor(
  author: PlanAuthor,
): asserts author is { user: User; householdId: string } {
  if (!author.user || !author.householdId) {
    throw new Error('You must be signed in to a household before changing your plan.');
  }
}

function normalizeInput(input: PlanItemInput): Required<PlanItemInput> {
  const title = input.title.trim();
  if (!title) throw new Error('Enter an item name.');
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error('Enter an estimated amount greater than zero.');
  }
  const plannedFor = input.plannedFor?.trim() || null;
  if (plannedFor && !/^\d{4}-\d{2}-\d{2}$/.test(plannedFor)) {
    throw new Error('Choose a valid purchase date.');
  }
  return { title, amount: input.amount, plannedFor };
}

function queuePlanChange(item: PlannedItem, op: 'insert' | 'update' | 'delete', queueId: string) {
  return {
    client_id: queueId,
    household_id: item.household_id,
    op,
    table: 'planned_items' as const,
    record_id: item.id,
    payload: item,
    created_at: item.updated_at,
    status: 'pending' as const,
    attempts: 0,
  };
}

/** Add a shared shopping item to the local plan and durable offline queue. */
export async function addPlannedItem(
  input: PlanItemInput,
  author: PlanAuthor,
): Promise<PlannedItem> {
  assertPlanAuthor(author);
  const normalized = normalizeInput(input);
  const now = nextLocalUpdatedAt();
  const clientId = crypto.randomUUID();
  const item: PlannedItem = {
    id: crypto.randomUUID(),
    household_id: author.householdId,
    title: normalized.title,
    amount: normalized.amount,
    planned_for: normalized.plannedFor,
    created_by: author.user.id,
    created_at: now,
    updated_at: now,
    updated_by: author.user.id,
    completed_at: null,
    completed_by: null,
    spent_transaction_id: null,
    completion_client_id: null,
    client_id: clientId,
  };

  await db.transaction('rw', db.plannedItems, db.pendingChanges, async () => {
    await db.plannedItems.add(item);
    await db.pendingChanges.add(queuePlanChange(item, 'insert', clientId));
  });
  return item;
}

/** Edit an active shopping item locally and queue its LWW update. */
export async function updatePlannedItem(
  existing: PlannedItem,
  input: PlanItemInput,
  author: PlanAuthor,
): Promise<PlannedItem> {
  assertPlanAuthor(author);
  if (existing.household_id !== author.householdId || existing.completed_at) {
    throw new Error('Completed items cannot be changed.');
  }
  const normalized = normalizeInput(input);
  const item: PlannedItem = {
    ...existing,
    title: normalized.title,
    amount: normalized.amount,
    planned_for: normalized.plannedFor,
    updated_at: nextLocalUpdatedAt(new Date(), existing.updated_at),
    updated_by: author.user.id,
  };
  const queueId = crypto.randomUUID();

  await db.transaction('rw', db.plannedItems, db.pendingChanges, async () => {
    await db.plannedItems.put(item);
    await db.pendingChanges.add(queuePlanChange(item, 'update', queueId));
  });
  return item;
}

/** Remove an active plan item locally and queue a conditional remote delete. */
export async function removePlannedItem(existing: PlannedItem, author: PlanAuthor): Promise<void> {
  assertPlanAuthor(author);
  if (existing.household_id !== author.householdId || existing.completed_at) {
    throw new Error('Completed items stay in history.');
  }
  const payload: PlannedItem = {
    ...existing,
    updated_at: nextLocalUpdatedAt(new Date(), existing.updated_at),
    updated_by: author.user.id,
  };
  const queueId = crypto.randomUUID();

  await db.transaction('rw', db.plannedItems, db.pendingChanges, async () => {
    await db.plannedItems.delete(existing.id);
    await db.pendingChanges.add(queuePlanChange(payload, 'delete', queueId));
  });
}

/**
 * Optimistically complete a plan item. The durable `complete` change is later
 * delivered through an idempotent server RPC that atomically creates the
 * canonical spending record and completes the shared item.
 */
export async function completePlannedItem(
  existing: PlannedItem,
  author: PlanAuthor,
  payerId?: string | null,
): Promise<PlanCompletionPayload> {
  assertPlanAuthor(author);
  if (existing.household_id !== author.householdId || existing.completed_at) {
    throw new Error('This item has already moved to history.');
  }

  const now = nextLocalUpdatedAt(new Date(), existing.updated_at);
  const selectedPayerId = payerId?.trim() || author.user.id;
  const completionClientId = crypto.randomUUID();
  const transactionId = crypto.randomUUID();
  const transactionClientId = `${completionClientId}:transaction`;
  const transaction: Transaction = {
    id: transactionId,
    household_id: author.householdId,
    amount: existing.amount,
    spent_at: now,
    note: existing.title,
    chip: 'shop',
    payer_id: selectedPayerId,
    created_by: author.user.id,
    created_at: now,
    updated_at: now,
    updated_by: author.user.id,
    deleted_at: null,
    deleted_by: null,
    client_id: transactionClientId,
    planned_item_id: existing.id,
  };
  const plannedItem: PlannedItem = {
    ...existing,
    updated_at: now,
    updated_by: author.user.id,
    completed_at: now,
    completed_by: author.user.id,
    spent_transaction_id: transactionId,
    completion_client_id: completionClientId,
  };
  const payload: PlanCompletionPayload = {
    planned_item: plannedItem,
    transaction,
    completion_client_id: completionClientId,
  };

  await db.transaction('rw', db.plannedItems, db.transactions, db.pendingChanges, async () => {
    await db.plannedItems.put(plannedItem);
    await db.transactions.add(transaction);
    await db.pendingChanges.add({
      client_id: completionClientId,
      household_id: author.householdId,
      op: 'complete',
      table: 'planned_items',
      record_id: existing.id,
      payload,
      created_at: now,
      status: 'pending',
      attempts: 0,
    });
  });
  return payload;
}

/** Reactive household plan; active items sort by due date, then creation time. */
export function usePlannedItems(householdId: string | null): PlannedItem[] {
  const [items, setItems] = useState<PlannedItem[]>([]);

  useEffect(() => {
    if (!householdId) {
      setItems([]);
      return;
    }
    const subscription = liveQuery(async () => {
      const rows = await db.plannedItems.where('household_id').equals(householdId).toArray();
      return rows.sort((left, right) => {
        if (Boolean(left.completed_at) !== Boolean(right.completed_at)) {
          return left.completed_at ? 1 : -1;
        }
        if (!left.completed_at) {
          const leftDate = left.planned_for ?? '9999-12-31';
          const rightDate = right.planned_for ?? '9999-12-31';
          return (
            leftDate.localeCompare(rightDate) || left.created_at.localeCompare(right.created_at)
          );
        }
        return (right.completed_at ?? '').localeCompare(left.completed_at ?? '');
      });
    }).subscribe({
      next: setItems,
      error: (error) => console.warn('Could not read local planned items.', error),
    });
    return () => subscription.unsubscribe();
  }, [householdId]);

  return items;
}
