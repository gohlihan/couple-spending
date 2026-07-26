import Dexie, { type Table } from 'dexie';

export interface Transaction {
  id: string;
  household_id: string;
  amount: number;
  spent_at: string;
  note: string | null;
  chip: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  updated_by: string;
  deleted_at: string | null;
  deleted_by: string | null;
  client_id: string;
}

export interface PendingChange {
  client_id: string;
  op: 'insert' | 'update' | 'delete';
  table: 'transactions' | 'budgets';
  record_id: string;
  payload: unknown;
  created_at: string;
  status: 'pending' | 'synced' | 'failed';
  attempts: number;
}

class CoupleSpendingDatabase extends Dexie {
  transactions!: Table<Transaction, string>;
  pendingChanges!: Table<PendingChange, string>;

  constructor() {
    super('couple-spending');

    this.version(1).stores({
      transactions: 'id, household_id, spent_at, &client_id',
      budgets: 'id, household_id',
      pendingChanges: 'client_id, status',
      household_members: 'id, household_id',
      audit_log: 'id, household_id, record_id',
    });

    // Keep the original schema for existing installations, then add the
    // soft-delete lookup index required by the transaction list.
    this.version(2).stores({
      transactions: 'id, household_id, spent_at, &client_id, deleted_at',
      budgets: 'id, household_id',
      pendingChanges: 'client_id, status',
      household_members: 'id, household_id',
      audit_log: 'id, household_id, record_id',
    });
  }
}

export const db = new CoupleSpendingDatabase();
