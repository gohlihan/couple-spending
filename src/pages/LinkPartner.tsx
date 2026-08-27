import { useState, type FormEvent } from 'react';
import { linkHouseholdByCode, normalizeInviteCode } from '../lib/household';
import { friendlyError } from '../lib/errors';
import { useAuth } from '../lib/use-auth';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Field, FieldLabel } from '../components/ui/field';
import { Input } from '../components/ui/input';

export default function LinkPartner() {
  const { refreshMembership, setPendingSetup, clearAuthError } = useAuth();
  const [inviteCode, setInviteCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    setError(null);
    clearAuthError();
    setPendingSetup(true);
    try {
      await linkHouseholdByCode(inviteCode);
      await refreshMembership();
      setInviteCode('');
      setMessage('Household linked. Your partner’s shared data is now available.');
    } catch (linkError) {
      setError(friendlyError(linkError, 'Could not link household.'));
    } finally {
      setPendingSetup(false);
      setSubmitting(false);
    }
  }

  return (
    <Card as="section" className="account-form-card" aria-labelledby="link-partner-title">
      <h2 id="link-partner-title">Link with partner</h2>
      <p className="muted">
        Enter your partner’s invite code. This is available only when your current household has no
        spending or plans yet.
      </p>
      <form className="transaction-form" onSubmit={submit}>
        <Field>
          <FieldLabel htmlFor="partner-invite-code">Partner invite code</FieldLabel>
          <Input
            id="partner-invite-code"
            type="text"
            required
            value={inviteCode}
            onChange={(event) => setInviteCode(normalizeInviteCode(event.target.value))}
            placeholder="e.g. AB3K9XYZ"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
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
          {submitting ? 'Linking…' : 'Link household'}
        </Button>
      </form>
    </Card>
  );
}
