import { liveQuery } from 'dexie';
import { useEffect, useState } from 'react';
import { db, type Budget, type PendingChange, type Transaction } from './db';
import { supabase } from './supabase';

/** The bounded retry cadence used while a household is open. */
export const SYNC_INTERVAL_MS = 30_000;
const MAX_RETRY_DELAY_MS = 5 * 60_000;

const TRANSACTION_COLUMNS =
  'id, household_id, amount, spent_at, note, chip, created_by, created_at, updated_at, updated_by, deleted_at, deleted_by, client_id';
const BUDGET_COLUMNS = 'id, household_id, amount, updated_at, updated_by';

type SyncTable = 'transactions' | 'budgets';
type RemoteRecord = Record<string, unknown>;
type RealtimeEvent = 'INSERT' | 'UPDATE' | 'DELETE';

export type SyncStatusName = 'synced' | 'pending' | 'needs attention';

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

/**
 * Compare ISO timestamps without losing sub-millisecond precision returned by
 * Postgres. Supabase returns UTC timestamps, so lexical comparison is a safe
 * tie-breaker after Date.parse compares the millisecond portion.
 */
export function compareUpdatedAt(left: string | null, right: string | null): number {
  if (!left && !right) return 0;
  if (!left) return -1;
  if (!right) return 1;

  const leftMillis = Date.parse(left);
  const rightMillis = Date.parse(right);
  if (Number.isFinite(leftMillis) && Number.isFinite(rightMillis) && leftMillis !== rightMillis) {
    return leftMillis > rightMillis ? 1 : -1;
  }
  if (left === right) return 0;
  return left > right ? 1 : -1;
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
    updated_by: asString(row.updated_by) ?? '',
    deleted_at: asString(row.deleted_at),
    deleted_by: asString(row.deleted_by),
    // Existing rows predating client_id remain readable. They are not used as
    // a new queue payload until a later edit supplies a real client id.
    client_id: asString(row.client_id) ?? id,
  };
}

function toBudget(row: RemoteRecord, householdId: string): Budget | null {
  const id = asString(row.id);
  const rowHouseholdId = asString(row.household_id);
  const amount = asAmount(row.amount);
  const updatedAt = asString(row.updated_at);
  if (!id || rowHouseholdId !== householdId || amount === null || !updatedAt) return null;

  return {
    id,
    household_id: householdId,
    amount,
    updated_at: updatedAt,
    updated_by: asString(row.updated_by) ?? '',
  };
}

function payloadObject(payload: unknown): RemoteRecord {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Queued sync payload is not a record');
  }
  return payload as RemoteRecord;
}

function payloadUpdatedAt(change: PendingChange): string | null {
  if (!change.payload || typeof change.payload !== 'object' || Array.isArray(change.payload)) {
    return null;
  }
  return asString((change.payload as RemoteRecord).updated_at);
}

function pendingProtectsRemote(changes: PendingChange[], remoteUpdatedAt: string | null): boolean {
  return changes.some((change) => {
    // A delete without a row payload has no timestamp to compare. Keeping the
    // local row is safer than letting a reconnect erase an offline operation.
    if (change.op === 'delete' && !payloadUpdatedAt(change)) return true;
    const queuedUpdatedAt = payloadUpdatedAt(change);
    return queuedUpdatedAt !== null && compareUpdatedAt(queuedUpdatedAt, remoteUpdatedAt) >= 0;
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
  remoteUpdatedAt: string,
  localUpdatedAt: string | null,
  pending: PendingChange[],
): boolean {
  if (pendingProtectsRemote(pending, remoteUpdatedAt)) return false;
  return localUpdatedAt === null || compareUpdatedAt(remoteUpdatedAt, localUpdatedAt) > 0;
}

class SyncEngine {
  private readonly householdId: string;
  private readonly onStateChange: StateListener;
  private state: SyncEngineState;
  private channel: ReturnType<typeof supabase.channel> | null = null;
  private intervalId: number | null = null;
  private drainPromise: Promise<void> | null = null;
  private drainRequested = false;
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
      if (browserIsOnline()) void this.drain();
    }, SYNC_INTERVAL_MS);

    if (browserIsOnline()) await this.hydrateAndDrain();
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

  private reportError(error: unknown): void {
    if (this.stopped) return;
    this.publish({ hasError: true });
    const message = error instanceof Error ? error.message : String(error);
    console.warn('Sync engine request failed.', message);
  }

  private clearError(): void {
    if (this.state.hasError) this.publish({ hasError: false });
  }

  private startRealtime(): void {
    const householdFilter = `household_id=eq.${this.householdId}`;
    this.channel = supabase
      .channel(`household-sync:${this.householdId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transactions',
          filter: householdFilter,
        },
        (payload) => {
          void this.handleRealtimeChange('transactions', payload.eventType, payload).catch(
            (error) => this.reportError(error),
          );
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'budgets',
          filter: householdFilter,
        },
        (payload) => {
          void this.handleRealtimeChange('budgets', payload.eventType, payload).catch((error) =>
            this.reportError(error),
          );
        },
      )
      .subscribe((status) => {
        if (this.stopped) return;
        if (status === 'SUBSCRIBED') {
          this.publish({ realtimeConnected: true });
          // A successful rejoin resolves a transient channel error; retained
          // failed queue entries still keep the status at needs attention.
          this.clearError();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          this.publish({ realtimeConnected: false });
          this.reportError(new Error(`Realtime channel ${status.toLowerCase()}`));
        } else if (status === 'CLOSED') {
          this.publish({ realtimeConnected: false });
        }
      });
  }

  private async hydrateAndDrain(): Promise<void> {
    if (this.stopped || !browserIsOnline()) return;
    await this.hydrate();
    if (!this.stopped && browserIsOnline()) await this.drain();
  }

  private async hydrate(): Promise<void> {
    if (this.stopped || !browserIsOnline()) return;
    this.publish({ hydrating: true });

    try {
      const [transactionResult, budgetResult] = await Promise.all([
        supabase
          .from('transactions')
          .select(TRANSACTION_COLUMNS)
          .eq('household_id', this.householdId),
        supabase
          .from('budgets')
          .select(BUDGET_COLUMNS)
          .eq('household_id', this.householdId)
          .maybeSingle(),
      ]);
      if (transactionResult.error) throw transactionResult.error;
      if (budgetResult.error) throw budgetResult.error;
      if (this.stopped) return;

      const remoteTransactions = (transactionResult.data ?? [])
        .map((row) => toTransaction(row as RemoteRecord, this.householdId))
        .filter((row): row is Transaction => row !== null);
      const remoteBudget = budgetResult.data
        ? toBudget(budgetResult.data as RemoteRecord, this.householdId)
        : null;

      await db.transaction('rw', db.transactions, db.budgets, db.pendingChanges, async () => {
        const localTransactions = await db.transactions
          .where('household_id')
          .equals(this.householdId)
          .toArray();
        const localBudget = await db.budgets.where('household_id').equals(this.householdId).first();
        const pending = await db.pendingChanges
          .where('household_id')
          .equals(this.householdId)
          .filter((change) => change.status === 'pending' || change.status === 'failed')
          .toArray();
        const localById = new Map(localTransactions.map((row) => [row.id, row]));
        const pendingByRecord = groupedPendingChanges(pending);

        for (const remote of remoteTransactions) {
          const local = localById.get(remote.id);
          const rowPending = pendingByRecord.get(`transactions:${remote.id}`) ?? [];
          if (shouldApplyRemote(remote.updated_at, local?.updated_at ?? null, rowPending)) {
            await db.transactions.put(remote);
          }
        }

        if (remoteBudget) {
          const budgetPending = pending.filter((change) => change.table === 'budgets');
          if (
            shouldApplyRemote(
              remoteBudget.updated_at,
              localBudget?.updated_at ?? null,
              budgetPending,
            )
          ) {
            if (localBudget && localBudget.id !== remoteBudget.id) {
              await db.budgets.delete(localBudget.id);
            }
            await db.budgets.put(remoteBudget);
          }
        }
      });
      this.clearError();
    } catch (error: unknown) {
      this.reportError(error);
    } finally {
      if (!this.stopped) this.publish({ hydrating: false });
    }
  }

  private async drain(): Promise<void> {
    if (this.stopped || !browserIsOnline()) return;
    this.drainRequested = true;
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

    let failed = false;
    for (const change of changes) {
      if (this.stopped || !browserIsOnline()) break;
      if (!isRetryEligible(change)) continue;
      try {
        // Keep the queue row until the remote call succeeds. A later edit gets
        // its own row, so retrying this failed entry cannot hide newer data.
        if (change.status === 'failed') {
          await db.pendingChanges.update(change.client_id, { status: 'pending' });
        }
        await this.pushChange(change);
        await db.pendingChanges.update(change.client_id, { status: 'synced' });
      } catch (error: unknown) {
        failed = true;
        await db.pendingChanges.update(change.client_id, {
          status: 'failed',
          attempts: change.attempts + 1,
          last_attempt_at: new Date().toISOString(),
        });
        this.reportError(error);
      }
    }

    if (!failed && browserIsOnline()) this.clearError();
  }

  private async pushChange(change: PendingChange): Promise<void> {
    if (change.household_id !== this.householdId) {
      throw new Error('Queued sync change is outside the active household');
    }

    const payload = payloadObject(change.payload);
    if (payload.household_id !== this.householdId) {
      throw new Error('Queued sync payload is outside the active household');
    }

    if (change.table === 'transactions') {
      const transaction = toTransaction(payload, this.householdId);
      if (!transaction) throw new Error('Queued transaction payload is invalid');
      const remote = await this.fetchRemoteTransaction(change.record_id);
      if (remote && compareUpdatedAt(remote.updated_at, transaction.updated_at) > 0) {
        await this.mergeRemoteTransaction(remote);
        return;
      }

      if (change.op === 'delete' && !asString(payload.client_id)) {
        const { error } = await supabase
          .from('transactions')
          .delete()
          .eq('household_id', this.householdId)
          .eq('id', change.record_id);
        if (error) throw error;
        return;
      }

      const { error } = await supabase
        .from('transactions')
        .upsert(payload, { onConflict: 'client_id' });
      if (error) throw error;
      const storedTransaction = await this.fetchRemoteTransaction(transaction.id);
      if (storedTransaction) await this.mergeRemoteTransaction(storedTransaction);
      return;
    }

    const budget = toBudget(payload, this.householdId);
    if (!budget) throw new Error('Queued budget payload is invalid');
    const remote = await this.fetchRemoteBudget();
    if (remote && compareUpdatedAt(remote.updated_at, budget.updated_at) > 0) {
      await this.mergeRemoteBudget(remote);
      return;
    }

    if (change.op === 'delete') {
      const { error } = await supabase
        .from('budgets')
        .delete()
        .eq('household_id', this.householdId)
        .eq('id', change.record_id);
      if (error) throw error;
      return;
    }

    // household_id is the server's one-row budget key; local ids may differ
    // after a cold start, so never use the local budget id as the conflict key.
    const { error } = await supabase
      .from('budgets')
      .upsert(payload, { onConflict: 'household_id' });
    if (error) throw error;
    const storedBudget = await this.fetchRemoteBudget();
    if (storedBudget) await this.mergeRemoteBudget(storedBudget);
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

  private async fetchRemoteBudget(): Promise<Budget | null> {
    const { data, error } = await supabase
      .from('budgets')
      .select(BUDGET_COLUMNS)
      .eq('household_id', this.householdId)
      .maybeSingle();
    if (error) throw error;
    return data ? toBudget(data as RemoteRecord, this.householdId) : null;
  }

  private async mergeRemoteTransaction(remote: Transaction): Promise<void> {
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
      if (shouldApplyRemote(remote.updated_at, local?.updated_at ?? null, pending)) {
        await db.transactions.put(remote);
      }
    });
  }

  private async mergeRemoteBudget(remote: Budget): Promise<void> {
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
      if (shouldApplyRemote(remote.updated_at, local?.updated_at ?? null, pending)) {
        if (local && local.id !== remote.id) await db.budgets.delete(local.id);
        await db.budgets.put(remote);
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
    if (asString(row.household_id) !== this.householdId) return;

    if (event === 'DELETE') {
      await this.applyRemoteDelete(table, row);
      return;
    }

    if (table === 'transactions') {
      const remote = toTransaction(row, this.householdId);
      if (remote) await this.mergeRemoteTransaction(remote);
    } else {
      const remote = toBudget(row, this.householdId);
      if (remote) await this.mergeRemoteBudget(remote);
    }
  }

  private async applyRemoteDelete(table: SyncTable, row: RemoteRecord): Promise<void> {
    const recordId = asString(row.id);
    if (!recordId) return;
    const remoteUpdatedAt = asString(row.updated_at);

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
        if (
          local &&
          !pendingProtectsRemote(pending, remoteUpdatedAt) &&
          // A DELETE carries the row's last version timestamp rather than a
          // new one, so equality is still an authoritative server deletion.
          (remoteUpdatedAt === null || compareUpdatedAt(remoteUpdatedAt, local.updated_at) >= 0)
        ) {
          await db.transactions.delete(recordId);
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
      if (
        local &&
        !pendingProtectsRemote(pending, remoteUpdatedAt) &&
        // A DELETE carries the row's last version timestamp rather than a
        // new one, so equality is still an authoritative server deletion.
        (remoteUpdatedAt === null || compareUpdatedAt(remoteUpdatedAt, local.updated_at) >= 0)
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
