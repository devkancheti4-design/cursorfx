#!/bin/sh
# Bundles the core and every plugin into dist/cursorfx.js (no dependencies, no transpiling).
set -e
cd "$(dirname "$0")"
OUT=dist/cursorfx.js
mkdir -p dist
{
  echo "/*! CursorFX $(node -p "require('./package.json').version" 2>/dev/null || echo 0.1.0) | MIT | https://github.com/devkancheti4-design/cursorfx */"
  cat src/core.js src/util.js
  for f in src/cursors/*.js src/trails/*.js src/clicks/*.js; do
    echo ""
    echo "/* ---- $f ---- */"
    cat "$f"
  done
} > "$OUT"
node --check "$OUT"
cp "$OUT" extension/cursorfx.js
if command -v zip >/dev/null 2>&1; then
  rm -f dist/cursorfx-extension.zip
  (cd extension && zip -qr ../dist/cursorfx-extension.zip . -x '.*')
fi
echo "built $OUT ($(wc -c < "$OUT" | tr -d ' ') bytes), extension/cursorfx.js and dist/cursorfx-extension.zip"
