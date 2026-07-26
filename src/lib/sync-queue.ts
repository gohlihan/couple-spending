import type { PendingChange } from './db';

export function queueChangeKey(change: PendingChange): string {
  return `${change.table}:${change.record_id}`;
}

function queueChangePrecedes(left: PendingChange, right: PendingChange): boolean {
  return (
    left.created_at.localeCompare(right.created_at) < 0 ||
    (left.created_at === right.created_at && left.client_id.localeCompare(right.client_id) < 0)
  );
}

/**
 * Returns whether a same-record queue entry still has to be delivered before
 * `change`. The drain marks completed/superseded IDs as resolved so a successful
 * earlier write no longer blocks a later edit in the same pass.
 */
export function hasUnresolvedEarlierChange(
  changes: readonly PendingChange[],
  change: PendingChange,
  resolvedIds: ReadonlySet<string> = new Set(),
): boolean {
  return changes.some(
    (candidate) =>
      candidate.client_id !== change.client_id &&
      queueChangeKey(candidate) === queueChangeKey(change) &&
      !resolvedIds.has(candidate.client_id) &&
      queueChangePrecedes(candidate, change),
  );
}
