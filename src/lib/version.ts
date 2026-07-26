/**
 * A server conflict version consists of the Postgres timestamp and the writer
 * UUID. Postgres timestamps retain microseconds; JavaScript Date only retains
 * milliseconds, so comparisons must not go through Date.parse alone.
 */
export interface VersionStamp {
  updated_at: string | null;
  updated_by: string | null;
}

function compareText(left: string | null, right: string | null): number {
  const leftText = left ?? '';
  const rightText = right ?? '';
  if (leftText === rightText) return 0;
  return leftText < rightText ? -1 : 1;
}

/** Convert an ISO/Postgres timestamp to integer microseconds since Unix epoch. */
function timestampMicros(value: string): bigint | null {
  // PostgreSQL/ISO clients commonly use +HH:MM, while a few serializers use
  // the equivalent short +HH form. Normalize the latter for Date.parse.
  const parseableValue = value.replace(/([+-]\d{2})$/, '$1:00');
  const millis = Date.parse(parseableValue);
  if (!Number.isFinite(millis)) return null;

  // Date.parse intentionally truncates fractional seconds after milliseconds.
  // Recover the remaining three digits so values such as .123456 and .123457
  // remain distinguishable. Postgres emits at most six fractional digits.
  const fraction = value.match(/\.(\d+)(?:Z|[+-]\d{2}(?::?\d{2})?)$/)?.[1];
  if (!fraction) return BigInt(millis) * 1000n;

  const milliseconds = Number(fraction.slice(0, 3).padEnd(3, '0'));
  const microseconds = Number(fraction.slice(0, 6).padEnd(6, '0'));
  return BigInt(millis) * 1000n + BigInt(microseconds - milliseconds * 1000);
}

/**
 * Compare ISO timestamps while preserving Postgres microseconds and treating
 * equivalent UTC offsets as equal. Invalid values fall back to deterministic
 * lexical ordering rather than silently becoming equal.
 */
export function compareUpdatedAt(left: string | null, right: string | null): number {
  if (!left && !right) return 0;
  if (!left) return -1;
  if (!right) return 1;

  const leftMicros = timestampMicros(left);
  const rightMicros = timestampMicros(right);
  if (leftMicros !== null && rightMicros !== null) {
    if (leftMicros === rightMicros) return 0;
    return leftMicros > rightMicros ? 1 : -1;
  }
  return compareText(left, right);
}

/** Compare the full server/client conflict version. */
export function compareVersions(left: VersionStamp, right: VersionStamp): number {
  const timestampComparison = compareUpdatedAt(left.updated_at, right.updated_at);
  return timestampComparison || compareText(left.updated_by, right.updated_by);
}

let lastLocalTimestampMicros: bigint | null = null;

/**
 * Observe a remote timestamp so a local edit cannot be generated behind a row
 * that came from a clock-ahead partner/device.
 */
export function observeUpdatedAt(updatedAt: string | null): void {
  const observed = updatedAt ? timestampMicros(updatedAt) : null;
  if (
    observed !== null &&
    (lastLocalTimestampMicros === null || observed > lastLocalTimestampMicros)
  ) {
    lastLocalTimestampMicros = observed;
  }
}

/**
 * Generate a UTC timestamp with six fractional digits that is monotonic in this
 * browser tab. A floor may be supplied from the current local/remote row.
 */
export function nextLocalUpdatedAt(now = new Date(), floor: string | null = null): string {
  const nowMicros = BigInt(now.getTime()) * 1000n;
  const floorMicros = floor ? timestampMicros(floor) : null;
  let next = nowMicros;
  if (floorMicros !== null && floorMicros > next) next = floorMicros;
  if (lastLocalTimestampMicros !== null && lastLocalTimestampMicros >= next) {
    next = lastLocalTimestampMicros + 1n;
  }
  lastLocalTimestampMicros = next;

  const milliseconds = next / 1000n;
  const remainder = next % 1000n;
  const iso = new Date(Number(milliseconds)).toISOString();
  return `${iso.slice(0, -1)}${remainder.toString().padStart(3, '0')}Z`;
}
