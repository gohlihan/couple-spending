export function validatePasswordChange(password: string, confirmation: string): string | null {
  if (password.length < 6) return 'Password must be at least 6 characters.';
  if (password !== confirmation) return 'Passwords do not match.';
  return null;
}
