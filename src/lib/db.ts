import Dexie from 'dexie'

// Local IndexedDB schema mirroring DESIGN.md §4 (the server tables the app
// reads) plus the offline write queue `pendingChanges` (DESIGN.md §6.1).
//
// Phase 0 only declares the schema; the sync engine and business logic land in
// later phases. The indexed columns mirror the server schema — `&client_id`
// mirrors the UNIQUE constraint on transactions.client_id (idempotent sync key).

export const db = new Dexie('couple-spending')

db.version(1).stores({
  transactions: 'id, household_id, spent_at, &client_id',
  budgets: 'id, household_id',
  pendingChanges: 'client_id, status',
  household_members: 'id, household_id',
  audit_log: 'id, household_id, record_id',
})
