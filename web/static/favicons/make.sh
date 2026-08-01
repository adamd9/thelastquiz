#!/bin/bash
# Regenerate all favicon raster assets from the source SVGs.
#   web/static/favicon.svg            -> canonical (rounded-tile) icon
#   web/static/favicons/_src-fullbleed.svg -> full-bleed source for iOS/PWA icons
# Outputs land in web/static/ (served at /static/*) and web/favicon.ico (site root).
set -e
cd "$(dirname "$0")"          # web/static/favicons
static=".."                   # web/static
webroot="../.."               # web

# Legacy multi-resolution .ico at the site root, built from throwaway PNG renders.
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
rsvg-convert -w 16 -h 16 "$static/favicon.svg" -o "$tmp/16.png"
rsvg-convert -w 32 -h 32 "$static/favicon.svg" -o "$tmp/32.png"
rsvg-convert -w 48 -h 48 "$static/favicon.svg" -o "$tmp/48.png"
magick "$tmp/16.png" "$tmp/32.png" "$tmp/48.png" "$webroot/favicon.ico"

# Full-bleed icons for iOS home screen and PWA/Android (corners get masked).
rsvg-convert -w 180 -h 180 _src-fullbleed.svg -o "$static/apple-touch-icon.png"
rsvg-convert -w 192 -h 192 _src-fullbleed.svg -o "$static/icon-192.png"
rsvg-convert -w 512 -h 512 _src-fullbleed.svg -o "$static/icon-512.png"

echo "generated:"
ls -la "$static/favicon.svg" "$static/apple-touch-icon.png" \
       "$static/icon-192.png" "$static/icon-512.png" "$webroot/favicon.ico"
