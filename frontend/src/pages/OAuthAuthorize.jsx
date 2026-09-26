import { useEffect, useMemo, useState } from 'react';
import { Check, CircleAlert, ExternalLink, ShieldCheck } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import EmptyState from '../components/EmptyState.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import UserAvatar from '../components/UserAvatar.jsx';
import { t } from '../lib/i18n.js';
import { isSafeOAuthRedirectTarget } from '../lib/oauthRedirect.js';
import { storePendingOAuthRequest } from '../lib/postLoginNavigation.js';
import { getUserDisplayName } from '../lib/users.js';

const scopeLabels = {
  'groups:read': 'oauthAuthorize.readGroups',
  'expenses:read': 'oauthAuthorize.readExpenses',
  'settlements:read': 'oauthAuthorize.readSettlements',
  'expenses:write': 'oauthAuthorize.writeExpenses',
};

async function sendOAuthRequest(path, body, token, signal) {
  const response = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    signal,
  });
  let data = {};
  try {
    data = await response.json();
  } catch {
    // A localized fallback is shown below when the response has no JSON body.
  }
  return { response, data };
}

async function loadCurrentUser(token, signal) {
  const response = await fetch('/api/auth/me', {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });
  let data = {};
  try {
    data = await response.json();
  } catch {
    // A localized fallback is shown below when the response has no JSON body.
  }
  return { response, data };
}

function redirectIfPossible(data, registeredTarget) {
  if (
    data?.redirect_uri !== registeredTarget
    || !isSafeOAuthRedirectTarget(data?.redirect_to, registeredTarget)
  ) {
    return false;
  }
  window.location.assign(data.redirect_to);
  return true;
}

export default function OAuthAuthorize() {
  const location = useLocation();
  const navigate = useNavigate();
  const request = useMemo(
    () => Object.fromEntries(new URLSearchParams(location.search)),
    [location.search],
  );
  const [validation, setValidation] = useState(null);
  const [user, setUser] = useState(null);
  const [allowWrite, setAllowWrite] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [clientLogoFailed, setClientLogoFailed] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      storePendingOAuthRequest(location.search);
      navigate('/login', { replace: true });
      return undefined;
    }

    const controller = new AbortController();
    setLoading(true);
    setError('');

    Promise.all([
      sendOAuthRequest('/api/oauth/authorize/validate', request, token, controller.signal),
      loadCurrentUser(token, controller.signal),
    ]).then(([validationResult, userResult]) => {
      if (validationResult.response.status === 401 || userResult.response.status === 401) {
        storePendingOAuthRequest(location.search);
        localStorage.removeItem('token');
        navigate('/login', { replace: true });
        return;
      }
      if (!validationResult.response.ok) {
        if (!redirectIfPossible(
          validationResult.data,
          request.redirect_uri,
        )) {
          setError(validationResult.data?.error_description || t('oauthAuthorize.invalidRequest'));
        }
        return;
      }
      if (!userResult.response.ok || !userResult.data?.user) {
        setError(t('oauthAuthorize.userLoadFailed'));
        return;
      }

      setValidation(validationResult.data);
      setUser(userResult.data.user);
      setAllowWrite(
        validationResult.data.existing_grant_scopes?.includes('expenses:write') || false,
      );
    }).catch((requestError) => {
      if (requestError.name !== 'AbortError') {
        setError(t('oauthAuthorize.loadFailed'));
      }
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });

    return () => controller.abort();
  }, [location.search, navigate, request]);

  const decide = async (approved) => {
    const token = localStorage.getItem('token');
    if (!token) {
      storePendingOAuthRequest(location.search);
      navigate('/login', { replace: true });
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const { response, data } = await sendOAuthRequest(
        '/api/oauth/authorize/decision',
        { ...request, approved, allow_write: allowWrite },
        token,
      );
      if (response.status === 401) {
        storePendingOAuthRequest(location.search);
        localStorage.removeItem('token');
        navigate('/login', { replace: true });
        return;
      }
      if (redirectIfPossible(data, validation?.redirect_uri)) return;
      setError(data?.error_description || t('oauthAuthorize.decisionFailed'));
    } catch {
      setError(t('oauthAuthorize.decisionFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--app-bg)] p-4">
        <p className="text-sm text-[var(--text-secondary)]">{t('oauthAuthorize.loading')}</p>
      </main>
    );
  }

  if (!validation || !user) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl items-center px-4 py-12">
        <EmptyState
          icon={CircleAlert}
          title={t('oauthAuthorize.errorTitle')}
          description={error || t('oauthAuthorize.invalidRequest')}
          action={(
            <button type="button" className="btn-secondary" onClick={() => navigate('/')}>
              {t('oauthAuthorize.goHome')}
            </button>
          )}
        />
      </main>
    );
  }

  const clientName = validation.client?.name || t('oauthAuthorize.unknownClient');
  const trustHost = validation.client?.trust_host;
  const trustLabel = validation.client?.trust_source === 'client_metadata'
    ? 'oauthAuthorize.clientMetadataHost'
    : 'oauthAuthorize.redirectHost';
  const requestedScopes = validation.requested_scopes || [];
  const requestsWrite = requestedScopes.includes('expenses:write');

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--app-bg)] px-4 py-12">
      <section className="surface-card w-full max-w-lg space-y-6 p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[var(--app-surface-muted)]">
            {validation.client?.logo_uri && !clientLogoFailed ? (
              <img
                src={validation.client.logo_uri}
                alt={t('oauthAuthorize.clientLogoAlt', { client: clientName })}
                className="h-full w-full object-contain"
                referrerPolicy="no-referrer"
                onError={() => setClientLogoFailed(true)}
              />
            ) : (
              <ShieldCheck className="h-7 w-7 text-[var(--accent)]" />
            )}
          </div>
          <div className="min-w-0">
            <p className="section-eyebrow">{t('oauthAuthorize.eyebrow')}</p>
            <h1 className="m-0 break-words text-2xl font-semibold">
              {t('oauthAuthorize.title', { client: clientName })}
            </h1>
            <p className="mb-0 mt-2 flex items-center gap-1.5 text-sm font-semibold text-[var(--text-primary)]">
              <ExternalLink className="h-4 w-4 text-[var(--text-secondary)]" />
              {t(trustLabel, { host: trustHost })}
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--app-surface-muted)] p-4">
          <p className="m-0 text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
            {t('oauthAuthorize.loggedInAs')}
          </p>
          <div className="mt-3 flex items-center gap-3">
            <UserAvatar
              user={user}
              className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--app-surface-strong)]"
              initialsClassName="text-sm font-semibold"
            />
            <span className="font-semibold">{getUserDisplayName(user)}</span>
          </div>
        </div>

        <div>
          <h2 className="m-0 text-base font-semibold">{t('oauthAuthorize.permissionsTitle')}</h2>
          <p className="mb-0 mt-1 text-sm text-[var(--text-secondary)]">
            {t('oauthAuthorize.permissionsDescription')}
          </p>
          <ul className="mb-0 mt-4 space-y-3 p-0">
            {requestedScopes
              .filter((scope) => scope !== 'expenses:write')
              .map((scope) => (
                <li key={scope} className="flex list-none items-center gap-3 text-sm">
                  <Check className="h-4 w-4 shrink-0 text-[var(--success)]" />
                  {t(scopeLabels[scope] || 'oauthAuthorize.unknownPermission')}
                </li>
              ))}
          </ul>
        </div>

        {requestsWrite ? (
          <label className="flex items-start gap-3 rounded-lg border border-[var(--border-subtle)] p-4 text-sm font-medium">
            <input
              type="checkbox"
              className="mt-0.5 shrink-0"
              checked={allowWrite}
              onChange={(event) => setAllowWrite(event.target.checked)}
            />
            <span>{t('oauthAuthorize.allowWrite')}</span>
          </label>
        ) : null}

        <ErrorMessage message={error} className="m-0" />
        <div className="flex flex-col-reverse gap-3 sm:flex-row">
          <button
            type="button"
            className="btn-secondary flex-1"
            disabled={submitting}
            onClick={() => decide(false)}
          >
            {t('oauthAuthorize.deny')}
          </button>
          <button
            type="button"
            className="btn-primary flex-1"
            disabled={submitting}
            onClick={() => decide(true)}
          >
            {submitting ? t('oauthAuthorize.submitting') : t('oauthAuthorize.approve')}
          </button>
        </div>
      </section>
    </main>
  );
}
