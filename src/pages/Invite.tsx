import { useEffect, useState } from 'react';
import { inviteSharePath } from '../lib/household';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/use-auth';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Skeleton } from '../components/ui/skeleton';

/**
 * Shows the household's invite code and a shareable link so the first user can
 * invite their partner. The code is read from the auth context (loaded with
 * membership); if missing it's fetched directly from the household.
 */
export default function Invite() {
  const { householdId, inviteCode } = useAuth();
  const [code, setCode] = useState<string | null>(inviteCode);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

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
    setCopyError(null);
    setCopied(false);
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable.');
      await navigator.clipboard.writeText(text);
    } catch {
      try {
        const fallback = document.createElement('textarea');
        fallback.value = text;
        fallback.setAttribute('readonly', '');
        fallback.setAttribute('aria-hidden', 'true');
        fallback.style.position = 'fixed';
        fallback.style.opacity = '0';
        try {
          document.body.appendChild(fallback);
          fallback.select();
          fallback.setSelectionRange(0, fallback.value.length);
          const copiedWithFallback = document.execCommand('copy');
          if (!copiedWithFallback) throw new Error('Copy command failed.');
        } finally {
          fallback.remove();
        }
      } catch {
        setCopyError('Could not copy automatically. Select the code or link and copy it manually.');
        return;
      }
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Card as="section" className="invite-card">
      <h2>Invite your partner</h2>
      <p className="muted">
        Share this code or link with your partner. Once they join, you’ll share one budget.
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

          {copied && (
            <Alert variant="success" className="copied" role="status">
              <AlertDescription>Copied to clipboard.</AlertDescription>
            </Alert>
          )}
          {copyError && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{copyError}</AlertDescription>
            </Alert>
          )}
        </>
      ) : (
        <div className="invite-loading" role="status" aria-busy="true">
          <Skeleton className="invite-code-skeleton" />
          <p className="muted">Loading invite code...</p>
        </div>
      )}
    </Card>
  );
}
