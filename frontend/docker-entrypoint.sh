#!/bin/sh
cat > /usr/share/nginx/html/config.js << JSEOF
window.__kvittConfig = {
  tagline: "${VITE_TAGLINE:-}",
  language: "${KVITT_LANGUAGE:-sv-se}"
};
JSEOF
exec nginx -g "daemon off;"
