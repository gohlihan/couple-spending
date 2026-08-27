/**
 * Map thrown errors to user-facing copy. Network-level failures arrive as raw
 * browser messages ("Failed to fetch") that mean nothing to most people, so
 * they get a friendly offline hint; everything else passes through unchanged
 * (Supabase auth/DB errors are already written for humans).
 */
const NETWORK_HINTS = [
  'failed to fetch',
  'fetch failed',
  'load failed',
  'networkerror',
  'network error',
  'internet disconnected',
  'timed out',
];

export function friendlyError(error: unknown, fallback: string): string {
  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const lowered = message.toLowerCase();
  if (NETWORK_HINTS.some((hint) => lowered.includes(hint))) {
    return 'Can’t reach the server. Check your connection and try again.';
  }
  return message || fallback;
}
