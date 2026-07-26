import type { User } from '@supabase/supabase-js';
import { db, type Transaction } from './db';
import { supabase } from './supabase';

export interface AddTransactionInput {
  amount: number;
  spentAt?: string;
  note?: string;
  chip?: string;
}

export interface TransactionAuthor {
  user: User | null;
  householdId: string | null;
}

/**
 * Stores a transaction locally before attempting its best-effort v1 remote
 * insert. The pending change remains queued for the Phase 6 sync engine.
 */
export async function addTransaction(
  input: AddTransactionInput,
  { user, householdId }: TransactionAuthor,
): Promise<void> {
  if (!user || !householdId) {
    throw new Error('You must be signed in to a household before adding a transaction.');
  }

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const clientId = crypto.randomUUID();
  const transaction: Transaction = {
    id,
    household_id: householdId,
    amount: input.amount,
    spent_at: input.spentAt ?? now,
    note: input.note?.trim() || null,
    chip: input.chip || null,
    created_by: user.id,
    created_at: now,
    updated_at: now,
    updated_by: user.id,
    deleted_at: null,
    deleted_by: null,
    client_id: clientId,
  };

  await db.transaction('rw', db.transactions, db.pendingChanges, async () => {
    await db.transactions.add(transaction);
    await db.pendingChanges.add({
      client_id: clientId,
      op: 'insert',
      table: 'transactions',
      record_id: id,
      payload: transaction,
      created_at: now,
      status: 'pending',
      attempts: 0,
    });
  });

  // Phase 6 will drain pendingChanges with retries. Until then, an online
  // insert gives linked partners immediate server visibility without delaying
  // the local-first UI.
  if (navigator.onLine) {
    void (async () => {
      try {
        const { error } = await supabase.from('transactions').insert(transaction);
        if (error) console.warn('Transaction queued locally; remote insert failed.', error);
      } catch (error: unknown) {
        console.warn('Transaction queued locally; remote insert failed.', error);
      }
    })();
  }
}
