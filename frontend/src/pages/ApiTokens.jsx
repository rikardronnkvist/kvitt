import { useEffect, useState } from 'react';
import { Cable, Check, Copy, KeyRound, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { del, get, post } from '../api/client.js';
import ErrorMessage from '../components/ErrorMessage.jsx';
import { formatDateTime } from '../lib/format.js';
import { t } from '../lib/i18n.js';

const scopeLabels = {
  'groups:read': 'apiTokens.readGroups',
  'expenses:read': 'apiTokens.readExpenses',
  'settlements:read': 'apiTokens.readSettlements',
  'expenses:write': 'apiTokens.writeExpensesScope',
};

function tokenStatus(token) {
  if (token.revoked_at) return 'revoked';
  if (token.expires_at && new Date(token.expires_at) <= new Date()) return 'expired';
  return 'active';
}

export default function ApiTokens() {
  const [tokens, setTokens] = useState([]);
  const [grants, setGrants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [grantsLoading, setGrantsLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', can_write_expenses: true, expires_in_days: 90 });
  const [createdToken, setCreatedToken] = useState('');
  const [copied, setCopied] = useState(false);
  const [mcpUrlCopied, setMcpUrlCopied] = useState(false);

  const loadTokens = async () => {
    setLoading(true);
    try {
      const data = await get('/api/auth/api-tokens');
      setTokens(data.tokens || []);
    } catch (requestError) {
      setError(requestError.message || t('apiTokens.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  const loadGrants = async () => {
    setGrantsLoading(true);
    try {
      const data = await get('/api/oauth/grants');
      setGrants(data.grants || []);
    } catch (requestError) {
      setError(requestError.message || t('apiTokens.grantsLoadFailed'));
    } finally {
      setGrantsLoading(false);
    }
  };

  useEffect(() => {
    loadTokens();
    loadGrants();
  }, []);

  const createToken = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const data = await post('/api/auth/api-tokens', form);
      setCreatedToken(data.token);
      setCreating(false);
      setForm({ name: '', can_write_expenses: true, expires_in_days: 90 });
      await loadTokens();
    } catch (requestError) {
      setError(requestError.message || t('apiTokens.createFailed'));
    } finally {
      setSaving(false);
    }
  };

  const copyToken = async () => {
    try {
      await navigator.clipboard.writeText(createdToken);
      setCopied(true);
    } catch {
      setError(t('errors.copyFailed'));
    }
  };

  const copyMcpUrl = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/mcp`);
      setMcpUrlCopied(true);
    } catch {
      setError(t('errors.copyFailed'));
    }
  };

  const revokeToken = async (token) => {
    if (!window.confirm(t('apiTokens.revokeConfirm'))) return;
    setError('');
    try {
      await del(`/api/auth/api-tokens/${token.id}`);
      await loadTokens();
    } catch (requestError) {
      setError(requestError.message || t('apiTokens.revokeFailed'));
    }
  };

  const revokeGrant = async (grant) => {
    if (!window.confirm(t('apiTokens.grantRevokeConfirm', {
      client: grant.client_name || t('apiTokens.unknownApp'),
    }))) return;
    setError('');
    try {
      await del(`/api/oauth/grants/${grant.id}`);
      await loadGrants();
    } catch (requestError) {
      setError(requestError.message || t('apiTokens.grantRevokeFailed'));
    }
  };

  if (createdToken) {
    return (
      <section className="mx-auto max-w-xl space-y-5">
        <div className="surface-card space-y-4 p-5 sm:p-6">
          <ShieldCheck className="h-8 w-8 text-[var(--accent)]" />
          <div>
            <p className="section-eyebrow">{t('apiTokens.eyebrow')}</p>
            <h1 className="m-0 text-2xl font-semibold">{t('apiTokens.createdTitle')}</h1>
            <p className="mb-0 mt-2 text-sm text-[var(--text-secondary)]">{t('apiTokens.createdDescription')}</p>
          </div>
          <code className="block break-all rounded-lg border border-[var(--border-subtle)] bg-[var(--app-surface-muted)] p-3 text-sm text-[var(--text-primary)]">{createdToken}</code>
          <div className="flex gap-3">
            <button type="button" className="btn-secondary flex-1" onClick={copyToken}>
              <Copy className="h-4 w-4" /> {copied ? t('apiTokens.copied') : t('apiTokens.copy')}
            </button>
            <button type="button" className="btn-primary flex-1" onClick={() => { setCreatedToken(''); setCopied(false); }}>
              {t('apiTokens.done')}
            </button>
          </div>
          <ErrorMessage message={error} className="m-0" />
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-3xl space-y-5">
      <div>
        <p className="section-eyebrow">{t('apiTokens.eyebrow')}</p>
        <h1 className="m-0 text-2xl font-semibold">{t('apiTokens.title')}</h1>
        <p className="mb-0 mt-2 max-w-2xl text-sm text-[var(--text-secondary)]">{t('apiTokens.description')}</p>
      </div>
      <ErrorMessage message={error} className="m-0" />

      <div className="surface-card space-y-3 p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--app-surface-muted)] text-[var(--accent)]">
            <Cable className="h-5 w-5" />
          </div>
          <div>
            <h2 className="m-0 text-lg font-semibold">{t('apiTokens.mcpTitle')}</h2>
            <p className="m-0 text-sm text-[var(--text-secondary)]">{t('apiTokens.mcpDescription')}</p>
          </div>
        </div>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--app-surface-muted)] p-3 text-left text-sm text-[var(--text-primary)] transition hover:border-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          onClick={copyMcpUrl}
          aria-label={t(mcpUrlCopied ? 'apiTokens.mcpUrlCopied' : 'apiTokens.copyMcpUrl')}
          title={t(mcpUrlCopied ? 'apiTokens.mcpUrlCopied' : 'apiTokens.copyMcpUrl')}
        >
          <code className="min-w-0 break-all">{`${window.location.origin}/mcp`}</code>
          {mcpUrlCopied
            ? <Check className="h-4 w-4 shrink-0 text-[var(--success)]" aria-hidden="true" />
            : <Copy className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" aria-hidden="true" />}
        </button>
        <p className="m-0 text-sm text-[var(--text-secondary)]">{t('apiTokens.mcpLoginHint')}</p>
      </div>

      <div className="space-y-3">
        <div>
          <h2 className="m-0 text-lg font-semibold">{t('apiTokens.connectedAppsTitle')}</h2>
          <p className="mb-0 mt-1 text-sm text-[var(--text-secondary)]">{t('apiTokens.connectedAppsDescription')}</p>
        </div>
        {grantsLoading ? <p className="text-sm text-[var(--text-secondary)]">{t('apiTokens.loadingConnectedApps')}</p> : null}
        {!grantsLoading && grants.length === 0 ? (
          <div className="surface-card p-5">
            <h3 className="m-0 text-base font-semibold">{t('apiTokens.connectedAppsEmptyTitle')}</h3>
            <p className="mb-0 mt-2 text-sm text-[var(--text-secondary)]">{t('apiTokens.connectedAppsEmptyDescription')}</p>
          </div>
        ) : null}
        {grants.map((grant) => (
          <article key={grant.id} className="surface-card flex flex-wrap items-center justify-between gap-4 p-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Cable className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" />
                <h3 className="m-0 truncate text-base font-semibold">
                  {grant.client_name || t('apiTokens.unknownApp')}
                </h3>
              </div>
              {grant.client_host ? (
                <p className="mb-0 mt-1 text-xs font-medium text-[var(--text-secondary)]">
                  {t('apiTokens.connectedVia', { host: grant.client_host })}
                </p>
              ) : null}
              <p className="mb-0 mt-2 text-xs text-[var(--text-secondary)]">
                {grant.scopes.map((scope) => t(scopeLabels[scope] || scope)).join(' · ')}
                {' · '}{t('shell.createdAt')} {formatDateTime(grant.created_at)}
                {' · '}{t('shell.lastUsed')} {grant.last_used_at ? formatDateTime(grant.last_used_at) : t('shell.never')}
              </p>
            </div>
            <button
              type="button"
              className="icon-button text-[var(--danger)]"
              title={t('apiTokens.revokeApp')}
              aria-label={t('apiTokens.revokeApp')}
              onClick={() => revokeGrant(grant)}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </article>
        ))}
      </div>

      <div className="flex flex-wrap items-end justify-between gap-4 border-t border-[var(--border-subtle)] pt-5">
        <div>
          <h2 className="m-0 text-lg font-semibold">{t('apiTokens.advancedTitle')}</h2>
          <p className="mb-0 mt-1 max-w-2xl text-sm text-[var(--text-secondary)]">{t('apiTokens.advancedDescription')}</p>
        </div>
        <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> {t('apiTokens.create')}
        </button>
      </div>
      {creating ? (
        <form className="surface-card grid gap-4 p-5" onSubmit={createToken}>
          <label className="field-label">{t('apiTokens.name')}<input autoFocus required value={form.name} onChange={(event) => setForm((value) => ({ ...value, name: event.target.value }))} placeholder={t('apiTokens.namePlaceholder')} /></label>
          <label className="flex items-center gap-3 text-sm font-medium"><input type="checkbox" checked={form.can_write_expenses} onChange={(event) => setForm((value) => ({ ...value, can_write_expenses: event.target.checked }))} />{t('apiTokens.writeExpenses')}</label>
          <label className="field-label">{t('apiTokens.expiry')}<select value={form.expires_in_days ?? 'never'} onChange={(event) => setForm((value) => ({ ...value, expires_in_days: event.target.value === 'never' ? null : Number(event.target.value) }))}><option value={30}>{t('apiTokens.days30')}</option><option value={90}>{t('apiTokens.days90')}</option><option value={365}>{t('apiTokens.days365')}</option><option value="never">{t('apiTokens.neverExpires')}</option></select></label>
          <div className="flex gap-3"><button type="button" className="btn-secondary flex-1" onClick={() => setCreating(false)}>{t('common.cancel')}</button><button type="submit" className="btn-primary flex-1" disabled={saving}>{saving ? t('apiTokens.creating') : t('apiTokens.create')}</button></div>
        </form>
      ) : null}
      {loading ? <p className="text-sm text-[var(--text-secondary)]">{t('shell.loadingPasskeys')}</p> : null}
      {!loading && tokens.length === 0 ? <div className="surface-card p-5"><h2 className="m-0 text-base font-semibold">{t('apiTokens.emptyTitle')}</h2><p className="mb-0 mt-2 text-sm text-[var(--text-secondary)]">{t('apiTokens.emptyDescription')}</p></div> : null}
      <div className="space-y-3">
        {tokens.map((token) => {
          const status = tokenStatus(token);
          return <article key={token.id} className="surface-card flex flex-wrap items-center justify-between gap-4 p-4"><div className="min-w-0"><div className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-[var(--text-secondary)]" /><h2 className="m-0 text-base font-semibold">{token.name}</h2><span className="text-xs text-[var(--text-muted)]">{t(`apiTokens.${status}`)}</span></div><p className="mb-0 mt-2 text-xs text-[var(--text-secondary)]">{token.scopes.map((scope) => t(scopeLabels[scope] || scope)).join(' · ')} · {t('shell.createdAt')} {formatDateTime(token.created_at)} · {t('shell.lastUsed')} {token.last_used_at ? formatDateTime(token.last_used_at) : t('shell.never')}</p></div>{status === 'active' ? <button type="button" className="icon-button text-[var(--danger)]" title={t('apiTokens.revoke')} aria-label={t('apiTokens.revoke')} onClick={() => revokeToken(token)}><Trash2 className="h-4 w-4" /></button> : null}</article>;
        })}
      </div>
    </section>
  );
}