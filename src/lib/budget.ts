import { liveQuery } from 'dexie';
import { useEffect, useState } from 'react';
import { db, type Budget } from './db';
import { supabase } from './supabase';

/**
 * Reactive read of the household's single budget row from Dexie.
 *
 * Read-only for Phase 4 (Phase 5 adds editing, Phase 6 wires full sync). The
 * Dexie `budgets` table is not yet populated by a sync engine, so we do a
 * best-effort, online-only hydration from Supabase into Dexie once per
 * household — mirroring the local-first + best-effort-remote pattern used by
 * `addTransaction`. The liveQuery below remains the single source of truth for
 * render, so the value reacts as soon as the local row lands.
 */
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
          await db.budgets.put(data as Budget);
        } catch (error: unknown) {
          console.warn('Could not hydrate the local budget from Supabase.', error);
        }
      })();
    }

    return () => subscription.unsubscribe();
  }, [householdId]);

  return budget;
}
