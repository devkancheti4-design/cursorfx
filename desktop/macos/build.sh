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
swiftc -swift-version 5 -O -framework Cocoa -framework WebKit -o "$APP/Contents/MacOS/CursorFX" Sources/main.swift
codesign --force --sign - "$APP" >/dev/null 2>&1 || true
echo "built $APP"
