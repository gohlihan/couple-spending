import type { User } from '@supabase/supabase-js';
import { db, type Transaction } from './db';

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
 * Stores a transaction locally and appends the durable write-queue entry. The
 * sync engine is the only path that writes this row to Supabase.
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
      household_id: householdId,
      op: 'insert',
      table: 'transactions',
      record_id: id,
      payload: transaction,
      created_at: now,
      status: 'pending',
      attempts: 0,
    });
  });
}
