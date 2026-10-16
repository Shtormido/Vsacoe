#!/bin/sh
# Запуск MP3UP на локальном сервере (macOS, Linux).
cd "$(dirname "$0")" || exit 1
PORT=8737
URL="http://127.0.0.1:$PORT"
if command -v python3 >/dev/null 2>&1; then PY=python3
elif command -v python >/dev/null 2>&1; then PY=python
else echo "Для запуска нужен Python 3: https://www.python.org/downloads/"; exit 1
fi
( sleep 1
  if command -v open >/dev/null 2>&1; then open "$URL"
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL"
  fi ) &
echo "MP3UP открыт: $URL — нажмите «Установить» вверху страницы. Ctrl+C — остановить."
exec "$PY" -m http.server "$PORT" --bind 127.0.0.1
