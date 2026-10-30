#!/usr/bin/env bash
# Сборка Windows-версии: game/ -> game.love -> PodFundamentom.exe (LÖVE 11.5 win64)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/release"
WORK="$(mktemp -d)"
LOVE_VER="11.5"
LOVE_ZIP="love-${LOVE_VER}-win64.zip"
LOVE_URL="https://github.com/love2d/love/releases/download/${LOVE_VER}/${LOVE_ZIP}"
NAME="PodFundamentom"

cd "$ROOT/game"
zip -9 -q -r "$WORK/game.love" . -x "src/selftest.lua"

if [ -n "${LOVE_ZIP_PATH:-}" ] && [ -f "$LOVE_ZIP_PATH" ]; then
  cp "$LOVE_ZIP_PATH" "$WORK/$LOVE_ZIP"
else
  curl -sSL -o "$WORK/$LOVE_ZIP" "$LOVE_URL"
fi
unzip -q "$WORK/$LOVE_ZIP" -d "$WORK"
SRC="$WORK/love-${LOVE_VER}-win64"
DIST="$WORK/$NAME"
mkdir -p "$DIST"
cat "$SRC/love.exe" "$WORK/game.love" > "$DIST/$NAME.exe"
cp "$SRC"/*.dll "$DIST/"
cp "$SRC/license.txt" "$DIST/LOVE-license.txt"
cp "$ROOT/game/assets/OFL-PodFont.txt" "$DIST/"
cp "$ROOT/build/README-windows.txt" "$DIST/README.txt"

mkdir -p "$OUT"
rm -f "$OUT/${NAME}_Windows.zip"
(cd "$WORK" && zip -9 -q -r "$OUT/${NAME}_Windows.zip" "$NAME")
cp "$WORK/game.love" "$OUT/${NAME}.love"
rm -rf "$WORK"
echo "Готово: $OUT/${NAME}_Windows.zip"
