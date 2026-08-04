import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Users } from 'lucide-react';
import { get, post } from '../api/client.js';
import { parseUser } from '../lib/session.js';
import { getGroupTheme } from '../lib/groupTheme.js';

export const PENDING_INVITE_TOKEN_KEY = 'pending_invite_token';

function getJoinButtonLabel(joining, hasPlaceholders) {
  if (joining) {
    return 'Går med…';
  }
  if (hasPlaceholders) {
    return 'Gå med som ny person';
  }
  return 'Gå med i gruppen';
}

export default function InvitePage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [inviteInfo, setInviteInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  const currentUser = parseUser();
  const isLoggedIn = Boolean(currentUser);

  useEffect(() => {
    document.title = 'Kvitt | Inbjudan';
    return () => { document.title = 'Kvitt'; };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/invite/${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (!active) return;
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Inbjudningslänken är ogiltig eller har gått ut.');
        }
        return res.json();
      })
      .then((data) => { if (active) setInviteInfo(data); })
      .catch((err) => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  const goToAuth = (path) => {
    sessionStorage.setItem(PENDING_INVITE_TOKEN_KEY, token);
    navigate(`${path}?${encodeURIComponent(token)}`);
  };

  const accept = async (placeholderId) => {
    setJoining(true);
    setError('');
    try {
      const result = await post(`/api/invite/${encodeURIComponent(token)}/accept`, {
        ...(placeholderId ? { placeholder_id: placeholderId } : {}),
      });
      navigate(`/groups/${result.slug}`);
    } catch (err) {
      setError(err.message);
      setJoining(false);
    }
  };

  const theme = inviteInfo?.group?.theme_color
    ? getGroupTheme(inviteInfo.group.theme_color)
    : getGroupTheme('fjord-teal');

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="surface-card w-full max-w-md space-y-4 p-8 text-center">
          <div className="skeleton mx-auto h-8 w-48 rounded-md" />
          <div className="skeleton mx-auto h-4 w-64 rounded-md" />
        </div>
      </div>
    );
  }

  if (error && !inviteInfo) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="surface-card w-full max-w-md space-y-4 p-8 text-center">
          <h1 className="text-xl font-semibold">Inbjudningslänken är ogiltig</h1>
          <p className="text-[var(--text-secondary)]">{error}</p>
          {isLoggedIn && (
            <button type="button" className="btn-primary w-full" onClick={() => navigate('/')}>
              Gå till startsidan
            </button>
          )}
          {!isLoggedIn && (
            <button type="button" className="btn-primary w-full" onClick={() => navigate('/login')}>
              Logga in
            </button>
          )}
        </div>
      </div>
    );
  }

  const { group, placeholders } = inviteInfo;
  const hasPlaceholders = placeholders && placeholders.length > 0;

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        {/* Group header */}
        <div
          className="surface-card overflow-hidden"
          style={{ '--group-color': theme.base, '--group-rgb': theme.rgb }}
        >
          <div className="h-2 w-full" style={{ background: theme.base }} />
          <div className="flex items-center gap-4 p-6">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white"
              style={{ background: theme.base }}
            >
              <Users className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">Du är inbjuden till</p>
              <h1 className="m-0 text-xl font-bold">{group.name}</h1>
            </div>
          </div>
        </div>

        {/* Not logged in */}
        {!isLoggedIn && (
          <div className="surface-card space-y-4 p-6">
            <p className="text-sm text-[var(--text-secondary)]">
              Du behöver ett konto för att gå med. Skapa ett nytt eller logga in med ett befintligt.
            </p>
            <button
              type="button"
              className="btn-primary w-full"
              onClick={() => goToAuth('/register')}
            >
              Skapa konto
            </button>
            <button
              type="button"
              className="btn-secondary w-full"
              onClick={() => goToAuth('/login')}
            >
              Logga in
            </button>
          </div>
        )}

        {/* Logged in */}
        {isLoggedIn && (
          <div className="surface-card space-y-5 p-6">
            {hasPlaceholders && (
              <>
                <div>
                  <h2 className="text-base font-semibold">Är du en av dessa?</h2>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">
                    Välj ditt namn om det redan finns i gruppen, så kopplas dina utgifter ihop.
                  </p>
                </div>
                <ul className="space-y-2">
                  {placeholders.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        disabled={joining}
                        className="flex w-full items-center gap-3 rounded-lg border border-[var(--border-subtle)] px-4 py-3 text-left transition hover:border-[var(--group-color,var(--border-subtle))] hover:bg-[var(--app-surface-muted)] disabled:opacity-50"
                        style={{ '--group-color': theme.base }}
                        onClick={() => accept(p.id)}
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--app-surface-muted)] text-xs font-semibold">
                          {(p.full_name || '?').slice(0, 2).toUpperCase()}
                        </span>
                        <span className="font-medium">{p.full_name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-[var(--border-subtle)]" />
                  <span className="text-xs text-[var(--text-muted)]">eller</span>
                  <div className="h-px flex-1 bg-[var(--border-subtle)]" />
                </div>
              </>
            )}

            <button
              type="button"
              disabled={joining}
              className={hasPlaceholders ? 'btn-secondary w-full' : 'btn-primary w-full'}
              onClick={() => accept(null)}
            >
                {getJoinButtonLabel(joining, hasPlaceholders)}
            </button>

            {error && <p className="text-sm text-red-500">{error}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
