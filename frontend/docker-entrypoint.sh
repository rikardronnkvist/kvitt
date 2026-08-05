#!/bin/sh
cat > /usr/share/nginx/html/config.js << JSEOF
window.__kvittConfig = {
  tagline: "${VITE_TAGLINE:-}",
  language: "${KVITT_LANGUAGE:-sv-se}",
  phoneEnabled: "${KVITT_PHONE_ENABLED:-true}",
  phoneFormat: "${KVITT_PHONE_FORMAT:-swedish}"
};
JSEOF
exec nginx -g "daemon off;"
