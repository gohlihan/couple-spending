import { useState, type FormEvent } from 'react';
import { validatePasswordChange } from '../lib/password';
import { supabase } from '../lib/supabase';

export default function ChangePassword() {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = validatePasswordChange(password, confirmation);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setPassword('');
      setConfirmation('');
      setMessage('Password changed successfully.');
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Could not change password.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="account-form-card" aria-labelledby="change-password-title">
      <h2 id="change-password-title">Change password</h2>
      <p className="muted">Use a new password with at least 6 characters.</p>
      <form className="transaction-form" onSubmit={submit}>
        <label className="field" htmlFor="new-password">
          <span className="field-label">New password</span>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            minLength={6}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={submitting}
          />
        </label>
        <label className="field" htmlFor="confirm-password">
          <span className="field-label">Confirm new password</span>
          <input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            minLength={6}
            required
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            disabled={submitting}
          />
        </label>
        {error && (
          <p className="form-message form-error" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="form-message form-success" role="status">
            {message}
          </p>
        )}
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save new password'}
        </button>
      </form>
    </section>
  );
}
