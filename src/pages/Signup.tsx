import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { friendlyError } from '../lib/errors';
import { useAuth } from '../lib/use-auth';
import {
  createHouseholdForUser,
  clearPendingInviteCode,
  joinHouseholdByCode,
  normalizeInviteCode,
  readPendingInviteCode,
  rememberPendingInviteCode,
} from '../lib/household';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Field, FieldLabel } from '../components/ui/field';
import { Input } from '../components/ui/input';

interface SignupProps {
  /** Invite code carried from the `?invite=` URL param. When present, signup
   * joins the existing household instead of creating a new one, so the second
   * user shares the first user's household_id (issue #3 acceptance). */
  initialInviteCode: string | null;
  onSwitchToLogin: () => void;
}

export default function Signup({ initialInviteCode, onSwitchToLogin }: SignupProps) {
  const { refreshMembership, setPendingSetup, setAuthError, clearAuthError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [inviteCode, setInviteCode] = useState(() => {
    const code = initialInviteCode ?? readPendingInviteCode();
    rememberPendingInviteCode(code);
    return code;
  });
  const [submitting, setSubmitting] = useState(false);

  const normalizedInviteCode = normalizeInviteCode(inviteCode);
  const joining = normalizedInviteCode.length > 0;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setPendingSetup(true);
    clearAuthError();
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            pending_invite_code: normalizedInviteCode || null,
          },
        },
      });
      if (error) throw error;
      if (!data.user) throw new Error('Sign-up did not return a user.');

      // If email confirmation is enabled (mailer_autoconfirm off), no session is
      // established yet — the user must confirm then log in. Membership setup
      // happens after they log in (routed to the Join screen).
      if (!data.session) {
        setAuthError(
          joining
            ? 'Account created. Check your email to confirm, then log in to join the household.'
            : 'Account created. Check your email to confirm, then log in.',
        );
        return;
      }

      // signUp emits SIGNED_IN before the browser auth store is always ready
      // for the immediately-following RLS bootstrap writes. Re-assert the
      // returned session so auth.uid() is present on household creation.
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });
      if (sessionError) throw sessionError;

      if (normalizedInviteCode) {
        await joinHouseholdByCode(data.user.id, normalizedInviteCode, displayName);
      } else {
        await createHouseholdForUser(data.user.id, displayName);
      }
      clearPendingInviteCode();
      await refreshMembership(data.user.id);
    } catch (err) {
      setAuthError(friendlyError(err, 'Could not create your account.'));
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
          <span>Build your shared money space</span>
        </div>
        <form className="auth-form" onSubmit={handleSubmit}>
          <h1 className="auth-title">Couple Spending</h1>
          <p className="auth-subtitle">
            {joining ? 'Create your account to join the household' : 'Create your account'}
          </p>

      <Field>
        <FieldLabel htmlFor="signup-email">Email</FieldLabel>
        <Input
          id="signup-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={submitting}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="signup-password">Password</FieldLabel>
        <Input
          id="signup-password"
          type="password"
          autoComplete="new-password"
          minLength={6}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={submitting}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="signup-invite-code">
          Invite code <span className="optional">(optional)</span>
        </FieldLabel>
        <Input
          id="signup-invite-code"
          type="text"
          autoComplete="off"
          value={inviteCode}
          onChange={(event) => {
            const nextCode = normalizeInviteCode(event.target.value);
            setInviteCode(nextCode);
            rememberPendingInviteCode(nextCode);
          }}
          placeholder="e.g. AB3K9XYZ"
          disabled={submitting}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="signup-name">Your name</FieldLabel>
        <Input
          id="signup-name"
          type="text"
          autoComplete="nickname"
          placeholder="e.g. Han"
          required
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          disabled={submitting}
        />
      </Field>

      <Button className="w-full" type="submit" disabled={submitting}>
        {submitting ? 'Creating account…' : 'Sign up'}
      </Button>

      <Button
        type="button"
        variant="link"
        size="sm"
        className="self-center px-0"
        onClick={onSwitchToLogin}
        disabled={submitting}
      >
        Already have an account? Log in
      </Button>
        </form>
      </Card>
    </main>
  );
}
