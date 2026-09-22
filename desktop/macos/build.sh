#!/bin/sh
# Builds CursorFX.app (menu bar overlay app) from the Swift source and the web bundle.
set -e
cd "$(dirname "$0")"
APP=build/CursorFX.app
rm -rf build
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp Info.plist "$APP/Contents/"
cp overlay.html "$APP/Contents/Resources/"
cp ../../dist/cursorfx.js "$APP/Contents/Resources/"
swiftc -swift-version 5 -O -framework Cocoa -framework WebKit -framework SwiftUI -o "$APP/Contents/MacOS/CursorFX" Sources/main.swift
codesign --force --sign - "$APP" >/dev/null 2>&1 || true
echo "built $APP"

# ./build.sh install  -> also replace the copy in /Applications and relaunch it,
# so the login item keeps pointing at a bundle that rebuilds do not delete.
if [ "${1:-}" = "install" ]; then
  pkill -x CursorFX 2>/dev/null || true
  sleep 1
  rm -rf /Applications/CursorFX.app
  ditto "$APP" /Applications/CursorFX.app
  open /Applications/CursorFX.app
  echo "installed to /Applications/CursorFX.app and launched"
fi
