import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { startRegistration } from '@simplewebauthn/browser';
import { post } from '../api/client.js';
import { getPasskeyErrorMessage } from '../auth/passkey.js';
import { t } from '../lib/i18n.js';

function startRegistrationCompat(optionsJSON) {
  try {
    return startRegistration({ optionsJSON });
  } catch (error) {
    if (error instanceof TypeError) {
      return startRegistration(optionsJSON);
    }
    throw error;
  }
}

export default function Recover() {
  const navigate = useNavigate();
  const location = useLocation();
  const token = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('token') || '';
  }, [location.search]);

  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) {
      navigate('/login', { replace: true });
    }
  }, [token, navigate]);

  const handleRecover = async () => {
    setError('');
    setLoading(true);
    try {
      const optionsResponse = await post(`/api/auth/passkey/recover/${token}/options`, {});
      const response = await startRegistrationCompat(optionsResponse.options);
      const data = await post(`/api/auth/passkey/recover/${token}/verify`, {
        requestId: optionsResponse.requestId,
        response,
      });
      localStorage.setItem('token', data.token);
      setDone(true);
      setTimeout(() => navigate('/'), 1500);
    } catch (err) {
      const msg = err?.message || '';
      // Surface expired/used token errors directly; wrap other errors in a generic message
      if (msg.includes('gått ut') || msg.includes('redan använts')) {
        setError(msg);
      } else {
        setError(getPasskeyErrorMessage(err, 'register'));
      }
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="surface-card w-full max-w-sm space-y-4 p-8 text-center">
          <p className="text-lg font-semibold">{t('recover.passkeyRegistered')}</p>
          <p className="text-sm text-[var(--text-secondary)]">{t('recover.autoLogin')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="surface-card w-full max-w-sm space-y-6 p-8">
        <div className="space-y-1">
          <p className="page-title">{t('recover.title')}</p>
          <p className="text-sm text-[var(--text-secondary)]">
            {t('recover.description')}
          </p>
        </div>

        {error ? (
          <p className="rounded-lg border border-[color:color-mix(in_srgb,var(--danger)_20%,transparent)] bg-[color:color-mix(in_srgb,var(--danger)_8%,transparent)] px-3 py-2 text-sm text-[var(--danger)]">
            {error}
          </p>
        ) : null}

        <button
          type="button"
          className="btn-primary w-full"
          onClick={handleRecover}
          disabled={loading || !token}
        >
          {loading ? t('recover.waiting') : t('recover.registerNewPasskey')}
        </button>
      </div>
    </div>
  );
}
