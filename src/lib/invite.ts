const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;
export const PENDING_INVITE_STORAGE_KEY = 'couple-spending.pending-invite-code';

export function normalizeInviteCode(code: string): string {
  return code.trim().toUpperCase();
}

export function inviteSharePath(baseUrl: string, inviteCode: string): string {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${base}?invite=${encodeURIComponent(normalizeInviteCode(inviteCode))}`;
}

export function readPendingInviteCode(): string {
  if (typeof sessionStorage === 'undefined') return '';
  return normalizeInviteCode(sessionStorage.getItem(PENDING_INVITE_STORAGE_KEY) ?? '');
}

export function rememberPendingInviteCode(code: string): void {
  if (typeof sessionStorage === 'undefined') return;
  const normalized = normalizeInviteCode(code);
  if (normalized) sessionStorage.setItem(PENDING_INVITE_STORAGE_KEY, normalized);
  else sessionStorage.removeItem(PENDING_INVITE_STORAGE_KEY);
}

export function clearPendingInviteCode(): void {
  if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(PENDING_INVITE_STORAGE_KEY);
}

export function generateInviteCode(length = CODE_LENGTH): string {
  const values = new Uint32Array(length);
  crypto.getRandomValues(values);
  let code = '';
  for (let i = 0; i < length; i++) {
    code += CODE_ALPHABET[values[i] % CODE_ALPHABET.length];
  }
  return code;
}
