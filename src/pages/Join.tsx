import { useState } from 'react';
import { useAuth } from '../lib/use-auth';
import {
  clearPendingInviteCode,
  createHouseholdForUser,
  joinHouseholdByCode,
  normalizeInviteCode,
  readPendingInviteCode,
} from '../lib/household';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Field, FieldLabel } from '../components/ui/field';
import { Input } from '../components/ui/input';

interface JoinProps {
  /** Invite code carried from the `?invite=` URL param, prefilled into the form. */
  initialInviteCode: string | null;
}

export default function Join({ initialInviteCode }: JoinProps) {
  const { user, refreshMembership, setPendingSetup, setAuthError, clearAuthError } = useAuth();
  const [inviteCode, setInviteCode] = useState(initialInviteCode ?? readPendingInviteCode());
  const [displayName, setDisplayName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<'join' | 'create'>(initialInviteCode ? 'join' : 'join');

  async function handleJoin(event: React.FormEvent) {
    event.preventDefault();
    if (!user) return;
    setSubmitting(true);
    setPendingSetup(true);
    clearAuthError();
    try {
      await joinHouseholdByCode(user.id, inviteCode, displayName);
      clearPendingInviteCode();
      await refreshMembership();
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
      setPendingSetup(false);
    }
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!user) return;
    setSubmitting(true);
    setPendingSetup(true);
    clearAuthError();
    try {
      await createHouseholdForUser(user.id, displayName);
      clearPendingInviteCode();
      await refreshMembership();
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
      setPendingSetup(false);
    }
  }

  return (
    <main className="auth-screen">
      <Card className="auth-card">
        <div className="auth-brand" aria-hidden="true">
          <span className="auth-brand-mark">CS</span>
          <span>One shared place for both of you</span>
        </div>
        <form className="auth-form" onSubmit={mode === 'join' ? handleJoin : handleCreate}>
          <h1 className="auth-title">Almost there</h1>
          <p className="auth-subtitle">
            {mode === 'join'
              ? 'Enter your partner’s invite code to share a household'
              : 'Start a new household for you and your partner'}
          </p>

      {mode === 'join' && (
        <Field>
          <FieldLabel htmlFor="join-invite-code">Invite code</FieldLabel>
          <Input
            id="join-invite-code"
            type="text"
            required
            value={inviteCode}
            onChange={(e) => setInviteCode(normalizeInviteCode(e.target.value))}
            placeholder="e.g. AB3K9XYZ"
            disabled={submitting}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
          />
        </Field>
      )}

      <Field>
        <FieldLabel htmlFor="join-name">Your name</FieldLabel>
        <Input
          id="join-name"
          type="text"
          autoComplete="nickname"
          placeholder="e.g. Partner"
          required
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          disabled={submitting}
        />
      </Field>

      <Button className="w-full" type="submit" disabled={submitting}>
        {submitting
          ? mode === 'join'
            ? 'Joining…'
            : 'Creating…'
          : mode === 'join'
            ? 'Join household'
            : 'Create household'}
      </Button>

      {mode === 'join' ? (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="self-center px-0"
          onClick={() => setMode('create')}
          disabled={submitting}
        >
          Don’t have a code? Start a new household
        </Button>
      ) : (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="self-center px-0"
          onClick={() => setMode('join')}
          disabled={submitting}
        >
          Have an invite code? Join instead
        </Button>
      )}
        </form>
      </Card>
    </main>
  );
}
