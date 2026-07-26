import { liveQuery } from 'dexie';
import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { db, type Budget } from './db';
import { supabase } from './supabase';

export interface BudgetAuthor {
  user: User | null;
  householdId: string | null;
}

/**
 * Reactive read of the household's single budget row from Dexie.
 *
 * The Dexie `budgets` table is not yet populated by a sync engine, so we do a
 * best-effort, online-only hydration from Supabase into Dexie once per
 * household — mirroring the local-first + best-effort-remote pattern used by
 * `addTransaction`. The liveQuery below remains the single source of truth for
 * render, so the value reacts as soon as a local edit lands.
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

  const now = new Date().toISOString();
  const budget = await db.transaction('rw', db.budgets, db.pendingChanges, async () => {
    // The server enforces one budget per household. Reuse the local row as
    // well, so repeated edits update rather than create another budget.
    const existing = await db.budgets.where('household_id').equals(householdId).first();
    const next: Budget = {
      id: existing?.id ?? crypto.randomUUID(),
      household_id: householdId,
      amount,
      updated_at: now,
      updated_by: user.id,
    };
    await db.budgets.put(next);

    // Until Phase 6 drains the queue, coalesce edits to the same budget row.
    // A previously synced change is retained as history and gets a new queue
    // entry when the budget is edited again.
    const queued = await db.pendingChanges
      .filter(
        (change) =>
          change.table === 'budgets' &&
          change.record_id === next.id &&
          (change.status === 'pending' || change.status === 'failed'),
      )
      .first();
    if (queued) {
      await db.pendingChanges.put({
        ...queued,
        op: 'update',
        payload: next,
        created_at: now,
        status: 'pending',
        attempts: 0,
      });
    } else {
      await db.pendingChanges.add({
        client_id: crypto.randomUUID(),
        op: 'update',
        table: 'budgets',
        record_id: next.id,
        payload: next,
        created_at: now,
        status: 'pending',
        attempts: 0,
      });
    }
    return next;
  });

  // Match Phase 3: local persistence never waits on the network. Phase 6 will
  // make this queue entry the durable retry path.
  if (navigator.onLine) {
    void (async () => {
      try {
        const { error } = await supabase
          .from('budgets')
          .upsert(budget, { onConflict: 'household_id' });
        if (error) console.warn('Budget queued locally; remote save failed.', error);
      } catch (error: unknown) {
        console.warn('Budget queued locally; remote save failed.', error);
      }
    })();
  }
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

    // Best-effort hydration so the waterfall shows a real remaining amount
    // before the Phase 6 sync engine exists. Never blocks the local read.
    if (navigator.onLine) {
      void (async () => {
        try {
          const { data, error } = await supabase
            .from('budgets')
            .select('id, household_id, amount, updated_at, updated_by')
            .eq('household_id', householdId)
            .maybeSingle();
          if (error || !data) return;
          const remoteBudget = data as Budget;
          const localBudget = await db.budgets.where('household_id').equals(householdId).first();
          // Never let an older remote read overwrite a local-first edit that
          // was made while hydration was in flight.
          if (!localBudget || remoteBudget.updated_at >= localBudget.updated_at) {
            await db.budgets.put(remoteBudget);
          }
        } catch (error: unknown) {
          console.warn('Could not hydrate the local budget from Supabase.', error);
        }
      })();
    }

    return () => subscription.unsubscribe();
  }, [householdId]);

  return budget;
}
