import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import {
  checkPasskeyAvailability,
  getPasskeyErrorMessage,
  loginWithPasskey,
} from '../auth/passkey.js';
import { t } from '../lib/i18n.js';
import ErrorMessage from '../components/ErrorMessage.jsx';

export default function QrLoginPage() {
  const { token } = useParams();
  const [passkeySupported, setPasskeySupported] = useState(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    checkPasskeyAvailability()
      .then((available) => setPasskeySupported(available))
      .catch(() => setPasskeySupported(false));
  }, []);

  const handleLogin = async () => {
    setError('');
    setLoading(true);
    try {
      const { token: jwt } = await loginWithPasskey();

      const response = await fetch(`/api/auth/qr-login/${encodeURIComponent(token)}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jwt }),
      });

      if (!response.ok) {
        let message = t('qrLogin.completeFailed');
        try {
          const data = await response.json();
          message = data.error || message;
        } catch {
          // ignore
        }
        throw new Error(message);
      }

      setDone(true);
    } catch (err) {
      setError(getPasskeyErrorMessage(err, 'login'));
    } finally {
      setLoading(false);
    }
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
              <h1 className="page-title">{t('qrLogin.pageTitle')}</h1>
              <p className="m-0 text-sm text-[var(--text-secondary)]">{t('qrLogin.pageDescription')}</p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {done ? (
            <div className="rounded-lg border border-[color:color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[color:color-mix(in_srgb,var(--accent)_8%,transparent)] px-4 py-4 text-center">
              <p className="m-0 font-semibold text-[var(--text-primary)]">{t('qrLogin.successTitle')}</p>
              <p className="m-0 mt-1 text-sm text-[var(--text-secondary)]">{t('qrLogin.successDescription')}</p>
            </div>
          ) : (
            <>
              {passkeySupported === false && (
                <p className="m-0 rounded-lg border border-[color:color-mix(in_srgb,var(--danger)_20%,transparent)] bg-[color:color-mix(in_srgb,var(--danger)_8%,transparent)] px-3 py-2 text-sm text-[var(--danger)]">
                  {t('auth.deviceNoPasskey')}
                </p>
              )}
              <button
                type="button"
                onClick={handleLogin}
                disabled={loading || passkeySupported === false || passkeySupported === null}
                className="btn-secondary w-full justify-start border-[var(--accent)] bg-[color:color-mix(in_srgb,var(--accent)_10%,white)] text-[var(--text-primary)] hover:bg-[color:color-mix(in_srgb,var(--accent)_16%,white)]"
              >
                <KeyRound className="h-4 w-4 text-[var(--accent)]" />
                {loading ? t('qrLogin.startPasskey') : t('qrLogin.loginButton')}
              </button>
              <ErrorMessage message={error} className="m-0" />
            </>
          )}
        </div>
      </section>
    </main>
  );
}
