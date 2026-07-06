#!/usr/bin/env bash
# Build two static bundles for Cloudflare Pages from web/ — one repo, two Pages
# projects. Configure each Pages project with:
#   Build command:  bash scripts/build-pages.sh
#   Output dir:     dist/app        (for app.<domain>  — the main SPA + admin)
#                   dist/rankings   (for rankings.<domain> — the public rankings)
#
# The frontend calls the API on Azure (thelastquiz.drop37.com) via the
# host-derived window.API_BASE in static/site-links.js, so these bundles are
# fully static and need no backend of their own.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
web="$root/web"
dist="$root/dist"

rm -rf "$dist"
mkdir -p "$dist/app" "$dist/rankings"

# Shared static assets (JS/CSS/images) go into both bundles.
cp -R "$web/static" "$dist/app/static"
cp -R "$web/static" "$dist/rankings/static"

# --- App SPA (app.<domain>) ---
cp "$web/index.html" "$dist/app/index.html"
cp "$web/admin.html" "$dist/app/admin.html"
cat > "$dist/app/_redirects" <<'EOF'
/admin   /admin.html   200
/*       /index.html   200
EOF

# --- Public rankings (rankings.<domain>): rankings.html IS the site root ---
cp "$web/rankings.html" "$dist/rankings/index.html"
cat > "$dist/rankings/_redirects" <<'EOF'
/*   /index.html   200
EOF

# Optional favicon passthrough.
for d in "$dist/app" "$dist/rankings"; do
  [ -f "$web/favicon.ico" ] && cp "$web/favicon.ico" "$d/favicon.ico" || true
done

echo "Built:"
echo "  $dist/app       (app.<domain>)"
echo "  $dist/rankings  (rankings.<domain>)"
