import { useEffect, useState } from 'react';
import { AuthProvider } from './lib/auth';
import { useAuth } from './lib/use-auth';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Join from './pages/Join';
import Main from './pages/Main';
import { normalizeInviteCode } from './lib/household';
import { Alert, AlertDescription } from './components/ui/alert';
import { Button } from './components/ui/button';
import { Skeleton } from './components/ui/skeleton';
import { X } from 'lucide-react';

type AuthView = 'login' | 'signup';
type Route = 'auth' | 'join' | 'app';

/** Read (and normalise) the `?invite=` code from the URL once on load. */
function readInviteParam(): string | null {
  const raw = new URLSearchParams(window.location.search).get('invite');
  return raw ? normalizeInviteCode(raw) : null;
}

function Root() {
  const {
    loading,
    session,
    user,
    householdId,
    membershipLoading,
    pendingSetup,
    authError,
    clearAuthError,
    signOut,
  } = useAuth();

  const [inviteParam] = useState<string | null>(() => readInviteParam());
  const [authView, setAuthView] = useState<AuthView>(() => (inviteParam ? 'signup' : 'login'));
  const metadataInviteCode = user?.user_metadata?.pending_invite_code;
  const inviteCode =
    inviteParam ??
    (typeof metadataInviteCode === 'string' && metadataInviteCode.trim()
      ? normalizeInviteCode(metadataInviteCode)
      : null);

  // Route is sticky during pendingSetup / membership resolution so an in-flight
  // signup or join form stays mounted (showing its own submitting state)
  // instead of flashing the next route before household setup completes.
  const [route, setRoute] = useState<Route>(() =>
    !session ? 'auth' : !householdId ? 'join' : 'app',
  );

  useEffect(() => {
    if (pendingSetup) return;
    if (loading) return;
    if (session && membershipLoading) return;
    if (!session) setRoute('auth');
    else if (!householdId) setRoute('join');
    else setRoute('app');
  }, [session, householdId, pendingSetup, loading, membershipLoading]);

  // Strip the invite param from the URL once consumed (avoid stale prefills
  // on refresh), keeping it only in component state.
  useEffect(() => {
    if (inviteCode && window.history.replaceState) {
      const url = new URL(window.location.href);
      url.searchParams.delete('invite');
      window.history.replaceState({}, '', url.toString());
    }
  }, [inviteCode]);

  if (loading) {
    return (
      <div className="loading-screen" role="status" aria-busy="true">
        <div className="loading-state">
          <Skeleton className="loading-mark" />
          <Skeleton className="loading-line" />
          <p>Loading your shared budget...</p>
        </div>
      </div>
    );
  }

  // While membership is resolving for a signed-in user with no household yet,
  // show a neutral loading state rather than briefly flashing the Join screen.
  const resolvingMembership = !!session && membershipLoading && !householdId && !pendingSetup;
  if (resolvingMembership) {
    return (
      <div className="loading-screen" role="status" aria-busy="true">
        <div className="loading-state">
          <Skeleton className="loading-mark" />
          <Skeleton className="loading-line" />
          <p>Loading your household...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-root">
      {authError && (
        <Alert variant="destructive" className="error-banner">
          <AlertDescription>{authError}</AlertDescription>
          <Button
            variant="ghost"
            size="icon"
            className="error-banner-close"
            onClick={clearAuthError}
            aria-label="Dismiss"
          >
            <X aria-hidden="true" />
          </Button>
        </Alert>
      )}

      {route === 'auth' &&
        (authView === 'login' ? (
          <Login onSwitchToSignup={() => setAuthView('signup')} />
        ) : (
          <Signup initialInviteCode={inviteCode} onSwitchToLogin={() => setAuthView('login')} />
        ))}

      {route === 'join' && <Join initialInviteCode={inviteCode} />}

      {route === 'app' && <Main onSignOut={signOut} />}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Root />
    </AuthProvider>
  );
}
