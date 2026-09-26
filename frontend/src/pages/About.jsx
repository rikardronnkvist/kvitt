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

      <details className="surface-card overflow-hidden p-0">
        <summary className="list-none cursor-pointer p-5 text-left [&::-webkit-details-marker]:hidden">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="m-0 text-base font-semibold text-[var(--text-primary)]">{t('about.pwaHeading')}</p>
              <p className="m-0 mt-1 text-sm text-[var(--text-secondary)]">{t('about.pwaIntro')}</p>
            </div>
            <span className="text-xl text-[var(--text-primary)]">+</span>
          </div>
        </summary>

        <div className="border-t border-[var(--border-subtle)] px-5 pb-5 pt-4">
          <div className="grid gap-4 sm:grid-cols-2">
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
      </details>

      <details className="surface-card overflow-hidden p-0">
        <summary className="list-none cursor-pointer p-5 text-left [&::-webkit-details-marker]:hidden">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="m-0 text-base font-semibold text-[var(--text-primary)]">{t('about.pwaAndroidHeading')}</p>
              <p className="m-0 mt-1 text-sm text-[var(--text-secondary)]">{t('about.pwaAndroidIntro')}</p>
            </div>
            <span className="text-xl text-[var(--text-primary)]">+</span>
          </div>
        </summary>

        <div className="border-t border-[var(--border-subtle)] px-5 pb-5 pt-4">
          <div className="grid gap-4 sm:grid-cols-2">
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
      </details>

      <div className="flex flex-wrap justify-center gap-2">
        <a
          className="btn-primary inline-flex"
          href="https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=Kvitt&connectorUrl=https%3A%2F%2Fkvitt.example.se%2Fmcp"
          target="_blank"
          rel="noopener"
        >
          {t('about.claudeAddKvitt')}
        </a>
        <a
          className="btn-primary inline-flex"
          href="https://chatgpt.com/plugins#settings/Connectors?create-connector=true&redirectAfter=%2Fplugins"
          target="_blank"
          rel="noopener"
        >
          {t('about.chatgptAddKvitt')}
        </a>
      </div>

      <details className="surface-card overflow-hidden p-0">
        <summary className="list-none cursor-pointer p-5 text-left [&::-webkit-details-marker]:hidden">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="m-0 text-base font-semibold text-[var(--text-primary)]">{t('about.claudeHeading')}</p>
              <p className="m-0 mt-1 text-sm text-[var(--text-secondary)]">{t('about.claudeIntro')}</p>
            </div>
            <span className="text-xl text-[var(--text-primary)]">+</span>
          </div>
        </summary>

        <div className="border-t border-[var(--border-subtle)] px-5 pb-5 pt-4">
          <div className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <article className="rounded-xl border border-[var(--border-subtle)] bg-[var(--app-surface-muted)] p-3">
                <img
                  src="/claude-1-add-connector.png"
                  alt={t('about.claudeStep1Alt')}
                  className="mx-auto rounded-lg border border-[var(--border-subtle)] bg-white"
                />
                <p className="mt-3 text-sm text-[var(--text-secondary)]">
                  {t('about.claudeStep1Text')}
                </p>
              </article>

              <article className="rounded-xl border border-[var(--border-subtle)] bg-[var(--app-surface-muted)] p-3">
                <img
                  src="/claude-2-custom-connector-url.png"
                  alt={t('about.claudeStep2Alt')}
                  className="mx-auto rounded-lg border border-[var(--border-subtle)] bg-white"
                />
                <p className="mt-3 text-sm text-[var(--text-secondary)]">
                  {t('about.claudeStep2Text')}
                </p>
              </article>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <article className="rounded-xl border border-[var(--border-subtle)] bg-[var(--app-surface-muted)] p-3">
                <img
                  src="/claude-3-connector-auth-config.png"
                  alt={t('about.claudeStep3Alt')}
                  className="mx-auto rounded-lg border border-[var(--border-subtle)] bg-white"
                />
                <p className="mt-3 text-sm text-[var(--text-secondary)]">
                  {t('about.claudeStep3Text')}
                </p>
              </article>

              <article className="rounded-xl border border-[var(--border-subtle)] bg-[var(--app-surface-muted)] p-3">
                <img
                  src="/claude-4-connect-from-claude.png"
                  alt={t('about.claudeStep4Alt')}
                  className="mx-auto rounded-lg border border-[var(--border-subtle)] bg-white"
                />
                <p className="mt-3 text-sm text-[var(--text-secondary)]">
                  {t('about.claudeStep4Text')}
                </p>
              </article>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <article className="rounded-xl border border-[var(--border-subtle)] bg-[var(--app-surface-muted)] p-3">
                <img
                  src="/claude-5-web-login-claudeai.png"
                  alt={t('about.claudeStep5Alt')}
                  className="mx-auto rounded-lg border border-[var(--border-subtle)] bg-white"
                />
                <p className="mt-3 text-sm text-[var(--text-secondary)]">
                  {t('about.claudeStep5Text')}
                </p>
              </article>

              <article className="rounded-xl border border-[var(--border-subtle)] bg-[var(--app-surface-muted)] p-3">
                <img
                  src="/claude-6-connect-claude-kvitt.png"
                  alt={t('about.claudeStep6Alt')}
                  className="mx-auto rounded-lg border border-[var(--border-subtle)] bg-white"
                />
                <p className="mt-3 text-sm text-[var(--text-secondary)]">
                  {t('about.claudeStep6Text')}
                </p>
              </article>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <article className="rounded-xl border border-[var(--border-subtle)] bg-[var(--app-surface-muted)] p-3">
                <img
                  src="/claude-7-reopen-claude-app.png"
                  alt={t('about.claudeStep7Alt')}
                  className="mx-auto rounded-lg border border-[var(--border-subtle)] bg-white"
                />
                <p className="mt-3 text-sm text-[var(--text-secondary)]">
                  {t('about.claudeStep7Text')}
                </p>
              </article>

              <article className="rounded-xl border border-[var(--border-subtle)] bg-[var(--app-surface-muted)] p-3">
                <img
                  src="/claude-8-tools-in-claude.png"
                  alt={t('about.claudeStep8Alt')}
                  className="mx-auto rounded-lg border border-[var(--border-subtle)] bg-white"
                />
                <p className="mt-3 text-sm text-[var(--text-secondary)]">
                  {t('about.claudeStep8Text')}
                </p>
              </article>
            </div>

            <article className="rounded-xl border border-[var(--border-subtle)] bg-[var(--app-surface-muted)] p-3">
              <img
                src="/claude-9-demo1.png"
                alt={t('about.claudeDemoAlt')}
                className="mx-auto w-full max-w-[720px] rounded-lg border border-[var(--border-subtle)] bg-white"
              />
              <p className="mt-3 text-sm text-[var(--text-secondary)]">
                {t('about.claudeDemoText1')}
              </p>
            </article>

            <article className="rounded-xl border border-[var(--border-subtle)] bg-[var(--app-surface-muted)] p-3">
              <img
                src="/claude-9-demo2.png"
                alt={t('about.claudeDemoAlt')}
                className="mx-auto w-full max-w-[720px] rounded-lg border border-[var(--border-subtle)] bg-white"
              />
              <p className="mt-3 text-sm text-[var(--text-secondary)]">
                {t('about.claudeDemoText2')}
              </p>
            </article>
          </div>
        </div>
      </details>

      <details className="surface-card overflow-hidden p-0">
        <summary className="list-none cursor-pointer p-5 text-left [&::-webkit-details-marker]:hidden">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="m-0 text-base font-semibold text-[var(--text-primary)]">{t('about.mcpHeading')}</p>
              <p className="m-0 mt-1 text-sm text-[var(--text-secondary)]">{t('about.mcpIntro')}</p>
            </div>
            <span className="text-xl text-[var(--text-primary)]">+</span>
          </div>
        </summary>

        <div className="border-t border-[var(--border-subtle)] px-5 pb-5 pt-4">
          <div className="space-y-4">
            <article className="rounded-xl border border-[var(--border-subtle)] bg-[var(--app-surface-muted)] p-3">
              <img
                src="/mcp-add-connector.png"
                alt={t('about.mcpConnectorAlt')}
                className="mx-auto rounded-lg border border-[var(--border-subtle)] bg-white"
              />
              <p className="mt-3 text-sm text-[var(--text-secondary)]">
                {t('about.mcpConnectorText', { url: `${window.location.origin}/mcp` })}
              </p>
            </article>

            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--app-surface-muted)] p-3">
              <p className="mb-3 font-semibold text-[var(--text-primary)]">{t('about.mcpAdvancedTitle')}</p>
              <p className="text-sm text-[var(--text-secondary)]">{t('about.mcpAdvancedIntro')}</p>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div>
                  <img
                    src="/mcp-create-token.png"
                    alt={t('about.mcpTokenAlt')}
                    className="mx-auto rounded-lg border border-[var(--border-subtle)] bg-white"
                  />
                  <p className="mt-3 text-sm text-[var(--text-secondary)]">{t('about.mcpTokenText')}</p>
                </div>
                <div>
                  <img
                    src="/mcp-advanced-config.png"
                    alt={t('about.mcpAdvancedAlt')}
                    className="mx-auto rounded-lg border border-[var(--border-subtle)] bg-white"
                  />
                  <p className="mt-3 text-sm text-[var(--text-secondary)]">{t('about.mcpAdvancedText')}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </details>

      <details className="surface-card overflow-hidden p-0">
        <summary className="list-none cursor-pointer p-5 text-left [&::-webkit-details-marker]:hidden">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="m-0 text-base font-semibold text-[var(--text-primary)]">{t('about.hermesHeading')}</p>
              <p className="m-0 mt-1 text-sm text-[var(--text-secondary)]">{t('about.hermesIntro')}</p>
            </div>
            <span className="text-xl text-[var(--text-primary)]">+</span>
          </div>
        </summary>

        <div className="border-t border-[var(--border-subtle)] px-5 pb-5 pt-4">
          <p className="mb-3 text-sm text-[var(--text-secondary)]">{t('about.hermesInstructions')}</p>
          <pre className="overflow-x-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--app-surface-muted)] p-4 text-sm text-[var(--text-primary)]"><code>{t('about.hermesCommand')}</code></pre>
          <p className="mb-3 mt-4 text-sm text-[var(--text-secondary)]">{t('about.hermesConfigInfo')}</p>
          <pre className="overflow-x-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--app-surface-muted)] p-4 text-sm text-[var(--text-primary)]"><code>{t('about.hermesConfig')}</code></pre>
        </div>
      </details>
        </div>
      </main>
    </div>
  );
}
