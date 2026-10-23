#!/usr/bin/env bash
# Нефритовое Го — установка на Kali Linux (и любой Debian/Ubuntu с systemd) как системный сервис.
#
#   sudo ./deploy/install.sh               # порт 8080
#   sudo ./deploy/install.sh --port 80     # обычный веб-порт
#   sudo ./deploy/install.sh --uninstall   # удалить сервис и файлы
#
# Ставит игру в /opt/jade-go, запускает её от отдельного пользователя без прав (jadego)
# через systemd: автозапуск при загрузке, перезапуск при сбое, логи в journalctl.
set -euo pipefail

APP=jade-go
DEST=/opt/$APP
USER_NAME=jadego
UNIT=/etc/systemd/system/$APP.service
PORT=8080
HOST=0.0.0.0
MODE=install

while [ $# -gt 0 ]; do
  case "$1" in
    --port) PORT="$2"; shift 2 ;;
    --host) HOST="$2"; shift 2 ;;
    --uninstall) MODE=uninstall; shift ;;
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
    *) echo "Неизвестный параметр: $1" >&2; exit 1 ;;
  esac
done

if [ "$(id -u)" -ne 0 ]; then echo "Запустите через sudo: sudo $0 $*" >&2; exit 1; fi
case "$PORT" in ''|*[!0-9]*) echo "Порт должен быть числом" >&2; exit 1 ;; esac

if [ "$MODE" = uninstall ]; then
  systemctl disable --now "$APP" 2>/dev/null || true
  rm -f "$UNIT"; systemctl daemon-reload
  rm -rf "$DEST"
  id "$USER_NAME" >/dev/null 2>&1 && userdel "$USER_NAME" 2>/dev/null || true
  echo "Нефритовое Го удалено."
  exit 0
fi

SRC="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "$SRC/site/index.html" ] || { echo "Не найдена папка site/ рядом с deploy/ — запускайте из клона репозитория" >&2; exit 1; }

if ! command -v python3 >/dev/null; then
  echo "Ставлю python3…"; apt-get update -qq && apt-get install -y -qq python3
fi

id "$USER_NAME" >/dev/null 2>&1 || useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin "$USER_NAME"

install -d -m 755 "$DEST"
rm -rf "$DEST/site" "$DEST/server"
cp -r "$SRC/site" "$SRC/server" "$DEST/"
chown -R root:root "$DEST"; chmod -R a+rX "$DEST"

# ports below 1024 need a capability, granted to the service only
CAPS=""
if [ "$PORT" -lt 1024 ]; then CAPS=$'AmbientCapabilities=CAP_NET_BIND_SERVICE\nCapabilityBoundingSet=CAP_NET_BIND_SERVICE'; else CAPS='CapabilityBoundingSet='; fi

cat > "$UNIT" <<EOF
[Unit]
Description=Jade Go (Нефритовое Го) web server
After=network-online.target
Wants=network-online.target

[Service]
User=$USER_NAME
Group=$USER_NAME
Environment=JADEGO_HOST=$HOST
Environment=JADEGO_PORT=$PORT
Environment=JADEGO_DIR=$DEST/site
Environment=PYTHONUNBUFFERED=1
ExecStart=/usr/bin/env python3 $DEST/server/serve.py
Restart=on-failure
RestartSec=2
$CAPS
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
PrivateDevices=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectControlGroups=yes
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
RestrictNamespaces=yes
LockPersonality=yes
MemoryDenyWriteExecute=yes
SystemCallArchitectures=native

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now "$APP"
sleep 1

# open the port if a firewall is active
if command -v ufw >/dev/null && ufw status 2>/dev/null | grep -q "Status: active"; then
  ufw allow "$PORT"/tcp >/dev/null && echo "ufw: открыт порт $PORT/tcp"
fi

if systemctl is-active --quiet "$APP"; then
  echo
  echo "Готово. Нефритовое Го работает как сервис «$APP»."
  echo "  На этом компьютере:  http://localhost:$PORT/"
  for ip in $(hostname -I 2>/dev/null); do case "$ip" in *:*) ;; *) echo "  В локальной сети:    http://$ip:$PORT/";; esac; done
  echo
  echo "Управление:  systemctl status|restart|stop $APP     Логи:  journalctl -u $APP -f"
else
  echo "Сервис не запустился. Смотрите:  journalctl -u $APP -n 50" >&2
  exit 1
fi
