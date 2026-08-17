#!/bin/sh
cat > /usr/share/nginx/html/config.js << JSEOF
window.__kvittConfig = {
  tagline: "${VITE_TAGLINE:-}",
  language: "${KVITT_LANGUAGE:-sv-se}",
  phoneEnabled: "${KVITT_PHONE_ENABLED:-true}",
  phoneFormat: "${KVITT_PHONE_FORMAT:-swedish}",
  githubIssuesUrl: "${KVITT_GITHUB_ISSUES_URL:-https://github.com/rikardronnkvist/kvitt/issues/new}"
};
JSEOF
exec nginx -g "daemon off;"
