import { t } from '../lib/i18n.js';

export default function About() {
  return (
    <div className="mx-auto max-w-[640px] space-y-6">
      <h1 className="text-2xl font-semibold text-[var(--text-primary)]">{t('about.title')}</h1>

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
  );
}
