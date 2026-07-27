import { liveQuery } from 'dexie';
import { useEffect, useState } from 'react';
import { db, type Budget, type PendingChange, type PlannedItem, type Transaction } from './db';
import { supabase } from './supabase';
import { parseRealtimeDelete } from './realtime-delete';
import { hasUnresolvedEarlierChange, queueChangeKey } from './sync-queue';
import { compareVersions, observeUpdatedAt, type VersionStamp } from './version';

export { hasUnresolvedEarlierChange } from './sync-queue';
export { compareUpdatedAt, compareVersions } from './version';

/** The bounded retry cadence used while a household is open. */
export const SYNC_INTERVAL_MS = 30_000;
const MAX_RETRY_DELAY_MS = 5 * 60_000;

const TRANSACTION_COLUMNS =
  'id, household_id, amount, spent_at, note, chip, created_by, created_at, updated_at, updated_by, deleted_at, deleted_by, client_id';
const BUDGET_COLUMNS = 'id, household_id, amount, updated_at, updated_by';
const PLANNED_ITEM_COLUMNS =
  'id, household_id, title, amount, planned_for, created_by, created_at, updated_at, updated_by, completed_at, completed_by, spent_transaction_id, completion_client_id, client_id';

const TRANSACTION_UPSERT_FIELDS = [
  'id',
  'household_id',
  'amount',
  'spent_at',
  'note',
  'chip',
  'created_by',
  'created_at',
  'updated_at',
  'updated_by',
  'deleted_at',
  'deleted_by',
  'client_id',
  'planned_item_id',
] as const;
const TRANSACTION_UPDATE_FIELDS = TRANSACTION_UPSERT_FIELDS.filter(
  (field) => !['id', 'household_id', 'client_id'].includes(field),
);

type SyncTable = 'transactions' | 'budgets' | 'planned_items';
type RemoteRecord = Record<string, unknown>;
type RealtimeEvent = 'INSERT' | 'UPDATE' | 'DELETE';

type PostgrestDeleteResult = {
  data: Array<{ id: string }> | null;
  error: unknown;
};

export type SyncStatusName = 'synced' | 'pending' | 'needs attention' | 'offline';

export interface SyncStatus {
  status: SyncStatusName;
  pendingCount: number;
  failedCount: number;
  online: boolean;
  realtimeConnected: boolean;
  hydrating: boolean;
}

interface SyncEngineState {
  online: boolean;
  realtimeConnected: boolean;
  hydrating: boolean;
  hasError: boolean;
}

type StateListener = (state: SyncEngineState) => void;

function browserIsOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asAmount(value: unknown): number | null {
  const amount = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(amount) ? amount : null;
}

function versionOf(row: VersionStamp): VersionStamp {
  return {
    updated_at: row.updated_at ?? null,
    updated_by: row.updated_by ?? null,
  };
}

function payloadVersion(payload: unknown): VersionStamp {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { updated_at: null, updated_by: null };
  }
  const record = payload as RemoteRecord;
  return {
    updated_at: asString(record.updated_at),
    updated_by: asString(record.updated_by),
  };
}

function toTransaction(row: RemoteRecord, householdId: string): Transaction | null {
  const id = asString(row.id);
  const rowHouseholdId = asString(row.household_id);
  const amount = asAmount(row.amount);
  const spentAt = asString(row.spent_at);
  const createdAt = asString(row.created_at);
  const updatedAt = asString(row.updated_at);
  if (!id || rowHouseholdId !== householdId || amount === null || !spentAt || !createdAt) {
    return null;
  }

  const clientId = asString(row.client_id);
  observeUpdatedAt(updatedAt ?? createdAt);
  return {
    id,
    household_id: householdId,
    amount,
    spent_at: spentAt,
    note: asString(row.note),
    chip: asString(row.chip),
    // These columns are populated by the database for new rows. Empty-string
    // fallbacks keep an older nullable row displayable in the local cache.
    created_by: asString(row.created_by) ?? '',
    created_at: createdAt,
    updated_at: updatedAt ?? createdAt,
    updated_by: asString(row.updated_by),
    deleted_at: asString(row.deleted_at),
    deleted_by: asString(row.deleted_by),
    // Dexie needs a stable local index key even for legacy server rows whose
    // client_id is NULL. The marker prevents that local fallback from being
    // sent back as a server id during an update.
    client_id: clientId ?? id,
    planned_item_id: asString(row.planned_item_id),
    legacy_client_id: clientId === null,
  };
}

function toBudget(row: RemoteRecord, householdId: string): Budget | null {
  const id = asString(row.id);
  const rowHouseholdId = asString(row.household_id);
  const amount = asAmount(row.amount);
  const updatedAt = asString(row.updated_at);
  if (!id || rowHouseholdId !== householdId || amount === null || !updatedAt) return null;

  observeUpdatedAt(updatedAt);
  return {
    id,
    household_id: householdId,
    amount,
    updated_at: updatedAt,
    updated_by: asString(row.updated_by),
  };
}

function toPlannedItem(row: RemoteRecord, householdId: string): PlannedItem | null {
  const id = asString(row.id);
  const rowHouseholdId = asString(row.household_id);
  const title = asString(row.title);
  const amount = asAmount(row.amount);
  const createdAt = asString(row.created_at);
  const updatedAt = asString(row.updated_at);
  if (
    !id ||
    rowHouseholdId !== householdId ||
    !title ||
    amount === null ||
    !createdAt ||
    !updatedAt
  ) {
    return null;
  }

  const clientId = asString(row.client_id);
  observeUpdatedAt(updatedAt);
  return {
    id,
    household_id: householdId,
    title,
    amount,
    planned_for: asString(row.planned_for),
    created_by: asString(row.created_by) ?? '',
    created_at: createdAt,
    updated_at: updatedAt,
    updated_by: asString(row.updated_by),
    completed_at: asString(row.completed_at),
    completed_by: asString(row.completed_by),
    spent_transaction_id: asString(row.spent_transaction_id),
    completion_client_id: asString(row.completion_client_id),
    client_id: clientId ?? id,
    legacy_client_id: clientId === null,
  };
}

function payloadObject(payload: unknown): RemoteRecord {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Queued sync payload is not a record');
  }
  return payload as RemoteRecord;
}

function pickFields(payload: RemoteRecord, fields: readonly string[]): RemoteRecord {
  const picked: RemoteRecord = {};
  for (const field of fields) {
    if (field in payload) picked[field] = payload[field];
  }
  return picked;
}

function transactionUpsertPayload(payload: RemoteRecord): RemoteRecord {
  return pickFields(payload, TRANSACTION_UPSERT_FIELDS);
}

function transactionUpdatePayload(payload: RemoteRecord): RemoteRecord {
  return pickFields(payload, TRANSACTION_UPDATE_FIELDS);
}

function budgetPayload(payload: RemoteRecord): RemoteRecord {
  return pickFields(payload, ['id', 'household_id', 'amount', 'updated_at', 'updated_by']);
}

function plannedItemPayload(payload: RemoteRecord): RemoteRecord {
  return pickFields(payload, [
    'id',
    'household_id',
    'title',
    'amount',
    'planned_for',
    'created_by',
    'created_at',
    'updated_at',
    'updated_by',
    'completed_at',
    'completed_by',
    'spent_transaction_id',
    'completion_client_id',
    'client_id',
  ]);
}

function pendingProtectsRemote(changes: PendingChange[], remote: VersionStamp): boolean {
  return changes.some((change) => {
    const queued = payloadVersion(change.payload);
    // A delete without a version has no safe conditional target. Keeping the
    // local row is safer than letting a reconnect erase an offline operation.
    if (change.op === 'delete' && !queued.updated_at) return true;
    return queued.updated_at !== null && compareVersions(queued, remote) >= 0;
  });
}

function retryDelayMs(attempts: number): number {
  if (attempts <= 0) return 0;
  return Math.min(MAX_RETRY_DELAY_MS, 1000 * 2 ** Math.min(attempts - 1, 8));
}

function isRetryEligible(change: PendingChange): boolean {
  if (change.status !== 'failed' || !change.last_attempt_at) return true;
  const lastAttempt = Date.parse(change.last_attempt_at);
  return !Number.isFinite(lastAttempt) || Date.now() - lastAttempt >= retryDelayMs(change.attempts);
}

function groupedPendingChanges(changes: PendingChange[]): Map<string, PendingChange[]> {
  const grouped = new Map<string, PendingChange[]>();
  for (const change of changes) {
    const key = `${change.table}:${change.record_id}`;
    const existing = grouped.get(key);
    if (existing) existing.push(change);
    else grouped.set(key, [change]);
  }
  return grouped;
}

function shouldApplyRemote(
  remote: VersionStamp,
  local: VersionStamp | null,
  pending: PendingChange[],
): boolean {
  if (pendingProtectsRemote(pending, remote)) return false;
  return local === null || compareVersions(remote, local) > 0;
}

class SyncEngine {
  private readonly householdId: string;
  private readonly onStateChange: StateListener;
  private readonly channelName: string;
  private state: SyncEngineState;
  private channel: ReturnType<typeof supabase.channel> | null = null;
  private intervalId: number | null = null;
  private drainPromise: Promise<void> | null = null;
  private hydratePromise: Promise<void> | null = null;
  private drainRequested = false;
  private hydrationNeedsRetry = false;
  private realtimeError = false;
  private started = false;
  private stopped = false;

  private readonly onlineHandler = () => {
    this.publish({ online: true });
    void this.hydrateAndDrain();
  };

  private readonly offlineHandler = () => {
    this.publish({ online: false, realtimeConnected: false });
  };

  constructor(householdId: string, onStateChange: StateListener) {
    this.householdId = householdId;
    this.onStateChange = onStateChange;
    this.channelName = `household-sync:${householdId}:${crypto.randomUUID()}`;
    this.state = {
      online: browserIsOnline(),
      realtimeConnected: false,
      hydrating: false,
      hasError: false,
    };
  }

  async start(): Promise<void> {
    if (this.started || this.stopped) return;
    this.started = true;
    this.publish({ online: browserIsOnline() });

    window.addEventListener('online', this.onlineHandler);
    window.addEventListener('offline', this.offlineHandler);
    this.startRealtime();
    this.intervalId = window.setInterval(() => {
      if (!browserIsOnline()) return;
      // A transient snapshot failure must retry hydration, not just writes;
      // otherwise a cold-start cache can remain stale indefinitely.
      void (this.hydrationNeedsRetry ? this.hydrateAndDrain() : this.drain());
    }, SYNC_INTERVAL_MS);

    await this.cleanupSyncedChanges();
    if (!this.stopped && browserIsOnline()) await this.hydrateAndDrain();
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    window.removeEventListener('online', this.onlineHandler);
    window.removeEventListener('offline', this.offlineHandler);
    if (this.intervalId !== null) window.clearInterval(this.intervalId);
    this.intervalId = null;
    if (this.channel) void supabase.removeChannel(this.channel);
    this.channel = null;
  }

  /** Request a prompt drain after a local queue append without overtaking hydration. */
  requestDrain(): void {
    if (!this.started || this.stopped || !browserIsOnline()) return;
    this.drainRequested = true;
    if (!this.state.hydrating) void this.drain();
  }

  private publish(patch: Partial<SyncEngineState>): void {
    if (this.stopped) return;
    this.state = { ...this.state, ...patch };
    this.onStateChange(this.state);
  }

  private reportError(error: unknown, realtime = false): void {
    if (this.stopped) return;
    if (realtime) this.realtimeError = true;
    this.publish({ hasError: true });
    const message = error instanceof Error ? error.message : String(error);
    console.warn('Sync engine request failed.', message);
  }

  private reportReconciliationError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    console.warn('Sync engine write committed but local reconciliation failed.', message);
  }

  private clearError(): void {
    if (this.state.hasError && !this.realtimeError) this.publish({ hasError: false });
  }

  private async cleanupSyncedChanges(): Promise<void> {
    if (this.stopped) return;
    try {
      await db.pendingChanges.where('status').equals('synced').delete();
    } catch (error: unknown) {
      this.reportError(error);
    }
  }

  private startRealtime(): void {
    const householdFilter = `household_id=eq.${this.householdId}`;
    const handlePayload = (
      table: SyncTable,
      payload: {
        eventType: RealtimeEvent;
        new: RemoteRecord;
        old: RemoteRecord;
      },
    ) => {
      void this.handleRealtimeChange(table, payload.eventType, payload).catch((error) =>
        this.reportError(error, true),
      );
    };

    // Supabase does not support DELETE filters. Keep INSERT/UPDATE scoped at
    // the subscription layer, then use the authenticated SELECT fallback for
    // DELETE payloads that lack household_id or version columns under RLS.
    this.channel = supabase
      .channel(this.channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'transactions',
          filter: householdFilter,
        },
        (payload) => handlePayload('transactions', payload),
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'transactions',
          filter: householdFilter,
        },
        (payload) => handlePayload('transactions', payload),
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'transactions',
        },
        (payload) => handlePayload('transactions', payload),
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'budgets',
          filter: householdFilter,
        },
        (payload) => handlePayload('budgets', payload),
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'budgets',
          filter: householdFilter,
        },
        (payload) => handlePayload('budgets', payload),
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'budgets',
        },
        (payload) => handlePayload('budgets', payload),
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'planned_items',
          filter: householdFilter,
        },
        (payload) => handlePayload('planned_items', payload),
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'planned_items',
          filter: householdFilter,
        },
        (payload) => handlePayload('planned_items', payload),
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'planned_items',
        },
        (payload) => handlePayload('planned_items', payload),
      )
      .subscribe((status) => {
        if (this.stopped) return;
        if (status === 'SUBSCRIBED') {
          this.realtimeError = false;
          this.publish({ realtimeConnected: true });
          // Realtime can reconnect without delivering events that happened
          // while the channel was down, so reconcile a complete snapshot.
          void this.hydrateAndDrain();
          // A successful rejoin resolves a transient channel error; retained
          // failed queue entries still keep the status at needs attention.
          this.clearError();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          this.publish({ realtimeConnected: false });
          this.reportError(new Error(`Realtime channel ${status.toLowerCase()}`), true);
        } else if (status === 'CLOSED') {
          this.publish({ realtimeConnected: false });
          this.reportError(new Error('Realtime channel closed'), true);
        }
      });
  }

  private async hydrateAndDrain(): Promise<void> {
    if (this.stopped || !browserIsOnline()) return;
    await this.hydrate();
    if (!this.stopped && browserIsOnline()) await this.drain();
  }

  private hydrate(): Promise<void> {
    if (this.stopped || !browserIsOnline()) return Promise.resolve();
    if (this.hydratePromise) return this.hydratePromise;

    const runHydration = async () => {
      // A drain that began just before this snapshot request must finish first;
      // otherwise its queue row could be removed before the stale snapshot's
      // local reconciliation reads pending_changes.
      while (this.drainPromise && !this.stopped) await this.drainPromise;
      if (!this.stopped && browserIsOnline()) await this.performHydrate();
    };
    this.hydratePromise = runHydration().finally(() => {
      this.hydratePromise = null;
    });
    return this.hydratePromise;
  }

  private async performHydrate(): Promise<void> {
    if (this.stopped || !browserIsOnline()) return;
    this.publish({ hydrating: true });

    try {
      const [transactionResult, budgetResult, plannedItemResult] = await Promise.all([
        supabase
          .from('transactions')
          .select(TRANSACTION_COLUMNS)
          .eq('household_id', this.householdId),
        supabase
          .from('budgets')
          .select(BUDGET_COLUMNS)
          .eq('household_id', this.householdId)
          .maybeSingle(),
        supabase
          .from('planned_items')
          .select(PLANNED_ITEM_COLUMNS)
          .eq('household_id', this.householdId),
      ]);
      if (transactionResult.error) throw transactionResult.error;
      if (budgetResult.error) throw budgetResult.error;
      if (plannedItemResult.error) throw plannedItemResult.error;
      if (this.stopped) return;

      const remoteTransactions = (transactionResult.data ?? [])
        .map((row) => toTransaction(row as RemoteRecord, this.householdId))
        .filter((row): row is Transaction => row !== null);
      const remoteBudget = budgetResult.data
        ? toBudget(budgetResult.data as RemoteRecord, this.householdId)
        : null;
      const remotePlannedItems = (plannedItemResult.data ?? [])
        .map((row) => toPlannedItem(row as RemoteRecord, this.householdId))
        .filter((row): row is PlannedItem => row !== null);
      const remoteTransactionIds = new Set(remoteTransactions.map((row) => row.id));
      const remotePlannedItemIds = new Set(remotePlannedItems.map((row) => row.id));

      await db.transaction(
        'rw',
        db.transactions,
        db.budgets,
        db.plannedItems,
        db.pendingChanges,
        async () => {
          const localTransactions = await db.transactions
            .where('household_id')
            .equals(this.householdId)
            .toArray();
          const localBudget = await db.budgets
            .where('household_id')
            .equals(this.householdId)
            .first();
          const localPlannedItems = await db.plannedItems
            .where('household_id')
            .equals(this.householdId)
            .toArray();
          const pending = await db.pendingChanges
            .where('household_id')
            .equals(this.householdId)
            .filter((change) => change.status === 'pending' || change.status === 'failed')
            .toArray();
          if (this.stopped) return;

          const localById = new Map(localTransactions.map((row) => [row.id, row]));
          const localByClientId = new Map(localTransactions.map((row) => [row.client_id, row]));
          const pendingByRecord = groupedPendingChanges(pending);

          for (const remote of remoteTransactions) {
            if (this.stopped) return;
            const local = localById.get(remote.id) ?? localByClientId.get(remote.client_id);
            const rowPending = pendingByRecord.get(`transactions:${remote.id}`) ?? [];
            if (shouldApplyRemote(versionOf(remote), local ? versionOf(local) : null, rowPending)) {
              if (local && local.id !== remote.id) await db.transactions.delete(local.id);
              await db.transactions.put(remote);
            }
          }

          // The query is a complete household snapshot. Remove stale local rows
          // only when no pending/failed operation protects that record.
          for (const local of localTransactions) {
            if (this.stopped) return;
            if (
              !remoteTransactionIds.has(local.id) &&
              !(pendingByRecord.get(`transactions:${local.id}`)?.length ?? 0)
            ) {
              await db.transactions.delete(local.id);
            }
          }

          for (const remote of remotePlannedItems) {
            if (this.stopped) return;
            const local = localPlannedItems.find((item) => item.id === remote.id);
            const itemPending = pendingByRecord.get(`planned_items:${remote.id}`) ?? [];
            if (
              shouldApplyRemote(versionOf(remote), local ? versionOf(local) : null, itemPending)
            ) {
              await db.plannedItems.put(remote);
            }
          }
          for (const local of localPlannedItems) {
            if (this.stopped) return;
            if (
              !remotePlannedItemIds.has(local.id) &&
              !(pendingByRecord.get(`planned_items:${local.id}`)?.length ?? 0)
            ) {
              await db.plannedItems.delete(local.id);
            }
          }

          const budgetPending = pending.filter((change) => change.table === 'budgets');
          if (remoteBudget) {
            const protectedBudget = pendingProtectsRemote(budgetPending, versionOf(remoteBudget));
            if (
              !this.stopped &&
              !protectedBudget &&
              (shouldApplyRemote(
                versionOf(remoteBudget),
                localBudget ? versionOf(localBudget) : null,
                budgetPending,
              ) ||
                localBudget?.id !== remoteBudget.id)
            ) {
              if (localBudget && localBudget.id !== remoteBudget.id) {
                await db.budgets.delete(localBudget.id);
              }
              if (!this.stopped) await db.budgets.put(remoteBudget);
            }
          } else if (localBudget && budgetPending.length === 0 && !this.stopped) {
            await db.budgets.delete(localBudget.id);
          }
        },
      );
      if (!this.stopped) {
        this.hydrationNeedsRetry = false;
        this.clearError();
      }
    } catch (error: unknown) {
      this.hydrationNeedsRetry = true;
      this.reportError(error);
    } finally {
      if (!this.stopped) this.publish({ hydrating: false });
    }
  }

  private async drain(): Promise<void> {
    if (this.stopped || !browserIsOnline()) return;
    this.drainRequested = true;
    if (this.hydratePromise) {
      await this.hydratePromise;
      if (this.stopped || !browserIsOnline()) return;
    }
    if (this.state.hydrating) return;
    if (this.drainPromise) return this.drainPromise;

    this.drainPromise = this.drainRequestedQueue()
      .catch((error: unknown) => {
        this.reportError(error);
      })
      .finally(() => {
        this.drainPromise = null;
        // A queue change can land just after the loop observes no more work.
        // Start a fresh pass instead of leaving it until the safety interval.
        if (this.drainRequested && !this.stopped && browserIsOnline() && !this.state.hydrating) {
          void this.drain();
        }
      });
    return this.drainPromise;
  }

  private async drainRequestedQueue(): Promise<void> {
    while (!this.stopped && browserIsOnline() && this.drainRequested) {
      this.drainRequested = false;
      await this.drainQueue();
    }
  }

  private async drainQueue(): Promise<void> {
    if (this.stopped || !browserIsOnline()) return;
    const changes = await db.pendingChanges
      .where('household_id')
      .equals(this.householdId)
      .filter((change) => change.status === 'pending' || change.status === 'failed')
      .toArray();
    changes.sort(
      (left, right) =>
        left.created_at.localeCompare(right.created_at) ||
        left.client_id.localeCompare(right.client_id),
    );
    const supersededIds = await this.dropChangesSupersededByDelete(changes);
    if (this.stopped || !browserIsOnline()) return;

    let failed = false;
    let delivered = false;
    const resolvedIds = new Set(supersededIds);
    const blockedKeys = new Set<string>();
    for (const change of changes) {
      if (resolvedIds.has(change.client_id)) continue;
      if (this.stopped || !browserIsOnline()) break;

      const key = queueChangeKey(change);
      // Do not let an update overtake a failed/backing-off insert (or any
      // earlier same-record write). A missing remote row is only authoritative
      // once all earlier dependencies have been delivered or superseded by a
      // later delete.
      if (blockedKeys.has(key) || hasUnresolvedEarlierChange(changes, change, resolvedIds)) {
        blockedKeys.add(key);
        continue;
      }
      if (!isRetryEligible(change)) {
        blockedKeys.add(key);
        continue;
      }
      try {
        if (change.status === 'failed') {
          await db.pendingChanges.update(change.client_id, { status: 'pending' });
          if (this.stopped) break;
        }
        await this.pushChange(change);
        if (this.stopped || !browserIsOnline()) break;
        // A delivered/conflict-resolved row has no future retry value. Keeping
        // it would make the durable queue grow forever and obscure new edits.
        await db.pendingChanges.delete(change.client_id);
        resolvedIds.add(change.client_id);
        delivered = true;
      } catch (error: unknown) {
        if (this.stopped || !browserIsOnline()) break;
        failed = true;
        blockedKeys.add(key);
        await db.pendingChanges.update(change.client_id, {
          status: 'failed',
          attempts: change.attempts + 1,
          last_attempt_at: new Date().toISOString(),
        });
        this.reportError(error);
      }
    }

    // An empty drain must not hide a real hydration/realtime error. A network
    // write or conflict resolution can clear the error after it succeeds.
    if (!failed && delivered && browserIsOnline()) this.clearError();
  }

  private async dropChangesSupersededByDelete(changes: PendingChange[]): Promise<Set<string>> {
    const latestDelete = new Map<string, PendingChange>();
    for (const change of changes) {
      if (change.op === 'delete') {
        latestDelete.set(`${change.table}:${change.record_id}`, change);
      }
    }

    const superseded = changes.filter((change) => {
      const deleteChange = latestDelete.get(`${change.table}:${change.record_id}`);
      if (!deleteChange || deleteChange.client_id === change.client_id) return false;
      return (
        change.created_at.localeCompare(deleteChange.created_at) < 0 ||
        (change.created_at === deleteChange.created_at &&
          change.client_id.localeCompare(deleteChange.client_id) < 0)
      );
    });
    if (superseded.length === 0 || this.stopped) return new Set();
    const supersededIds = new Set(superseded.map((change) => change.client_id));
    await db.pendingChanges.bulkDelete([...supersededIds]);
    return supersededIds;
  }

  private async pushChange(change: PendingChange): Promise<void> {
    if (change.household_id !== this.householdId) {
      throw new Error('Queued sync change is outside the active household');
    }

    const payload = payloadObject(change.payload);
    const completionPlan =
      change.table === 'planned_items' && change.op === 'complete'
        ? payloadObject(payload.planned_item)
        : null;
    const payloadHouseholdId =
      asString(payload.household_id) ?? asString(completionPlan?.household_id);
    if (payloadHouseholdId && payloadHouseholdId !== this.householdId) {
      throw new Error('Queued sync payload is outside the active household');
    }
    if (!payloadHouseholdId && change.op !== 'delete') {
      throw new Error('Queued sync payload has no household id');
    }

    if (change.table === 'transactions') {
      if (change.op === 'delete') {
        await this.pushTransactionDelete(change, payload);
        return;
      }

      const transaction = toTransaction(payload, this.householdId);
      if (!transaction) throw new Error('Queued transaction payload is invalid');
      const remote = await this.fetchRemoteTransaction(change.record_id);
      if (this.stopped) return;
      if (remote && compareVersions(versionOf(remote), versionOf(transaction)) > 0) {
        await this.mergeRemoteTransaction(remote);
        return;
      }

      if (!remote && change.op === 'update') {
        // Without a tombstone table, a missing row is an authoritative remote
        // delete. Do not resurrect it with a stale update payload.
        await this.removeLocalTransactionAfterResolution(
          change.record_id,
          versionOf(transaction),
          change.client_id,
        );
        return;
      }

      if (remote?.legacy_client_id) {
        // Legacy rows have client_id NULL on the server. Updating by primary id
        // avoids inventing a historical client_id and accidentally inserting a
        // duplicate through ON CONFLICT (client_id).
        let request = supabase
          .from('transactions')
          .update(transactionUpdatePayload(payload))
          .eq('household_id', this.householdId)
          .eq('id', change.record_id)
          .eq('updated_at', remote.updated_at);
        request = remote.updated_by
          ? request.eq('updated_by', remote.updated_by)
          : request.is('updated_by', null);
        const { error } = await request;
        if (error) throw error;
        await this.reconcileTransaction(change);
        return;
      }

      const { error } = await supabase
        .from('transactions')
        .upsert(transactionUpsertPayload(payload), { onConflict: 'client_id' });
      if (error) throw error;
      await this.reconcileTransaction(change);
      return;
    }

    if (change.table === 'planned_items') {
      if (change.op === 'complete') {
        await this.pushPlannedItemCompletion(change, payload);
        return;
      }
      if (change.op === 'delete') {
        await this.pushPlannedItemDelete(change, payload);
        return;
      }

      const plannedItem = toPlannedItem(payload, this.householdId);
      if (!plannedItem) throw new Error('Queued planned item payload is invalid');
      const remote = await this.fetchRemotePlannedItem(change.record_id);
      if (this.stopped) return;
      if (remote && compareVersions(versionOf(remote), versionOf(plannedItem)) > 0) {
        await this.mergeRemotePlannedItem(remote);
        return;
      }
      if (!remote && change.op === 'update') {
        await this.removeLocalPlannedItemAfterResolution(
          change.record_id,
          versionOf(plannedItem),
          change.client_id,
        );
        return;
      }

      const { error } = await supabase
        .from('planned_items')
        .upsert(plannedItemPayload(payload), { onConflict: 'client_id' });
      if (error) throw error;
      await this.reconcilePlannedItem(change);
      return;
    }

    if (change.op === 'delete') {
      await this.pushBudgetDelete(change, payload);
      return;
    }

    const budget = toBudget(payload, this.householdId);
    if (!budget) throw new Error('Queued budget payload is invalid');
    const remote = await this.fetchRemoteBudget();
    if (this.stopped) return;
    if (remote && compareVersions(versionOf(remote), versionOf(budget)) > 0) {
      await this.mergeRemoteBudget(remote);
      return;
    }

    // household_id is the server's one-row budget key; local ids may differ
    // after a cold start, so never use the local budget id as the conflict key.
    const { error } = await supabase
      .from('budgets')
      .upsert(budgetPayload(payload), { onConflict: 'household_id' });
    if (error) throw error;
    await this.reconcileBudget();
  }

  private async pushTransactionDelete(change: PendingChange, payload: RemoteRecord): Promise<void> {
    const requestedVersion = payloadVersion(payload);
    const remote = await this.fetchRemoteTransaction(change.record_id);
    if (this.stopped) return;
    if (!remote) {
      await this.removeLocalTransactionAfterResolution(
        change.record_id,
        requestedVersion.updated_at ? requestedVersion : null,
        change.client_id,
      );
      return;
    }

    if (requestedVersion.updated_at && compareVersions(versionOf(remote), requestedVersion) > 0) {
      await this.mergeRemoteTransaction(remote);
      return;
    }

    // A minimal delete payload can omit the version. In that case the fetched
    // row supplies the conditional target, preventing a concurrent update from
    // being deleted after the read.
    const expectedVersion = requestedVersion.updated_at ? requestedVersion : versionOf(remote);
    const deleted = await this.deleteTransactionConditionally(change.record_id, expectedVersion);
    if (this.stopped) return;
    if (!deleted) {
      const latest = await this.fetchRemoteTransaction(change.record_id);
      if (this.stopped) return;
      if (latest) await this.mergeRemoteTransaction(latest);
      else
        await this.removeLocalTransactionAfterResolution(change.record_id, null, change.client_id);
      return;
    }
    await this.removeLocalTransactionAfterResolution(
      change.record_id,
      expectedVersion,
      change.client_id,
    );
  }

  private async pushBudgetDelete(change: PendingChange, payload: RemoteRecord): Promise<void> {
    const requestedVersion = payloadVersion(payload);
    const remote = await this.fetchRemoteBudget();
    if (this.stopped) return;
    if (!remote) {
      await this.removeLocalBudgetAfterResolution(
        requestedVersion.updated_at ? requestedVersion : null,
        change.client_id,
      );
      return;
    }

    if (requestedVersion.updated_at && compareVersions(versionOf(remote), requestedVersion) > 0) {
      await this.mergeRemoteBudget(remote);
      return;
    }

    const expectedVersion = requestedVersion.updated_at ? requestedVersion : versionOf(remote);
    const deleted = await this.deleteBudgetConditionally(expectedVersion);
    if (this.stopped) return;
    if (!deleted) {
      const latest = await this.fetchRemoteBudget();
      if (this.stopped) return;
      if (latest) await this.mergeRemoteBudget(latest);
      else await this.removeLocalBudgetAfterResolution(null, change.client_id);
      return;
    }
    await this.removeLocalBudgetAfterResolution(expectedVersion, change.client_id);
  }

  private async pushPlannedItemCompletion(
    change: PendingChange,
    payload: RemoteRecord,
  ): Promise<void> {
    const completionClientId = asString(payload.completion_client_id);
    if (!completionClientId) throw new Error('Queued planned item completion has no client id');

    const { data, error } = await supabase.rpc('complete_planned_item', {
      p_planned_item_id: change.record_id,
      p_completion_client_id: completionClientId,
    });
    if (error) throw error;
    if (this.stopped) return;

    const response = payloadObject(data);
    const plannedItem = toPlannedItem(payloadObject(response.planned_item), this.householdId);
    const transaction = toTransaction(payloadObject(response.transaction), this.householdId);
    if (!plannedItem || !transaction) {
      throw new Error('Plan completion did not return canonical records');
    }
    await this.reconcilePlannedItemCompletion(plannedItem, transaction, change.client_id);
  }

  private async pushPlannedItemDelete(change: PendingChange, payload: RemoteRecord): Promise<void> {
    const requestedVersion = payloadVersion(payload);
    const remote = await this.fetchRemotePlannedItem(change.record_id);
    if (this.stopped) return;
    if (!remote) {
      await this.removeLocalPlannedItemAfterResolution(
        change.record_id,
        requestedVersion.updated_at ? requestedVersion : null,
        change.client_id,
      );
      return;
    }
    if (requestedVersion.updated_at && compareVersions(versionOf(remote), requestedVersion) > 0) {
      await this.mergeRemotePlannedItem(remote);
      return;
    }

    const expectedVersion = requestedVersion.updated_at ? requestedVersion : versionOf(remote);
    const deleted = await this.deletePlannedItemConditionally(change.record_id, expectedVersion);
    if (this.stopped) return;
    if (!deleted) {
      const latest = await this.fetchRemotePlannedItem(change.record_id);
      if (this.stopped) return;
      if (latest) await this.mergeRemotePlannedItem(latest);
      else
        await this.removeLocalPlannedItemAfterResolution(change.record_id, null, change.client_id);
      return;
    }
    await this.removeLocalPlannedItemAfterResolution(
      change.record_id,
      expectedVersion,
      change.client_id,
    );
  }

  private async deleteTransactionConditionally(
    recordId: string,
    expected: VersionStamp,
  ): Promise<boolean> {
    let request = supabase
      .from('transactions')
      .delete()
      .eq('household_id', this.householdId)
      .eq('id', recordId);
    if (expected.updated_at) request = request.eq('updated_at', expected.updated_at);
    if (expected.updated_by) request = request.eq('updated_by', expected.updated_by);
    else request = request.is('updated_by', null);
    const result = (await request.select('id')) as PostgrestDeleteResult;
    if (result.error) throw result.error;
    return (result.data?.length ?? 0) > 0;
  }

  private async deleteBudgetConditionally(expected: VersionStamp): Promise<boolean> {
    let request = supabase.from('budgets').delete().eq('household_id', this.householdId);
    if (expected.updated_at) request = request.eq('updated_at', expected.updated_at);
    if (expected.updated_by) request = request.eq('updated_by', expected.updated_by);
    else request = request.is('updated_by', null);
    const result = (await request.select('id')) as PostgrestDeleteResult;
    if (result.error) throw result.error;
    return (result.data?.length ?? 0) > 0;
  }

  private async deletePlannedItemConditionally(
    recordId: string,
    expected: VersionStamp,
  ): Promise<boolean> {
    let request = supabase
      .from('planned_items')
      .delete()
      .eq('household_id', this.householdId)
      .eq('id', recordId);
    if (expected.updated_at) request = request.eq('updated_at', expected.updated_at);
    if (expected.updated_by) request = request.eq('updated_by', expected.updated_by);
    else request = request.is('updated_by', null);
    const result = (await request.select('id')) as PostgrestDeleteResult;
    if (result.error) throw result.error;
    return (result.data?.length ?? 0) > 0;
  }

  private async reconcileTransaction(change: PendingChange): Promise<void> {
    if (this.stopped) return;
    try {
      const stored = await this.fetchRemoteTransaction(change.record_id);
      if (this.stopped) return;
      if (stored) await this.mergeRemoteTransaction(stored);
      else if (change.op === 'update') {
        await this.removeLocalTransactionAfterResolution(
          change.record_id,
          payloadVersion(change.payload),
          change.client_id,
        );
      }
    } catch (error: unknown) {
      // The upsert/update already committed. Do not retain the queue row just
      // because this optional read or local merge failed.
      this.reportReconciliationError(error);
    }
  }

  private async reconcileBudget(): Promise<void> {
    if (this.stopped) return;
    try {
      const stored = await this.fetchRemoteBudget();
      if (this.stopped) return;
      if (stored) await this.mergeRemoteBudget(stored);
    } catch (error: unknown) {
      this.reportReconciliationError(error);
    }
  }

  private async reconcilePlannedItem(change: PendingChange): Promise<void> {
    if (this.stopped) return;
    try {
      const stored = await this.fetchRemotePlannedItem(change.record_id);
      if (this.stopped) return;
      if (stored) await this.mergeRemotePlannedItem(stored);
      else if (change.op === 'update') {
        await this.removeLocalPlannedItemAfterResolution(
          change.record_id,
          payloadVersion(change.payload),
          change.client_id,
        );
      }
    } catch (error: unknown) {
      this.reportReconciliationError(error);
    }
  }

  private async fetchRemoteTransaction(recordId: string): Promise<Transaction | null> {
    const { data, error } = await supabase
      .from('transactions')
      .select(TRANSACTION_COLUMNS)
      .eq('household_id', this.householdId)
      .eq('id', recordId)
      .maybeSingle();
    if (error) throw error;
    return data ? toTransaction(data as RemoteRecord, this.householdId) : null;
  }

  private async fetchRemoteBudget(recordId?: string): Promise<Budget | null> {
    let request = supabase
      .from('budgets')
      .select(BUDGET_COLUMNS)
      .eq('household_id', this.householdId);
    if (recordId) request = request.eq('id', recordId);
    const { data, error } = await request.maybeSingle();
    if (error) throw error;
    return data ? toBudget(data as RemoteRecord, this.householdId) : null;
  }

  private async fetchRemotePlannedItem(recordId: string): Promise<PlannedItem | null> {
    const { data, error } = await supabase
      .from('planned_items')
      .select(PLANNED_ITEM_COLUMNS)
      .eq('household_id', this.householdId)
      .eq('id', recordId)
      .maybeSingle();
    if (error) throw error;
    return data ? toPlannedItem(data as RemoteRecord, this.householdId) : null;
  }

  private async removeLocalTransactionAfterResolution(
    recordId: string,
    resolvedVersion: VersionStamp | null,
    currentChangeId: string,
  ): Promise<void> {
    if (this.stopped) return;
    await db.transaction('rw', db.transactions, db.pendingChanges, async () => {
      const local = await db.transactions
        .where('id')
        .equals(recordId)
        .filter((row) => row.household_id === this.householdId)
        .first();
      const active = await db.pendingChanges
        .where('household_id')
        .equals(this.householdId)
        .filter(
          (change) =>
            change.client_id !== currentChangeId &&
            change.table === 'transactions' &&
            change.record_id === recordId &&
            (change.status === 'pending' || change.status === 'failed'),
        )
        .toArray();
      if (this.stopped || !local) return;
      const localIsNewer =
        resolvedVersion !== null && compareVersions(versionOf(local), resolvedVersion) > 0;
      const newerPending = active.some((change) => {
        const queued = payloadVersion(change.payload);
        return !queued.updated_at || resolvedVersion === null
          ? true
          : compareVersions(queued, resolvedVersion) > 0;
      });
      if (!localIsNewer && !newerPending && !this.stopped) await db.transactions.delete(recordId);
    });
  }

  private async removeLocalBudgetAfterResolution(
    resolvedVersion: VersionStamp | null,
    currentChangeId: string,
  ): Promise<void> {
    if (this.stopped) return;
    await db.transaction('rw', db.budgets, db.pendingChanges, async () => {
      const local = await db.budgets.where('household_id').equals(this.householdId).first();
      const active = await db.pendingChanges
        .where('household_id')
        .equals(this.householdId)
        .filter(
          (change) =>
            change.client_id !== currentChangeId &&
            change.table === 'budgets' &&
            (change.status === 'pending' || change.status === 'failed'),
        )
        .toArray();
      if (this.stopped || !local) return;
      const localIsNewer =
        resolvedVersion !== null && compareVersions(versionOf(local), resolvedVersion) > 0;
      const newerPending = active.some((change) => {
        const queued = payloadVersion(change.payload);
        return !queued.updated_at || resolvedVersion === null
          ? true
          : compareVersions(queued, resolvedVersion) > 0;
      });
      if (!localIsNewer && !newerPending && !this.stopped) await db.budgets.delete(local.id);
    });
  }

  private async removeLocalPlannedItemAfterResolution(
    recordId: string,
    resolvedVersion: VersionStamp | null,
    currentChangeId: string,
  ): Promise<void> {
    if (this.stopped) return;
    await db.transaction('rw', db.plannedItems, db.pendingChanges, async () => {
      const local = await db.plannedItems
        .where('id')
        .equals(recordId)
        .filter((row) => row.household_id === this.householdId)
        .first();
      const active = await db.pendingChanges
        .where('household_id')
        .equals(this.householdId)
        .filter(
          (change) =>
            change.client_id !== currentChangeId &&
            change.table === 'planned_items' &&
            change.record_id === recordId &&
            (change.status === 'pending' || change.status === 'failed'),
        )
        .toArray();
      if (this.stopped || !local) return;
      const localIsNewer =
        resolvedVersion !== null && compareVersions(versionOf(local), resolvedVersion) > 0;
      const newerPending = active.some((change) => {
        const queued = payloadVersion(change.payload);
        return !queued.updated_at || resolvedVersion === null
          ? true
          : compareVersions(queued, resolvedVersion) > 0;
      });
      if (!localIsNewer && !newerPending && !this.stopped) await db.plannedItems.delete(recordId);
    });
  }

  private async reconcilePlannedItemCompletion(
    plannedItem: PlannedItem,
    transaction: Transaction,
    currentChangeId: string,
  ): Promise<void> {
    if (this.stopped) return;
    await db.transaction('rw', db.plannedItems, db.transactions, db.pendingChanges, async () => {
      const laterPlanChanges = await db.pendingChanges
        .where('household_id')
        .equals(this.householdId)
        .filter(
          (change) =>
            change.client_id !== currentChangeId &&
            change.table === 'planned_items' &&
            change.record_id === plannedItem.id &&
            (change.status === 'pending' || change.status === 'failed'),
        )
        .toArray();
      const hasNewerPlanChange = laterPlanChanges.some(
        (change) => compareVersions(payloadVersion(change.payload), versionOf(plannedItem)) > 0,
      );
      if (!hasNewerPlanChange && !this.stopped) await db.plannedItems.put(plannedItem);

      const localTransaction = await db.transactions.get(transaction.id);
      const optimisticTransaction = await db.transactions
        .where('client_id')
        .equals(transaction.client_id)
        .first();
      if (
        !localTransaction ||
        compareVersions(versionOf(transaction), versionOf(localTransaction)) >= 0
      ) {
        if (optimisticTransaction && optimisticTransaction.id !== transaction.id) {
          await db.transactions.delete(optimisticTransaction.id);
        }
        if (!this.stopped) await db.transactions.put(transaction);
      }
    });
  }

  private async mergeRemoteTransaction(remote: Transaction): Promise<void> {
    if (this.stopped) return;
    await db.transaction('rw', db.transactions, db.pendingChanges, async () => {
      const local = await db.transactions
        .where('id')
        .equals(remote.id)
        .filter((row) => row.household_id === this.householdId)
        .first();
      const pending = await db.pendingChanges
        .where('household_id')
        .equals(this.householdId)
        .filter(
          (change) =>
            change.table === 'transactions' &&
            change.record_id === remote.id &&
            (change.status === 'pending' || change.status === 'failed'),
        )
        .toArray();
      if (this.stopped) return;
      if (shouldApplyRemote(versionOf(remote), local ? versionOf(local) : null, pending)) {
        const optimistic = await db.transactions.where('client_id').equals(remote.client_id).first();
        if (optimistic && optimistic.id !== remote.id) await db.transactions.delete(optimistic.id);
        await db.transactions.put(remote);
      }
    });
  }

  private async mergeRemoteBudget(remote: Budget): Promise<void> {
    if (this.stopped) return;
    await db.transaction('rw', db.budgets, db.pendingChanges, async () => {
      const local = await db.budgets.where('household_id').equals(this.householdId).first();
      const pending = await db.pendingChanges
        .where('household_id')
        .equals(this.householdId)
        .filter(
          (change) =>
            change.table === 'budgets' &&
            (change.status === 'pending' || change.status === 'failed'),
        )
        .toArray();
      if (this.stopped) return;
      if (shouldApplyRemote(versionOf(remote), local ? versionOf(local) : null, pending)) {
        if (local && local.id !== remote.id) await db.budgets.delete(local.id);
        if (!this.stopped) await db.budgets.put(remote);
      }
    });
  }

  private async mergeRemotePlannedItem(remote: PlannedItem): Promise<void> {
    if (this.stopped) return;
    await db.transaction('rw', db.plannedItems, db.pendingChanges, async () => {
      const local = await db.plannedItems
        .where('id')
        .equals(remote.id)
        .filter((row) => row.household_id === this.householdId)
        .first();
      const pending = await db.pendingChanges
        .where('household_id')
        .equals(this.householdId)
        .filter(
          (change) =>
            change.table === 'planned_items' &&
            change.record_id === remote.id &&
            (change.status === 'pending' || change.status === 'failed'),
        )
        .toArray();
      if (this.stopped) return;
      if (shouldApplyRemote(versionOf(remote), local ? versionOf(local) : null, pending)) {
        await db.plannedItems.put(remote);
      }
    });
  }

  private async handleRealtimeChange(
    table: SyncTable,
    event: RealtimeEvent,
    payload: {
      new: RemoteRecord;
      old: RemoteRecord;
    },
  ): Promise<void> {
    if (this.stopped) return;
    const row = event === 'DELETE' ? payload.old : payload.new;
    const payloadHouseholdId = asString(row.household_id);

    // DELETE filters are unsupported, so DELETE callbacks can contain events
    // from outside this household. A scoped payload can be rejected directly;
    // an RLS payload with only an id is checked by the authenticated refetch in
    // applyRemoteDelete before any local row is changed.
    if (payloadHouseholdId && payloadHouseholdId !== this.householdId) return;

    if (event === 'DELETE') {
      await this.applyRemoteDelete(table, row);
      return;
    }

    if (payloadHouseholdId !== this.householdId) return;
    if (table === 'transactions') {
      const remote = toTransaction(row, this.householdId);
      if (remote) await this.mergeRemoteTransaction(remote);
    } else if (table === 'budgets') {
      const remote = toBudget(row, this.householdId);
      if (remote) await this.mergeRemoteBudget(remote);
    } else {
      const remote = toPlannedItem(row, this.householdId);
      if (remote) await this.mergeRemotePlannedItem(remote);
    }
  }

  private async applyRemoteDelete(table: SyncTable, row: RemoteRecord): Promise<void> {
    const deleteInfo = parseRealtimeDelete(row);
    const recordId = deleteInfo.recordId;
    if (!recordId || this.stopped) return;

    // RLS-protected DELETE payloads may contain only the primary key. Re-fetch
    // through the household-scoped SELECT policy before touching local data.
    // This also avoids applying a stale delete to a newer row that was
    // recreated after the event was emitted.
    if (deleteInfo.requiresRefetch) {
      if (table === 'transactions') {
        const current = await this.fetchRemoteTransaction(recordId);
        if (this.stopped) return;
        if (current) {
          await this.mergeRemoteTransaction(current);
          return;
        }
      } else if (table === 'planned_items') {
        const current = await this.fetchRemotePlannedItem(recordId);
        if (this.stopped) return;
        if (current) {
          await this.mergeRemotePlannedItem(current);
          return;
        }
      } else {
        // Prefer the event's primary key so an unfiltered DELETE from another
        // household cannot be mistaken for this household's budget. A local
        // budget id can differ while an offline budget upsert is pending, so a
        // household snapshot is the conservative fallback before local delete.
        const currentById = await this.fetchRemoteBudget(recordId);
        if (this.stopped) return;
        if (currentById) {
          await this.mergeRemoteBudget(currentById);
          return;
        }
        const current = await this.fetchRemoteBudget();
        if (this.stopped) return;
        if (current) {
          await this.mergeRemoteBudget(current);
          return;
        }
      }
    }

    const remote = {
      updated_at: deleteInfo.updatedAt,
      updated_by: deleteInfo.updatedBy,
    };

    if (table === 'transactions') {
      await db.transaction('rw', db.transactions, db.pendingChanges, async () => {
        const local = await db.transactions
          .where('id')
          .equals(recordId)
          .filter((row) => row.household_id === this.householdId)
          .first();
        const pending = await db.pendingChanges
          .where('household_id')
          .equals(this.householdId)
          .filter(
            (change) =>
              change.table === 'transactions' &&
              change.record_id === recordId &&
              (change.status === 'pending' || change.status === 'failed'),
          )
          .toArray();
        if (this.stopped) return;
        if (
          local &&
          !pendingProtectsRemote(pending, remote) &&
          // DELETE carries the row's last version timestamp rather than a new
          // one, so equality remains an authoritative server deletion.
          (remote.updated_at === null || compareVersions(remote, versionOf(local)) >= 0) &&
          !this.stopped
        ) {
          await db.transactions.delete(recordId);
        }
      });
      return;
    }

    if (table === 'planned_items') {
      await db.transaction('rw', db.plannedItems, db.pendingChanges, async () => {
        const local = await db.plannedItems
          .where('id')
          .equals(recordId)
          .filter((row) => row.household_id === this.householdId)
          .first();
        const pending = await db.pendingChanges
          .where('household_id')
          .equals(this.householdId)
          .filter(
            (change) =>
              change.table === 'planned_items' &&
              change.record_id === recordId &&
              (change.status === 'pending' || change.status === 'failed'),
          )
          .toArray();
        if (this.stopped) return;
        if (
          local &&
          !pendingProtectsRemote(pending, remote) &&
          (remote.updated_at === null || compareVersions(remote, versionOf(local)) >= 0) &&
          !this.stopped
        ) {
          await db.plannedItems.delete(recordId);
        }
      });
      return;
    }

    await db.transaction('rw', db.budgets, db.pendingChanges, async () => {
      const local = await db.budgets.where('household_id').equals(this.householdId).first();
      const pending = await db.pendingChanges
        .where('household_id')
        .equals(this.householdId)
        .filter(
          (change) =>
            change.table === 'budgets' &&
            (change.status === 'pending' || change.status === 'failed'),
        )
        .toArray();
      if (this.stopped) return;
      if (
        local &&
        !pendingProtectsRemote(pending, remote) &&
        (remote.updated_at === null || compareVersions(remote, versionOf(local)) >= 0) &&
        !this.stopped
      ) {
        await db.budgets.delete(local.id);
      }
    });
  }
}

function initialEngineState(): SyncEngineState {
  return {
    online: browserIsOnline(),
    realtimeConnected: false,
    hydrating: false,
    hasError: false,
  };
}

/**
 * Starts one household-scoped sync lifecycle and exposes queue/realtime state
 * for the compact status indicator. Main is the owner, so unmounting it on
 * sign-out removes the channel, interval, and browser listeners.
 */
export function useSync(householdId: string | null): SyncStatus {
  const [queue, setQueue] = useState({ pendingCount: 0, failedCount: 0 });
  const [engineState, setEngineState] = useState<SyncEngineState>(initialEngineState);

  useEffect(() => {
    if (!householdId) {
      setQueue({ pendingCount: 0, failedCount: 0 });
      setEngineState(initialEngineState());
      return;
    }

    const engine = new SyncEngine(householdId, setEngineState);
    const queueSubscription = liveQuery(() =>
      db.pendingChanges
        .where('household_id')
        .equals(householdId)
        .filter((change) => change.status === 'pending' || change.status === 'failed')
        .toArray(),
    ).subscribe({
      next: (changes) => {
        let pendingCount = 0;
        let failedCount = 0;
        for (const change of changes) {
          if (change.status === 'failed') failedCount += 1;
          else pendingCount += 1;
        }
        setQueue({ pendingCount, failedCount });
        // Queue writes made while the app is already online should reach the
        // partner immediately rather than wait for the 30-second safety poll.
        if (pendingCount > 0) engine.requestDrain();
      },
      error: (error) => console.warn('Could not read the local sync queue.', error),
    });

    void engine.start();
    return () => {
      queueSubscription.unsubscribe();
      engine.stop();
    };
  }, [householdId]);

  const status: SyncStatusName =
    queue.failedCount > 0 || engineState.hasError
      ? 'needs attention'
      : queue.pendingCount > 0
        ? 'pending'
        : !engineState.online
          ? 'offline'
          : 'synced';

  return {
    status,
    pendingCount: queue.pendingCount,
    failedCount: queue.failedCount,
    online: engineState.online,
    realtimeConnected: engineState.realtimeConnected,
    hydrating: engineState.hydrating,
  };
}
