#!/bin/sh
# Установка игры на Linux-сервер с nginx.
#   sudo ./deploy/install.sh                  — сайт на порту 8080 (http://IP:8080), другие сайты не трогаются
#   sudo ./deploy/install.sh motel.example.ru — сайт на домене (порт 80), потом можно включить HTTPS
#   sudo ./deploy/install.sh --files-only     — только скопировать игру, чтобы подключить папкой к своему сайту
# Повторный запуск после git pull обновляет игру.
set -eu

DOMAIN="${1:-}"
PORT="${PORT:-8080}"
WEBROOT="${WEBROOT:-/var/www/motel}"
SRC="$(cd "$(dirname "$0")/.." && pwd)"

[ "$(id -u)" -eq 0 ] || { echo "Запусти через sudo: sudo $0 $*"; exit 1; }

# nginx
if ! command -v nginx >/dev/null 2>&1; then
  echo "→ Устанавливаю nginx"
  if command -v apt-get >/dev/null; then
    # не даём nginx стартовать с заглушкой на порту 80 во время установки — он может быть занят
    NOSTART=0; [ -e /usr/sbin/policy-rc.d ] || { printf '#!/bin/sh\nexit 101\n' > /usr/sbin/policy-rc.d; chmod +x /usr/sbin/policy-rc.d; NOSTART=1; }
    apt-get update -qq && apt-get install -y -qq nginx
    [ "$NOSTART" = 1 ] && rm -f /usr/sbin/policy-rc.d
  elif command -v dnf >/dev/null; then dnf install -y nginx
  elif command -v yum >/dev/null; then yum install -y nginx
  elif command -v pacman >/dev/null; then pacman -Sy --noconfirm nginx
  else echo "Не знаю, как поставить nginx на этой системе. Поставь вручную и запусти скрипт снова."; exit 1; fi
  # заглушка «Welcome to nginx» на порту 80 не нужна и может мешать другим сайтам
  rm -f /etc/nginx/sites-enabled/default
fi

# файлы игры
echo "→ Копирую игру в $WEBROOT"
mkdir -p "$WEBROOT"
rm -rf "$WEBROOT/css" "$WEBROOT/js" "$WEBROOT/fonts" "$WEBROOT/icons"
cp -r "$SRC/index.html" "$SRC/css" "$SRC/js" "$SRC/fonts" "$SRC/icons" "$WEBROOT/"
find "$WEBROOT" -type d -exec chmod 755 {} +
find "$WEBROOT" -type f -exec chmod 644 {} +

if [ "$DOMAIN" = "--files-only" ]; then
  echo
  echo "Игра скопирована в $WEBROOT. Чтобы она открывалась на твоём сайте по адресу /motel/,"
  echo "добавь в блок server {…} своего сайта (обычно /etc/nginx/sites-available/…):"
  echo
  echo "    location /motel/ {"
  echo "        alias $WEBROOT/;"
  echo "        try_files \$uri \$uri/ =404;"
  echo "    }"
  echo
  echo "Затем: sudo nginx -t && sudo systemctl reload nginx"
  exit 0
fi

# конфиг сайта
if [ -n "$DOMAIN" ]; then LISTEN=80; NAME="$DOMAIN"; else LISTEN="$PORT"; NAME="_"; fi
if [ -d /etc/nginx/sites-available ]; then
  CONF=/etc/nginx/sites-available/motel.conf
  ln -sf "$CONF" /etc/nginx/sites-enabled/motel.conf
else
  CONF=/etc/nginx/conf.d/motel.conf
fi
# IPv6 включаем, только если он есть на сервере — иначе nginx не стартует
if [ -f /proc/net/if_inet6 ]; then V6=''; else V6='/\[::\]/d'; fi
sed -e "s/LISTEN/$LISTEN/g" -e "s/SERVER_NAME/$NAME/" -e "s#ROOT#$WEBROOT#" -e "${V6:-s/^\$//}" "$SRC/deploy/nginx-motel.conf" > "$CONF"
echo "→ Конфиг: $CONF"

command -v restorecon >/dev/null 2>&1 && restorecon -R "$WEBROOT" || true   # SELinux (CentOS, Fedora)

nginx -t
if [ -d /run/systemd/system ]; then
  systemctl enable --now nginx
  systemctl reload nginx
else
  nginx -s reload 2>/dev/null || nginx
fi

echo
if [ -n "$DOMAIN" ]; then
  echo "Готово: http://$DOMAIN"
  echo "HTTPS (бесплатный сертификат):  sudo apt install certbot python3-certbot-nginx && sudo certbot --nginx -d $DOMAIN"
else
  IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
  echo "Готово: http://${IP:-IP-сервера}:$LISTEN"
  echo "Если не открывается — открой порт:  sudo ufw allow $LISTEN/tcp"
fi
