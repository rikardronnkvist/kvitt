import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy, ExternalLink } from 'lucide-react';
import { getErrorDetails } from '../lib/errorDetails.js';
import { t } from '../lib/i18n.js';
import ModalShell from './ModalShell.jsx';

const DEFAULT_CLASS_NAME = 'rounded-lg border border-[color:color-mix(in_srgb,var(--danger)_20%,transparent)] bg-[color:color-mix(in_srgb,var(--danger)_8%,transparent)] px-3 py-2 text-sm text-[var(--danger)]';
const DEFAULT_GITHUB_ISSUES_URL = 'https://github.com/rikardronnkvist/kvitt/issues/new';

function buildGitHubIssueUrl(message, details) {
  const configuredUrl = window.__kvittConfig?.githubIssuesUrl
    || import.meta.env.VITE_GITHUB_ISSUES_URL
    || DEFAULT_GITHUB_ISSUES_URL;

  try {
    const url = new URL(configuredUrl);
    if (url.protocol !== 'https:') return '';
    url.searchParams.set('title', t('errors.issueTitle', { message }));
    url.searchParams.set('body', details);
    return url.toString();
  } catch {
    return '';
  }
}

export default function ErrorMessage({ message, className = '' }) {
  const [showDetails, setShowDetails] = useState(false);
  const [copyState, setCopyState] = useState('idle');
  const detailsRef = useRef(null);
  const details = getErrorDetails(message);
  const githubIssueUrl = details ? buildGitHubIssueUrl(message, details) : '';

  if (!message) return null;

  function copyFromTextarea() {
    try {
      detailsRef.current?.select();
      return document.execCommand('copy');
    } catch {
      return false;
    }
  }

  async function copyDetails() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(details);
      } else if (!copyFromTextarea()) {
        throw new Error('Copy command failed');
      }
      setCopyState('copied');
    } catch {
      setCopyState(copyFromTextarea() ? 'copied' : 'failed');
    }
  }

  return (
    <>
      <p className={`${DEFAULT_CLASS_NAME} ${className}`.trim()}>
        <span>{message}</span>
        {details ? (
          <>
            {' '}
            <button
              type="button"
              className="font-medium underline underline-offset-2"
              onClick={() => {
                setCopyState('idle');
                setShowDetails(true);
              }}
            >
              {t('errors.moreInformation')}
            </button>
          </>
        ) : null}
      </p>

      {showDetails ? createPortal((
        <ModalShell
          title={t('errors.technicalDetailsTitle')}
          description={t('errors.technicalDetailsDescription')}
          onClose={() => setShowDetails(false)}
        >
          <textarea
            ref={detailsRef}
            className="min-h-64 w-full resize-y font-mono text-xs"
            value={details}
            readOnly
            aria-label={t('errors.technicalDetailsLabel')}
            onFocus={(event) => event.currentTarget.select()}
          />
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            {copyState === 'failed' ? <p className="m-0 self-center text-sm text-[var(--danger)]">{t('errors.copyFailed')}</p> : null}
            <button type="button" className="btn-secondary" onClick={() => setShowDetails(false)}>
              {t('common.close')}
            </button>
            <button type="button" className="btn-secondary" onClick={copyDetails}>
              <Copy className="h-4 w-4" />
              {copyState === 'copied' ? t('errors.copied') : t('errors.copyDetails')}
            </button>
            {githubIssueUrl ? (
              <a
                className="btn-primary"
                href={githubIssueUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-4 w-4" />
                {t('errors.createGitHubIssue')}
              </a>
            ) : null}
          </div>
        </ModalShell>
      ), document.body) : null}
    </>
  );
}
