import { useState } from 'react';
import { Check, Copy, ExternalLink } from 'lucide-react';
import { isEmbeddedBrowser } from '../lib/embeddedBrowser.js';
import { t } from '../lib/i18n.js';

export default function EmbeddedBrowserNotice({ forceShow = false }) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [manualLink, setManualLink] = useState('');

  const embedded = isEmbeddedBrowser(navigator.userAgent, {
    standalone: navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches,
  });
  if (!forceShow && !embedded) return null;

  const copyLink = async () => {
    const link = window.location.href;
    setCopied(false);
    setCopyFailed(false);
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setManualLink(link);
      setCopyFailed(true);
    }
  };

  return (
    <aside className="space-y-3 border-l-4 border-[var(--accent)] bg-[var(--app-surface-muted)] p-4" aria-label={t('auth.embeddedBrowserTitle')}>
      <div className="flex items-center gap-2 font-semibold">
        <ExternalLink size={18} aria-hidden="true" />
        <span>{t('auth.embeddedBrowserTitle')}</span>
      </div>
      <p className="m-0 text-sm text-[var(--text-secondary)]">{t(embedded ? 'auth.embeddedBrowserDescription' : 'auth.passkeyBrowserFallback')}</p>
      <button type="button" className="btn-secondary w-full" onClick={copyLink}>
        {copied ? <Check size={18} aria-hidden="true" /> : <Copy size={18} aria-hidden="true" />}
        {t('auth.copyBrowserLink')}
      </button>
      <div role="status" className="text-sm text-[var(--text-secondary)]">
        {copied ? t('auth.browserLinkCopied') : null}
        {copyFailed ? (
          <label className="field-label">
            {t('auth.browserLinkCopyFailed')}
            <input aria-label={t('auth.browserLinkLabel')} type="text" readOnly value={manualLink} onFocus={(event) => event.target.select()} className="w-full min-w-0" />
          </label>
        ) : null}
      </div>
    </aside>
  );
}