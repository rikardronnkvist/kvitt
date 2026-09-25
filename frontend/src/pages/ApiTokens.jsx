import { useEffect, useState } from 'react';
import { Copy, KeyRound, Plus, ShieldCheck, Trash2 } from 'lucide-react';
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', can_write_expenses: false, expires_in_days: 90 });
  const [createdToken, setCreatedToken] = useState('');
  const [copied, setCopied] = useState(false);

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

  useEffect(() => { loadTokens(); }, []);

  const createToken = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const data = await post('/api/auth/api-tokens', form);
      setCreatedToken(data.token);
      setCreating(false);
      setForm({ name: '', can_write_expenses: false, expires_in_days: 90 });
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
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="section-eyebrow">{t('apiTokens.eyebrow')}</p>
          <h1 className="m-0 text-2xl font-semibold">{t('apiTokens.title')}</h1>
          <p className="mb-0 mt-2 max-w-2xl text-sm text-[var(--text-secondary)]">{t('apiTokens.description')}</p>
        </div>
        <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> {t('apiTokens.create')}
        </button>
      </div>
      <ErrorMessage message={error} className="m-0" />
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