#!/bin/sh
# Strip surrounding quotes if present (YAML may include them as literal chars)
tagline=$(echo "${VITE_TAGLINE:-}" | sed 's/^["']//;s/["']$//')
cat > /usr/share/nginx/html/config.js << JSEOF
window.__kvittConfig = {
  tagline: "$tagline"
};
JSEOF
exec nginx -g "daemon off;"
