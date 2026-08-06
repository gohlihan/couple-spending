import type { User } from '@supabase/supabase-js';
import { db, type Transaction } from './db';
import { nextLocalUpdatedAt } from './version';

export interface AddTransactionInput {
  amount: number;
  spentAt?: string;
  note?: string;
  chip?: string;
  payerId?: string | null;
  plannedItemId?: string | null;
}

export interface TransactionAuthor {
  user: User | null;
  householdId: string | null;
}

function assertTransactionAuthor(
  author: TransactionAuthor,
): asserts author is { user: User; householdId: string } {
  const { user, householdId } = author;
  if (!user || !householdId) {
    throw new Error('You must be signed in to a household before changing spending.');
  }
}

function assertAmount(amount: number): void {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Amount must be a finite value greater than zero.');
  }
}

function normalizeInput(
  input: AddTransactionInput,
  fallbackPayerId: string,
): Required<Pick<AddTransactionInput, 'amount'>> & {
  spentAt: string;
  note: string | null;
  chip: string | null;
  payerId: string;
  plannedItemId: string | null;
} {
  assertAmount(input.amount);
  const spentAt = input.spentAt ?? nextLocalUpdatedAt();
  if (Number.isNaN(Date.parse(spentAt))) throw new Error('Choose a valid date and time.');
  const payerId = input.payerId?.trim() || fallbackPayerId;
  if (!payerId) throw new Error('Choose who paid for this transaction.');
  return {
    amount: input.amount,
    spentAt,
    note: input.note?.trim() || null,
    chip: input.chip || null,
    payerId,
    plannedItemId: input.plannedItemId ?? null,
  };
}

function queuedTransactionChange(
  transaction: Transaction,
  op: 'insert' | 'update',
  queueId: string,
): Parameters<typeof db.pendingChanges.add>[0] {
  return {
    client_id: queueId,
    household_id: transaction.household_id,
    op,
    table: 'transactions',
    record_id: transaction.id,
    payload: transaction,
    created_at: transaction.updated_at,
    status: 'pending',
    attempts: 0,
  };
}

/**
 * Stores a transaction locally and appends the durable write-queue entry. The
 * sync engine is the only path that writes this row to Supabase.
 */
export async function addTransaction(
  input: AddTransactionInput,
  author: TransactionAuthor,
): Promise<Transaction> {
  assertTransactionAuthor(author);
  const normalized = normalizeInput(input, author.user.id);
  const now = nextLocalUpdatedAt();
  const id = crypto.randomUUID();
  const clientId = crypto.randomUUID();
  const transaction: Transaction = {
    id,
    household_id: author.householdId,
    amount: normalized.amount,
    spent_at: normalized.spentAt,
    note: normalized.note,
    chip: normalized.chip,
    payer_id: normalized.payerId,
    created_by: author.user.id,
    created_at: now,
    updated_at: now,
    updated_by: author.user.id,
    deleted_at: null,
    deleted_by: null,
    client_id: clientId,
    planned_item_id: normalized.plannedItemId,
  };

  await db.transaction('rw', db.transactions, db.pendingChanges, async () => {
    await db.transactions.add(transaction);
    await db.pendingChanges.add(queuedTransactionChange(transaction, 'insert', clientId));
  });
  return transaction;
}

/** Update an existing household transaction locally and queue an LWW write. */
export async function updateTransaction(
  existing: Transaction,
  input: AddTransactionInput,
  author: TransactionAuthor,
): Promise<Transaction> {
  assertTransactionAuthor(author);
  if (existing.household_id !== author.householdId || existing.deleted_at) {
    throw new Error('This transaction can no longer be edited.');
  }
  const normalized = normalizeInput(
    { ...input, plannedItemId: existing.planned_item_id },
    existing.payer_id || existing.created_by || author.user.id,
  );
  const updated: Transaction = {
    ...existing,
    amount: normalized.amount,
    spent_at: normalized.spentAt,
    note: normalized.note,
    chip: normalized.chip,
    payer_id: normalized.payerId,
    updated_at: nextLocalUpdatedAt(new Date(), existing.updated_at),
    updated_by: author.user.id,
  };
  const queueId = crypto.randomUUID();

  await db.transaction('rw', db.transactions, db.pendingChanges, async () => {
    await db.transactions.put(updated);
    await db.pendingChanges.add(queuedTransactionChange(updated, 'update', queueId));
  });
  return updated;
}

/**
 * Soft-delete a transaction so it disappears immediately while the durable
 * queue sends an audited UPDATE rather than a destructive remote DELETE.
 */
export async function softDeleteTransaction(
  existing: Transaction,
  author: TransactionAuthor,
): Promise<Transaction> {
  assertTransactionAuthor(author);
  if (existing.household_id !== author.householdId || existing.deleted_at) {
    throw new Error('This transaction has already been removed.');
  }
  const deletedAt = nextLocalUpdatedAt(new Date(), existing.updated_at);
  const deleted: Transaction = {
    ...existing,
    updated_at: deletedAt,
    updated_by: author.user.id,
    deleted_at: deletedAt,
    deleted_by: author.user.id,
  };
  const queueId = crypto.randomUUID();

  await db.transaction('rw', db.transactions, db.pendingChanges, async () => {
    await db.transactions.put(deleted);
    await db.pendingChanges.add(queuedTransactionChange(deleted, 'update', queueId));
  });
  return deleted;
}
