import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { t } from '../lib/i18n.js';

export default function About() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[var(--app-bg)] text-[var(--text-primary)]">
      <header className="border-b border-[var(--border-subtle)] bg-[color:var(--app-surface)/88%] backdrop-blur-xl">
        <div className="mx-auto max-w-[1280px] px-4 sm:px-6">
          <div className="mx-auto flex h-16 max-w-[960px] items-center justify-between gap-4">
            <Link
              to="/login"
              className="flex items-center gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--app-surface-strong)] px-3 py-2 text-left shadow-[var(--shadow-soft)]"
            >
              <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg bg-[var(--app-surface-muted)]">
                <img src="/app-icon.png" alt={t('shell.appIconAlt')} className="h-full w-full object-cover" />
              </div>
              <div>
                <p className="m-0 text-sm font-semibold">{t('common.appName')}</p>
                <p className="m-0 text-xs text-[var(--text-muted)]">{window.__kvittConfig?.tagline || import.meta.env.VITE_TAGLINE || t('common.defaultTagline')}</p>
              </div>
            </Link>
            <button type="button" className="btn-secondary" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-4 w-4" />
              Tillbaka
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1280px] px-4 pb-24 pt-6 sm:px-6 lg:pb-10">
        <div className="mx-auto max-w-[960px] space-y-6">
      <div className="surface-card flex items-center gap-5 p-5">
        <img src="/kvitt.png" alt={t('about.logoAlt')} className="h-28 w-28 flex-shrink-0 rounded-2xl shadow-[var(--shadow-soft)]" />
        <p className="text-[var(--text-secondary)]">
          {t('about.intro')}
        </p>
      </div>

      <div className="surface-card p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--text-secondary)]">{t('about.loginHeading')}</h2>
        <p className="text-[var(--text-secondary)]">
          {t('about.loginIntro')}
        </p>
        <p className="mt-3 text-[var(--text-secondary)]">
          {t('about.loginVaultPrefix')}{' '}
          <span className="font-medium text-[var(--text-primary)]">{t('about.loginVaultIcloud')}</span>,{' '}
          <span className="font-medium text-[var(--text-primary)]">{t('about.loginVaultGoogle')}</span>{' '}
          {t('about.loginVaultOr')}{' '}
          <span className="font-medium text-[var(--text-primary)]">{t('about.loginVaultBitwarden')}</span>.
          {' '}
          {t('about.loginVaultSuffix')}
        </p>
      </div>

      <div className="surface-card p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--text-secondary)]">{t('about.pwaHeading')}</h2>
        <p className="text-[var(--text-secondary)]">
          {t('about.pwaIntro')}
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <article className="rounded-xl border border-[var(--border-subtle)] bg-[var(--app-surface-muted)] p-3">
            <img
              src="/pwa-ios-1-safari.png"
              alt={t('about.pwaStep1Alt')}
              className="w-full rounded-lg border border-[var(--border-subtle)]"
            />
            <p className="mt-3 text-sm text-[var(--text-secondary)]">
              <span className="font-semibold text-[var(--text-primary)]">{t('about.stepLabel', { number: 1 })}</span>{' '}
              {t('about.pwaStep1Text')}
            </p>
          </article>

          <article className="rounded-xl border border-[var(--border-subtle)] bg-[var(--app-surface-muted)] p-3">
            <img
              src="/pwa-ios-2-share.png"
              alt={t('about.pwaStep2Alt')}
              className="w-full rounded-lg border border-[var(--border-subtle)]"
            />
            <p className="mt-3 text-sm text-[var(--text-secondary)]">
              <span className="font-semibold text-[var(--text-primary)]">{t('about.stepLabel', { number: 2 })}</span>{' '}
              {t('about.pwaStep2Text')}
            </p>
          </article>

          <article className="rounded-xl border border-[var(--border-subtle)] bg-[var(--app-surface-muted)] p-3">
            <img
              src="/pwa-ios-3-addtohome.png"
              alt={t('about.pwaStep3Alt')}
              className="w-full rounded-lg border border-[var(--border-subtle)]"
            />
            <p className="mt-3 text-sm text-[var(--text-secondary)]">
              <span className="font-semibold text-[var(--text-primary)]">{t('about.stepLabel', { number: 3 })}</span>{' '}
              {t('about.pwaStep3Text')}
            </p>
          </article>

          <article className="rounded-xl border border-[var(--border-subtle)] bg-[var(--app-surface-muted)] p-3">
            <img
              src="/pwa-ios-4-add.png"
              alt={t('about.pwaStep4Alt')}
              className="w-full rounded-lg border border-[var(--border-subtle)]"
            />
            <p className="mt-3 text-sm text-[var(--text-secondary)]">
              <span className="font-semibold text-[var(--text-primary)]">{t('about.stepLabel', { number: 4 })}</span>{' '}
              {t('about.pwaStep4Text')}
            </p>
          </article>
        </div>
      </div>

      <div className="surface-card p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--text-secondary)]">{t('about.pwaAndroidHeading')}</h2>
        <p className="text-[var(--text-secondary)]">
          {t('about.pwaAndroidIntro')}
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <article className="rounded-xl border border-[var(--border-subtle)] bg-[var(--app-surface-muted)] p-3">
            <img
              src="/pwa-android-1-add-app.png"
              alt={t('about.pwaAndroidStep1Alt')}
              className="w-full rounded-lg border border-[var(--border-subtle)]"
            />
            <p className="mt-3 text-sm text-[var(--text-secondary)]">
              <span className="font-semibold text-[var(--text-primary)]">{t('about.stepLabel', { number: 1 })}</span>{' '}
              {t('about.pwaAndroidStep1Text')}
            </p>
          </article>

          <article className="rounded-xl border border-[var(--border-subtle)] bg-[var(--app-surface-muted)] p-3">
            <img
              src="/pwa-android-2-install.png"
              alt={t('about.pwaAndroidStep2Alt')}
              className="w-full rounded-lg border border-[var(--border-subtle)]"
            />
            <p className="mt-3 text-sm text-[var(--text-secondary)]">
              <span className="font-semibold text-[var(--text-primary)]">{t('about.stepLabel', { number: 2 })}</span>{' '}
              {t('about.pwaAndroidStep2Text')}
            </p>
          </article>

          <article className="rounded-xl border border-[var(--border-subtle)] bg-[var(--app-surface-muted)] p-3">
            <img
              src="/pwa-android-3-notifications.png"
              alt={t('about.pwaAndroidStep3Alt')}
              className="w-full rounded-lg border border-[var(--border-subtle)]"
            />
            <p className="mt-3 text-sm text-[var(--text-secondary)]">
              <span className="font-semibold text-[var(--text-primary)]">{t('about.stepLabel', { number: 3 })}</span>{' '}
              {t('about.pwaAndroidStep3Text')}
            </p>
          </article>
        </div>
      </div>
        </div>
      </main>
    </div>
  );
}
