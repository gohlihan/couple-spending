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
  updated_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  client_id: string;
  /** True when client_id is a local-only index fallback for a legacy NULL row. */
  legacy_client_id?: boolean;
}

export interface Budget {
  id: string;
  household_id: string;
  amount: number;
  updated_at: string;
  updated_by: string | null;
}

export interface HouseholdMember {
  id: string;
  household_id: string;
  user_id: string;
  display_name: string | null;
}

export interface PendingChange {
  client_id: string;
  household_id: string;
  op: 'insert' | 'update' | 'delete';
  table: 'transactions' | 'budgets';
  record_id: string;
  payload: unknown;
  created_at: string;
  status: 'pending' | 'synced' | 'failed';
  attempts: number;
  /** ISO time of the last failed delivery, used for exponential backoff. */
  last_attempt_at?: string;
}

class CoupleSpendingDatabase extends Dexie {
  transactions!: Table<Transaction, string>;
  budgets!: Table<Budget, string>;
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

    // Phase 6 scopes queue reads by household and preserves insertion order for
    // deterministic draining. Existing Phase 3/5 queue rows are backfilled
    // from their payloads so an upgrade never strands an offline write.
    this.version(3)
      .stores({
        transactions: 'id, household_id, spent_at, &client_id, deleted_at',
        budgets: 'id, household_id',
        pendingChanges: 'client_id, household_id, status, created_at',
        household_members: 'id, household_id',
        audit_log: 'id, household_id, record_id',
      })
      .upgrade((transaction) =>
        transaction
          .table('pendingChanges')
          .toCollection()
          .modify((change: PendingChange) => {
            if (change.household_id) return;
            const payload = change.payload;
            if (
              payload &&
              typeof payload === 'object' &&
              'household_id' in payload &&
              typeof payload.household_id === 'string'
            ) {
              change.household_id = payload.household_id;
            }
          }),
      );
  }
}

export const db = new CoupleSpendingDatabase();
