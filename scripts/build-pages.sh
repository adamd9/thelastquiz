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
# No _redirects file on purpose. Cloudflare Pages' native routing already does
# exactly what we need, and a hand-rolled _redirects here caused an
# ERR_TOO_MANY_REDIRECTS loop on /admin:
#   * Pages serves admin.html at the clean URL /admin and 308-redirects
#     /admin.html -> /admin. An explicit "/admin /admin.html 200" proxy fought
#     that auto-redirect (/admin -> /admin.html -> 308 /admin -> ... forever).
#   * A "/* /index.html 200" SPA proxy self-loops too (Pages strips /index -> /
#     -> matches /* again); modern wrangler flags it as an infinite loop.
# Instead we rely on Pages' documented defaults: route matching serves
# admin.html at /admin and real assets at /static/*, while the built-in SPA
# fallback (active because there is no top-level 404.html) serves index.html for
# unmatched client routes (/create-run, /run/<id>, ...).
cp "$web/index.html" "$dist/app/index.html"
cp "$web/admin.html" "$dist/app/admin.html"

# --- Public site (rankings.<domain> / apex): home.html IS the root ---
# home.html is served at /, and rankings.html is served at the clean URL
# /rankings (Cloudflare Pages serves a file named rankings.html at /rankings,
# exactly like admin.html at /admin). No _redirects file: rankings.json is a
# real asset and Pages' built-in SPA fallback (no 404.html) covers unknown paths.
cp "$web/home.html" "$dist/rankings/index.html"
cp "$web/rankings.html" "$dist/rankings/rankings.html"

# SEO content pages: the guides hub + long-form articles, served at clean URLs
# (e.g. /dark-triad-ai) exactly like rankings.html at /rankings.
for f in guides dark-triad-ai big-five-ai mbti-ai; do
  cp "$web/$f.html" "$dist/rankings/$f.html"
done

# Crawl files for the public site (robots + sitemap point at the apex).
cp "$web/robots.txt" "$dist/rankings/robots.txt"
cp "$web/sitemap.xml" "$dist/rankings/sitemap.xml"

# Snapshot the rankings into the bundle so the public page is served entirely
# from Cloudflare's CDN (no backend call per visit). Refreshed on every deploy;
# the page falls back to the live API if this snapshot is missing.
api="${RANKINGS_API_BASE:-https://thelastquiz.drop37.com}"
if curl -fsS --max-time 25 "$api/api/rankings" -o "$dist/rankings/rankings.json"; then
  echo "  snapshot: dist/rankings/rankings.json ($(wc -c <"$dist/rankings/rankings.json" | tr -d ' ') bytes)"
else
  rm -f "$dist/rankings/rankings.json"
  echo "  snapshot: WARNING could not reach $api/api/rankings; page will use the live API"
fi

# Cache policy for the snapshot: browsers cache briefly then revalidate against
# the CDN (never the backend); new deploys purge the edge cache so data updates.
cat > "$dist/rankings/_headers" <<'EOF'
/rankings.json
  Cache-Control: public, max-age=60, stale-while-revalidate=86400
EOF

# Optional favicon passthrough.
for d in "$dist/app" "$dist/rankings"; do
  [ -f "$web/favicon.ico" ] && cp "$web/favicon.ico" "$d/favicon.ico" || true
done

echo "Built:"
echo "  $dist/app       (app.<domain>)"
echo "  $dist/rankings  (rankings.<domain>)"
