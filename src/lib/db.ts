import Dexie, { type Table } from 'dexie';

export interface Transaction {
  id: string;
  household_id: string;
  amount: number;
  spent_at: string;
  note: string | null;
  chip: string | null;
  /** The household member who actually paid; nullable only for legacy rows. */
  payer_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  client_id: string;
  /** Set when this transaction was created by completing a planned item. */
  planned_item_id?: string | null;
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

/** A shared, budgeted item that can later be converted into a transaction. */
export interface PlannedItem {
  id: string;
  household_id: string;
  title: string;
  amount: number;
  planned_for: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
  completed_at: string | null;
  completed_by: string | null;
  spent_transaction_id: string | null;
  completion_client_id: string | null;
  /** Event this item belongs to; null keeps it on the general to-buy list. */
  event_id?: string | null;
  client_id: string;
  /** True when client_id is a local-only fallback for a legacy NULL row. */
  legacy_client_id?: boolean;
}

/** A named trip or project that groups planned items together. */
export interface PlanningEvent {
  id: string;
  household_id: string;
  title: string;
  starts_on: string | null;
  ends_on: string | null;
  note: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
  client_id: string;
}

export interface PendingChange {
  client_id: string;
  household_id: string;
  op: 'insert' | 'update' | 'delete' | 'complete';
  table: 'transactions' | 'budgets' | 'planned_items' | 'planning_events';
  record_id: string;
  payload: unknown;
  created_at: string;
  status: 'pending' | 'synced' | 'failed';
  attempts: number;
  /** ISO time of the last failed delivery, used for exponential backoff. */
  last_attempt_at?: string;
}

function backfillTransactionPayer(payload: unknown): void {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return;
  const record = payload as Record<string, unknown>;
  if (!record.payer_id && typeof record.created_by === 'string') {
    record.payer_id = record.created_by;
  }
  if (record.transaction) backfillTransactionPayer(record.transaction);
}

class CoupleSpendingDatabase extends Dexie {
  transactions!: Table<Transaction, string>;
  budgets!: Table<Budget, string>;
  plannedItems!: Table<PlannedItem, string>;
  planningEvents!: Table<PlanningEvent, string>;
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

    // Shared shopping plans join the same offline queue and household scope as
    // transactions. The table is separate so active and completed plan items
    // remain available without polluting the spending timeline.
    this.version(4).stores({
      transactions: 'id, household_id, spent_at, &client_id, deleted_at',
      budgets: 'id, household_id',
      plannedItems: 'id, household_id, planned_for, completed_at, &client_id',
      pendingChanges: 'client_id, household_id, status, created_at',
      household_members: 'id, household_id',
      audit_log: 'id, household_id, record_id',
    });

    // Payer attribution was added after the original local schema. Backfill
    // cached rows and queued transaction/completion payloads from created_by
    // so an upgrade never drops an offline write.
    this.version(5)
      .stores({
        transactions: 'id, household_id, spent_at, &client_id, deleted_at',
        budgets: 'id, household_id',
        plannedItems: 'id, household_id, planned_for, completed_at, &client_id',
        pendingChanges: 'client_id, household_id, status, created_at',
        household_members: 'id, household_id',
        audit_log: 'id, household_id, record_id',
      })
      .upgrade((transaction) =>
        transaction
          .table('transactions')
          .toCollection()
          .modify((row: Transaction) => {
            if (!row.payer_id) row.payer_id = row.created_by || null;
          })
          .then(() =>
            transaction
              .table('pendingChanges')
              .toCollection()
              .modify((change: PendingChange) => backfillTransactionPayer(change.payload)),
          ),
      );

    // Event planning groups planned items under named trips or projects. The
    // join is a plain nullable column so removing an event can never strand a
    // completed item; clients detach linked items before the delete lands.
    this.version(6).stores({
      transactions: 'id, household_id, spent_at, &client_id, deleted_at',
      budgets: 'id, household_id',
      plannedItems: 'id, household_id, planned_for, completed_at, event_id, &client_id',
      planningEvents: 'id, household_id, starts_on, &client_id',
      pendingChanges: 'client_id, household_id, status, created_at',
      household_members: 'id, household_id',
      audit_log: 'id, household_id, record_id',
    });
  }
}

export const db = new CoupleSpendingDatabase();
