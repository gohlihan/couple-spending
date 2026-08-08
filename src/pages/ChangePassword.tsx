import { useState, type FormEvent } from 'react';
import { validatePasswordChange } from '../lib/password';
import { supabase } from '../lib/supabase';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Field, FieldLabel } from '../components/ui/field';
import { Input } from '../components/ui/input';

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
    <Card as="section" className="account-form-card" aria-labelledby="change-password-title">
      <h2 id="change-password-title">Change password</h2>
      <p className="muted">Use a new password with at least 6 characters.</p>
      <form className="transaction-form" onSubmit={submit}>
        <Field>
          <FieldLabel htmlFor="new-password">New password</FieldLabel>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            minLength={6}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={submitting}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="confirm-password">Confirm new password</FieldLabel>
          <Input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            minLength={6}
            required
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            disabled={submitting}
          />
        </Field>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {message && (
          <Alert variant="success" role="status">
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}
        <Button className="w-full" type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save new password'}
        </Button>
      </form>
    </Card>
  );
}
