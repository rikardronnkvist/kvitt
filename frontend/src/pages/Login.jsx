import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ScanLine } from 'lucide-react';
import { get, post } from '../api/client.js';
import PasskeyButton from '../components/PasskeyButton.jsx';
import InviteQrScannerModal from '../components/InviteQrScannerModal.jsx';
import { usePasskeyAuth } from '../hooks/usePasskeyAuth.js';
import { formatPhoneNumber, getPhonePlaceholder, sanitizePhoneInput } from '../lib/phone.js';
import { useAppSettings } from '../hooks/useAppSettings.js';
import { applyThemePreference, getStoredThemePreference, getSystemTheme } from '../lib/theme.js';
import { PENDING_INVITE_TOKEN_KEY } from './InvitePage.jsx';
import { t } from '../lib/i18n.js';

const registerInitialState = { full_name: '', phone: '' };

function parseRegistrationToken(search) {
  const raw = search.startsWith('?') ? search.slice(1) : '';
  if (!raw) return '';

  if (!raw.includes('=')) {
    try {
      return decodeURIComponent(raw);
    } catch {
      return '';
    }
  }

  const params = new URLSearchParams(search);
  return params.get('token') || params.get('invite') || params.get('key') || '';
}

function navigateAfterLogin(navigate) {
  const pendingInvite = sessionStorage.getItem(PENDING_INVITE_TOKEN_KEY);
  if (pendingInvite) {
    sessionStorage.removeItem(PENDING_INVITE_TOKEN_KEY);
    navigate(`/invite/${pendingInvite}`);
    return;
  }
  navigate('/');
}

function useRegistrationAccess({ isRegisterMode, registrationToken, navigate }) {
  const [checkingRegistrationToken, setCheckingRegistrationToken] = useState(false);
  const [registrationTokenChecked, setRegistrationTokenChecked] = useState(false);
  const [registrationTokenValid, setRegistrationTokenValid] = useState(false);
  const hasRegistrationToken = registrationToken.trim().length > 0;

  useEffect(() => {
    if (!isRegisterMode) {
      return;
    }

    if (!hasRegistrationToken) {
      setRegistrationTokenChecked(true);
      setRegistrationTokenValid(false);
      return;
    }

    let active = true;
    setCheckingRegistrationToken(true);
    setRegistrationTokenChecked(false);
    setRegistrationTokenValid(false);

    get(`/api/auth/passkey/register-access?token=${encodeURIComponent(registrationToken)}`)
      .then((data) => {
        if (!active) return;
        setRegistrationTokenValid(Boolean(data.allowed));
      })
      .catch(() => {
        if (!active) return;
        setRegistrationTokenValid(false);
      })
      .finally(() => {
        if (active) {
          setCheckingRegistrationToken(false);
          setRegistrationTokenChecked(true);
        }
      });

    return () => {
      active = false;
    };
  }, [isRegisterMode, hasRegistrationToken, registrationToken]);

  useEffect(() => {
    if (!isRegisterMode || checkingRegistrationToken || !registrationTokenChecked) {
      return;
    }
    if (!hasRegistrationToken || !registrationTokenValid) {
      navigate('/login');
    }
  }, [checkingRegistrationToken, hasRegistrationToken, isRegisterMode, navigate, registrationTokenChecked, registrationTokenValid]);

  return {
    hasRegistrationToken,
    checkingRegistrationToken,
    registrationTokenChecked,
    registrationTokenValid,
  };
}

function useDevboxUsers({ isRegisterMode, setError }) {
  const [devboxUsers, setDevboxUsers] = useState([]);
  const [devboxAvailable, setDevboxAvailable] = useState(false);
  const [devboxLoading, setDevboxLoading] = useState(false);

  useEffect(() => {
    if (isRegisterMode) {
      return;
    }

    let active = true;
    setDevboxLoading(true);

    fetch('/api/auth/devbox/users')
      .then(async (response) => {
        if (!active) return;
        if (response.status === 404) {
          setDevboxAvailable(false);
          setDevboxUsers([]);
          return;
        }

        if (!response.ok) {
          let message = t('auth.loadDevUsersFailed');
          try {
            const data = await response.json();
            message = data.error || message;
          } catch {
            message = response.statusText || message;
          }
          throw new Error(message);
        }

        const data = await response.json();
        setDevboxUsers(Array.isArray(data.users) ? data.users : []);
        setDevboxAvailable(true);
      })
      .catch((requestError) => {
        if (!active) return;
        setError(requestError.message || t('auth.loadDevUsersFailed'));
        setDevboxAvailable(false);
        setDevboxUsers([]);
      })
      .finally(() => {
        if (active) {
          setDevboxLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [isRegisterMode, setError]);

  return { devboxUsers, devboxAvailable, devboxLoading };
}

function RegistrationNotice({ hasRegistrationToken, checkingRegistrationToken, hasValidRegistrationToken }) {
  if (!hasRegistrationToken) {
    return (
      <p className="m-0 rounded-lg border border-[var(--border-strong)] bg-[var(--app-surface-muted)] px-3 py-2 text-sm text-[var(--text-secondary)]">
        {t('auth.registerClosed')}
      </p>
    );
  }

  if (checkingRegistrationToken) {
    return (
      <p className="m-0 rounded-lg border border-[var(--border-strong)] bg-[var(--app-surface-muted)] px-3 py-2 text-sm text-[var(--text-secondary)]">
        {t('auth.registerLinkVerifying')}
      </p>
    );
  }

  if (!hasValidRegistrationToken) {
    return (
      <p className="m-0 rounded-lg border border-[color:color-mix(in_srgb,var(--danger)_20%,transparent)] bg-[color:color-mix(in_srgb,var(--danger)_8%,transparent)] px-3 py-2 text-sm text-[var(--danger)]">
        {t('auth.registerLinkInvalid')}
      </p>
    );
  }

  return null;
}

function RegisterSection({
  hasRegistrationToken,
  checkingRegistrationToken,
  hasValidRegistrationToken,
  registerForm,
  setRegisterForm,
  phoneEnabled,
  phoneFormat,
  isBusy,
  hasValidRegisterName,
  passkeyLoading,
  onPasskeySignup,
}) {
  return (
    <>
      <RegistrationNotice
        hasRegistrationToken={hasRegistrationToken}
        checkingRegistrationToken={checkingRegistrationToken}
        hasValidRegistrationToken={hasValidRegistrationToken}
      />
      <label className="field-label">
        {t('auth.fullName')}
        <input
          name="full_name"
          value={registerForm.full_name}
          onChange={(event) => setRegisterForm((previous) => ({ ...previous, full_name: event.target.value }))}
          disabled={!hasValidRegistrationToken}
          minLength={3}
        />
      </label>
      {phoneEnabled ? (
        <label className="field-label">
          {t('auth.phoneLabel')}
          <input
            name="phone"
            type="tel"
            value={registerForm.phone}
            onChange={(event) => setRegisterForm((previous) => ({ ...previous, phone: sanitizePhoneInput(event.target.value) }))}
            onBlur={(event) => setRegisterForm((previous) => ({ ...previous, phone: formatPhoneNumber(event.target.value, phoneFormat) }))}
            disabled={!hasValidRegistrationToken}
            placeholder={getPhonePlaceholder(phoneFormat)}
            autoComplete="tel"
            pattern="[\d+\-\s]*"
          />
        </label>
      ) : null}
      <div className="space-y-4">
        <PasskeyButton
          label={t('auth.signupPasskey')}
          loadingLabel={t('auth.startPasskey')}
          loading={passkeyLoading}
          disabled={isBusy || !hasValidRegistrationToken || !hasValidRegisterName}
          onClick={onPasskeySignup}
        />
      </div>
    </>
  );
}

function LoginSection({ isBusy, passkeyLoading, handlePasskeyLogin, setIsScannerOpen }) {
  return (
    <div className="space-y-4">
      <PasskeyButton
        label={t('auth.loginPasskey')}
        loadingLabel={t('auth.startPasskey')}
        loading={passkeyLoading}
        disabled={isBusy}
        onClick={handlePasskeyLogin}
      />
      <button type="button" className="btn-secondary w-full" disabled={isBusy} onClick={() => setIsScannerOpen(true)}>
        <ScanLine className="h-4 w-4" />
        {t('auth.scanInviteQr')}
      </button>
    </div>
  );
}

function DevboxSection({ devboxUsers, isBusy, onLogin }) {
  return (
    <div className="space-y-3">
      <p className="m-0 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">{t('auth.devbox')}</p>
      <div className="space-y-2">
        {devboxUsers.length ? devboxUsers.map((user) => (
          <button
            key={user.id}
            type="button"
            className="btn-secondary w-full items-start justify-start py-3 text-left"
            onClick={() => onLogin(user.id)}
            disabled={isBusy}
          >
            <span className="flex w-full flex-col items-start gap-0.5 leading-tight">
              <span>{user.name}</span>
              {user.subtitle ? <span className="text-xs text-[var(--text-muted)]">{user.subtitle}</span> : null}
            </span>
            {user.is_admin ? (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="ml-auto size-4 shrink-0 text-[var(--text-muted)]" aria-label={t('auth.adminLabel')}>
                <path fillRule="evenodd" d="M9.661 2.237a.531.531 0 0 1 .678 0 11.947 11.947 0 0 0 7.078 2.749.5.5 0 0 1 .479.425c.069.52.104 1.05.104 1.589 0 5.162-3.26 9.563-7.834 11.256a.48.48 0 0 1-.332 0C5.26 16.563 2 12.162 2 7c0-.538.035-1.069.104-1.589a.5.5 0 0 1 .48-.425 11.947 11.947 0 0 0 7.077-2.749Z" clipRule="evenodd" />
              </svg>
            ) : null}
          </button>
        )) : (
          <p className="m-0 text-sm text-[var(--text-secondary)]">{t('auth.noUsersFound')}</p>
        )}
      </div>
    </div>
  );
}

function AuthFooter({ isRegisterMode, hasRegistrationToken, registrationToken }) {
  const renderFooterContent = () => {
    if (!isRegisterMode) {
      if (!hasRegistrationToken) {
        return t('auth.registerRequiresInvite');
      }

      return (
        <>
          {t('auth.noAccount')} <Link to={`/register?${encodeURIComponent(registrationToken)}`}>{t('auth.register')}</Link>
        </>
      );
    }

    return (
      <>
        {t('auth.alreadyHaveAccount')} <Link to="/login">{t('auth.login')}</Link>
      </>
    );
  };

  return (
    <p className="m-0 text-center text-sm text-[var(--text-secondary)]">
      {renderFooterContent()}
    </p>
  );
}

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { settings: appSettings } = useAppSettings();
  const isRegisterRoute = useMemo(() => location.pathname === '/register', [location.pathname]);
  const registrationToken = useMemo(() => parseRegistrationToken(location.search), [location.search]);
  const [registerForm, setRegisterForm] = useState(registerInitialState);
  const [devboxLoginLoading, setDevboxLoginLoading] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [error, setError] = useState('');
  const isRegisterMode = isRegisterRoute;
  const {
    hasRegistrationToken,
    checkingRegistrationToken,
    registrationTokenValid,
  } = useRegistrationAccess({ isRegisterMode, registrationToken, navigate });
  const { devboxUsers, devboxAvailable, devboxLoading } = useDevboxUsers({ isRegisterMode, setError });
  const hasValidRegistrationToken = hasRegistrationToken && registrationTokenValid;
  const hasValidRegisterName = registerForm.full_name.trim().length >= 3;
  const { passkeyLoading, handlePasskeySignup, handlePasskeyLogin } = usePasskeyAuth({ navigate, setError });
  const isBusy = passkeyLoading || devboxLoading || devboxLoginLoading || checkingRegistrationToken;

  useEffect(() => {
    if (location.pathname !== '/login') {
      return undefined;
    }

    if (typeof document !== 'undefined') {
      document.documentElement.dataset.theme = getSystemTheme();
      document.documentElement.dataset.themePreference = 'system';
    }

    return () => {
      applyThemePreference(getStoredThemePreference());
    };
  }, [location.pathname]);

  const onPasskeySignup = async () => {
    const displayName = registerForm.full_name.trim();
    if (displayName.length < 3) {
      setError(t('auth.nameMinChars'));
      return;
    }

    if (!hasValidRegistrationToken) {
      setError(t('auth.registerClosedShort'));
      return;
    }

    await handlePasskeySignup(
      displayName,
      appSettings.phone_enabled ? formatPhoneNumber(registerForm.phone, appSettings.phone_format) : '',
      registrationToken,
    );
  };

  const handleDevboxUserLogin = async (userId) => {
    setError('');
    setDevboxLoginLoading(true);
    try {
      const response = await post('/api/auth/devbox/login', { user_id: userId });
      localStorage.setItem('token', response.token);
      navigateAfterLogin(navigate);
    } catch (loginError) {
      setError(loginError.message || t('auth.loginDevUserFailed'));
    } finally {
      setDevboxLoginLoading(false);
    }
  };

  const handleInviteDetected = (inviteToken) => {
    setIsScannerOpen(false);
    navigate(`/invite/${inviteToken}`);
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--app-bg)] px-4 py-12">
      <section className="surface-card w-full max-w-[420px] space-y-8 p-7 sm:p-8">
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex h-[88px] w-[88px] items-center justify-center overflow-hidden rounded-lg bg-[var(--app-surface-muted)]">
              <img src="/kvitt.png" alt="Kvitt logo" className="h-16 w-16 object-contain" />
            </div>
            <div className="space-y-1">
              <h1 className="page-title">{t('auth.loginTitle')}</h1>
              <p className="m-0 text-sm text-[var(--text-secondary)]">{window.__kvittConfig?.tagline || import.meta.env.VITE_TAGLINE || t('common.defaultTagline')}</p>
            </div>
          </div>
        </div>

        <form className="space-y-4" onSubmit={(event) => event.preventDefault()}>
          {isRegisterMode ? (
            <RegisterSection
              hasRegistrationToken={hasRegistrationToken}
              checkingRegistrationToken={checkingRegistrationToken}
              hasValidRegistrationToken={hasValidRegistrationToken}
              registerForm={registerForm}
              setRegisterForm={setRegisterForm}
              phoneEnabled={appSettings.phone_enabled}
              phoneFormat={appSettings.phone_format}
              isBusy={isBusy}
              hasValidRegisterName={hasValidRegisterName}
              passkeyLoading={passkeyLoading}
              onPasskeySignup={onPasskeySignup}
            />
          ) : (
            <LoginSection
              isBusy={isBusy}
              passkeyLoading={passkeyLoading}
              handlePasskeyLogin={handlePasskeyLogin}
              setIsScannerOpen={setIsScannerOpen}
            />
          )}

          {!isRegisterMode && devboxAvailable ? (
            <DevboxSection devboxUsers={devboxUsers} isBusy={isBusy} onLogin={handleDevboxUserLogin} />
          ) : null}

          {error ? <p className="rounded-lg border border-[color:color-mix(in_srgb,var(--danger)_20%,transparent)] bg-[color:color-mix(in_srgb,var(--danger)_8%,transparent)] px-3 py-2 text-sm text-[var(--danger)]">{error}</p> : null}

          <AuthFooter
            isRegisterMode={isRegisterMode}
            hasRegistrationToken={hasRegistrationToken}
            registrationToken={registrationToken}
          />
        </form>
      </section>

      {isScannerOpen ? (
        <InviteQrScannerModal
          onClose={() => setIsScannerOpen(false)}
          onDetected={handleInviteDetected}
        />
      ) : null}
    </main>
  );
}
