export interface RealtimeDeleteInfo {
  recordId: string | null;
  householdId: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
  /** RLS-protected DELETE payloads may omit the scope or version fields. */
  requiresRefetch: boolean;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Extract the fields needed to safely reconcile a Postgres DELETE event.
 * Supabase may provide only the primary key for DELETEs on RLS-protected
 * tables, so callers must re-fetch when either the scope or version is absent.
 */
export function parseRealtimeDelete(row: Record<string, unknown>): RealtimeDeleteInfo {
  const householdId = asString(row.household_id);
  const updatedAt = asString(row.updated_at);
  return {
    recordId: asString(row.id),
    householdId,
    updatedAt,
    updatedBy: asString(row.updated_by),
    requiresRefetch:
      householdId === null || updatedAt === null || asString(row.updated_by) === null,
  };
}
