#!/bin/sh
# Обновление игры на сервере одной командой:  sudo sh deploy/update.sh
# Скачивает свежую версию ветки, переустанавливает игру на тот же порт и показывает версию до и после.
set -eu

BRANCH="${BRANCH:-Придорожный-Мотель}"
WEBROOT="${WEBROOT:-/var/www/motel}"
SRC="$(cd "$(dirname "$0")/.." && pwd)"
ver() { v=$(sed -n "s/^const GAME_VERSION = '\([^']*\)'.*/\1/p" "$1" 2>/dev/null || true); echo "${v:-старая, без номера}"; }

[ "$(id -u)" -eq 0 ] || { echo "Запусти через sudo: sudo sh $0"; exit 1; }
cd "$SRC"
git config --global --add safe.directory "$SRC" 2>/dev/null || true   # папку могли скачать от другого пользователя

echo "Сейчас на сайте: версия $(ver "$WEBROOT/js/state.js")"

# свежая версия; локальные правки в папке с игрой затираются — иначе git pull отказывается обновлять
echo "→ Скачиваю ветку $BRANCH"
git fetch origin "$BRANCH"
git checkout -q -f -B "$BRANCH" FETCH_HEAD
git reset -q --hard FETCH_HEAD
echo "→ В папке $SRC: версия $(ver js/state.js)"

# порт берём из уже установленного конфига, чтобы не угадывать
for c in /etc/nginx/sites-available/motel.conf /etc/nginx/conf.d/motel.conf; do
  [ -f "$c" ] || continue
  P=$(sed -n 's/^ *listen \([0-9][0-9]*\);.*/\1/p' "$c" | head -n1)
  N=$(sed -n 's/^ *server_name \([^;]*\);.*/\1/p' "$c" | head -n1)
  break
done
if [ -n "${N:-}" ] && [ "$N" != "_" ]; then
  sh deploy/install.sh "$N"
elif [ -d "$WEBROOT" ] && [ -z "${P:-}" ]; then
  sh deploy/install.sh --files-only     # игра подключена папкой к другому сайту
else
  PORT="${PORT:-${P:-8080}}" sh deploy/install.sh
fi

echo
echo "Готово. Теперь на сайте: версия $(ver "$WEBROOT/js/state.js")"
echo "В браузере нажми Ctrl+F5 — номер версии виден на главном экране игры."
