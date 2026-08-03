import { useEffect, useState } from 'react';
import { Copy, SendHorizontal } from 'lucide-react';
import QRCode from 'qrcode';
import ModalShell from './ModalShell.jsx';

export default function InviteQrCodeModal({
  inviteUrl,
  expiresAt,
  onClose,
  onShare,
  onCopy,
  sharing = false,
}) {
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [qrError, setQrError] = useState('');

  useEffect(() => {
    let active = true;
    if (!inviteUrl) {
      setQrDataUrl('');
      return () => {
        active = false;
      };
    }

    setQrError('');
    QRCode.toDataURL(inviteUrl, {
      width: 320,
      margin: 1,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    })
      .then((value) => {
        if (!active) return;
        setQrDataUrl(value);
      })
      .catch(() => {
        if (!active) return;
        setQrDataUrl('');
        setQrError('Kunde inte skapa QR-kod.');
      });

    return () => {
      active = false;
    };
  }, [inviteUrl]);

  return (
    <ModalShell
      title="Skanna för att gå med"
      description="Skanna QR-koden med mobilen för att öppna inbjudan direkt."
      onClose={onClose}
    >
      <div className="space-y-4">
        <div className="flex justify-center">
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt="QR-kod för inbjudningslänk"
              className="h-64 w-64 rounded-lg border border-[var(--border-subtle)] bg-white p-2"
            />
          ) : (
            <div className="flex h-64 w-64 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--app-surface-muted)] text-sm text-[var(--text-secondary)]">
              {qrError || 'Skapar QR-kod...'}
            </div>
          )}
        </div>

        <p className="m-0 break-all rounded-lg border border-[var(--border-subtle)] bg-[var(--app-surface-muted)] px-3 py-2 text-xs text-[var(--text-secondary)]">
          {inviteUrl}
        </p>

        {expiresAt ? (
          <p className="m-0 text-xs text-[var(--text-muted)]">
            Gäller till {new Date(expiresAt).toLocaleDateString('sv-SE')}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-secondary"
            onClick={onShare}
            disabled={sharing || !inviteUrl}
          >
            <SendHorizontal className="h-4 w-4" />
            {sharing ? 'Delar...' : 'Dela inbjudan'}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={onCopy}
            disabled={!inviteUrl}
          >
            <Copy className="h-4 w-4" />
            Kopiera länk
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
