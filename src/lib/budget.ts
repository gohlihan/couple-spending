import { liveQuery } from 'dexie';
import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { db, type Budget } from './db';
import { nextLocalUpdatedAt } from './version';

export interface BudgetAuthor {
  user: User | null;
  householdId: string | null;
}

/**
 * Reactive read of the household's single budget row from Dexie. Hydration and
 * remote writes belong to the sync engine; this hook remains local-only so the
 * UI has one source of truth and no competing network write path.
 */
export async function saveBudget(
  amount: number,
  { user, householdId }: BudgetAuthor,
): Promise<void> {
  if (!user || !householdId) {
    throw new Error('You must be signed in to a household before changing the budget.');
  }
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error('Budget must be a finite amount of zero or more.');
  }

  await db.transaction('rw', db.budgets, db.pendingChanges, async () => {
    // The server enforces one budget per household. Reuse the local row as
    // well, so repeated edits update rather than create another budget.
    const existing = await db.budgets.where('household_id').equals(householdId).first();
    const next: Budget = {
      id: existing?.id ?? crypto.randomUUID(),
      household_id: householdId,
      amount,
      updated_at: nextLocalUpdatedAt(new Date(), existing?.updated_at ?? null),
      updated_by: user.id,
    };
    await db.budgets.put(next);

    // Keep each edit as an ordered durable queue entry. This prevents an
    // in-flight request from marking a newer local budget edit as synced.
    await db.pendingChanges.add({
      client_id: crypto.randomUUID(),
      household_id: householdId,
      op: 'update',
      table: 'budgets',
      record_id: next.id,
      payload: next,
      created_at: next.updated_at,
      status: 'pending',
      attempts: 0,
    });
    return next;
  });
}

export function useBudget(householdId: string | null): Budget | null {
  const [budget, setBudget] = useState<Budget | null>(null);

  useEffect(() => {
    if (!householdId) {
      setBudget(null);
      return;
    }

    const subscription = liveQuery(() =>
      db.budgets.where('household_id').equals(householdId).first(),
    ).subscribe({
      next: (row) => setBudget(row ?? null),
      error: (error) => console.warn('Could not read the local budget.', error),
    });

    return () => subscription.unsubscribe();
  }, [householdId]);

  return budget;
}
