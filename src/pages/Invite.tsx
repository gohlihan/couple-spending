import { useEffect, useState } from 'react';
import { inviteSharePath } from '../lib/household';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/use-auth';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';

/**
 * Shows the household's invite code and a shareable link so the first user can
 * invite their partner. The code is read from the auth context (loaded with
 * membership); if missing it's fetched directly from the household.
 */
export default function Invite() {
  const { householdId, inviteCode, displayName } = useAuth();
  const [code, setCode] = useState<string | null>(inviteCode);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    if (inviteCode) {
      setCode(inviteCode);
      return;
    }
    if (!householdId) return;
    supabase
      .from('households')
      .select('invite_code')
      .eq('id', householdId)
      .single()
      .then(({ data }) => {
        if (active && data) setCode(data.invite_code);
      });
    return () => {
      active = false;
    };
  }, [householdId, inviteCode]);

  const shareLink = code
    ? `${window.location.origin}${inviteSharePath(import.meta.env.BASE_URL, code)}`
    : null;

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard may be unavailable (e.g. non-secure context) — ignore
    }
  }

  return (
    <section className="invite-card">
      <h2>Invite your partner</h2>
      <p className="muted">
        Share this code or link with {displayName ?? 'your partner'}. Once they join, you’ll share
        one budget.
      </p>

      {code ? (
        <>
          <div className="invite-code-row">
            <code className="invite-code">{code}</code>
            <Button type="button" variant="outline" size="sm" onClick={() => copy(code)}>
              Copy code
            </Button>
          </div>

          {shareLink && (
            <div className="invite-link-row">
              <label className="sr-only" htmlFor="invite-share-link">
                Shareable invite link
              </label>
              <Input id="invite-share-link" readOnly value={shareLink} className="invite-link" />
              <Button type="button" variant="outline" size="sm" onClick={() => copy(shareLink)}>
                Copy link
              </Button>
            </div>
          )}

          {copied && <p className="copied">Copied!</p>}
        </>
      ) : (
        <p className="muted">Loading invite code…</p>
      )}
    </section>
  );
}
