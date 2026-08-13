import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import { ChevronDown, QrCode } from 'lucide-react';
import ModalShell from './ModalShell.jsx';
import { get, post } from '../api/client.js';
import { t } from '../lib/i18n.js';

const POLL_INTERVAL_MS = 3000;

export default function QrLoginModal({ onClose }) {
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [showUrl, setShowUrl] = useState(false);
  const pollRef = useRef(null);
  const activeRef = useRef(true);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const claimSession = useCallback(async (token, claimSecret) => {
    stopPolling();
    try {
      const result = await post(`/api/auth/qr-login/${token}/claim`, { claimSecret });
      if (!activeRef.current) return;
      localStorage.setItem('token', result.jwt);
      navigate('/');
    } catch {
      if (!activeRef.current) return;
      setError(t('qrLogin.claimFailed'));
      setStatus('error');
    }
  }, [navigate, stopPolling]);

  useEffect(() => {
    activeRef.current = true;

    post('/api/auth/qr-login', {})
      .then((data) => {
        if (!activeRef.current) return;
        setSession(data);
        setStatus('pending');

        QRCode.toDataURL(data.loginUrl, {
          width: 320,
          margin: 1,
          color: { dark: '#0f172a', light: '#ffffff' },
        })
          .then((url) => {
            if (!activeRef.current) return;
            setQrDataUrl(url);
          })
          .catch(() => {
            if (!activeRef.current) return;
            setError(t('qrLogin.qrCreateFailed'));
          });

        pollRef.current = setInterval(async () => {
          if (!activeRef.current) return;
          try {
            const result = await get(`/api/auth/qr-login/${data.token}/status`);
            if (!activeRef.current) return;
            if (result.status === 'completed') {
              setStatus('completed');
              claimSession(data.token, data.claimSecret);
            } else if (result.status === 'expired') {
              stopPolling();
              setStatus('expired');
            }
          } catch {
            // transient error — keep polling
          }
        }, POLL_INTERVAL_MS);
      })
      .catch(() => {
        if (!activeRef.current) return;
        setError(t('qrLogin.createFailed'));
        setStatus('error');
      });

    return () => {
      activeRef.current = false;
      stopPolling();
    };
  }, [claimSession, stopPolling]);

  const handleClose = () => {
    stopPolling();
    onClose();
  };

  return (
    <ModalShell
      title={t('qrLogin.modalTitle')}
      description={t('qrLogin.modalDescription')}
      onClose={handleClose}
    >
      <div className="space-y-4">
        <div className="flex justify-center">
          {status === 'loading' && (
            <div className="flex h-64 w-64 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--app-surface-muted)] text-sm text-[var(--text-secondary)]">
              {t('qrLogin.creating')}
            </div>
          )}
          {status === 'pending' && qrDataUrl && (
            <img
              src={qrDataUrl}
              alt={t('qrLogin.qrAlt')}
              className="h-64 w-64 rounded-lg border border-[var(--border-subtle)] bg-white p-2"
            />
          )}
          {status === 'pending' && !qrDataUrl && !error && (
            <div className="flex h-64 w-64 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--app-surface-muted)] text-sm text-[var(--text-secondary)]">
              {t('qrLogin.creating')}
            </div>
          )}
          {status === 'completed' && (
            <div className="flex h-64 w-64 flex-col items-center justify-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--app-surface-muted)] text-sm text-[var(--text-secondary)]">
              <QrCode className="h-8 w-8 text-[var(--accent)]" />
              {t('qrLogin.loggingIn')}
            </div>
          )}
          {(status === 'expired' || status === 'error') && (
            <div className="flex h-64 w-64 flex-col items-center justify-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--app-surface-muted)] text-sm text-[var(--text-secondary)]">
              {status === 'expired' ? t('qrLogin.expired') : (error || t('qrLogin.createFailed'))}
            </div>
          )}
        </div>

        {status === 'pending' && (
          <p className="m-0 text-xs text-[var(--text-muted)]">
            {t('qrLogin.hint')}
          </p>
        )}

        {status === 'pending' && session?.loginUrl && (
          <div>
            <button
              type="button"
              className="flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              onClick={() => setShowUrl((v) => !v)}
            >
              <ChevronDown className={`h-3 w-3 transition-transform ${showUrl ? 'rotate-180' : ''}`} />
              {t('qrLogin.showLink')}
            </button>
            {showUrl && (
              <p className="mt-2 break-all rounded-lg border border-[var(--border-subtle)] bg-[var(--app-surface-muted)] px-3 py-2 text-xs text-[var(--text-secondary)]">
                {session.loginUrl}
              </p>
            )}
          </div>
        )}

        {error && status !== 'expired' && (
          <p className="m-0 rounded-lg border border-[color:color-mix(in_srgb,var(--danger)_20%,transparent)] bg-[color:color-mix(in_srgb,var(--danger)_8%,transparent)] px-3 py-2 text-sm text-[var(--danger)]">
            {error}
          </p>
        )}
      </div>
    </ModalShell>
  );
}
