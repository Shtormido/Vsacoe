# Нефритовое Го

Игра го в браузере: 3D-стол в семи местах, бот четырёх уровней, обучение, задачи дня, живой звук и спокойная музыка.

```
site/            игра (index.html) и локальные библиотеки и шрифты (vendor/)
server/serve.py  веб-сервер на Python 3, без зависимостей
deploy/          установка сервиса для Kali Linux, пример настройки nginx
```

## Быстрый запуск на Kali Linux

Python 3 в Kali уже есть, больше ничего ставить не нужно.

```bash
git clone -b jade-go https://github.com/Shtormido/Vsacoe.git jade-go
cd jade-go
python3 server/serve.py
```

Сервер покажет адреса, по которым открывать игру:

```
Нефритовое Го: раздаю /home/kali/jade-go/site
  http://localhost:8080/
  http://192.168.1.50:8080/     ← с телефона или другого компьютера в той же сети
```

Другой порт или только локальный доступ: `python3 server/serve.py --port 8000 --host 127.0.0.1`.

## Как постоянный сервис

```bash
sudo ./deploy/install.sh              # порт 8080
sudo ./deploy/install.sh --port 80    # обычный веб-порт, адрес без :8080
```

Установщик кладёт игру в `/opt/jade-go` и запускает её от отдельного пользователя `jadego` без прав, с ограничениями systemd. Сервис стартует при загрузке и перезапускается при сбое. Если включён `ufw`, порт откроется сам.

| Действие | Команда |
|---|---|
| Состояние | `systemctl status jade-go` |
| Перезапуск / остановка | `sudo systemctl restart jade-go` / `sudo systemctl stop jade-go` |
| Логи | `journalctl -u jade-go -f` |
| Обновить игру | `git pull && sudo ./deploy/install.sh` |
| Удалить | `sudo ./deploy/install.sh --uninstall` |
| Проверка работы | `curl http://localhost:8080/healthz` → `ok` |

## Через nginx и HTTPS

Если на сервере уже есть nginx или нужен домен с HTTPS, используйте `deploy/nginx-jade-go.conf`. Команды установки написаны в начале файла.

- **nginx** — быстрый веб-сервер: `sudo apt install nginx`.
- **Certbot** — бесплатный HTTPS-сертификат Let's Encrypt: <https://certbot.eff.org/>, установка `sudo apt install certbot python3-certbot-nginx`.

## Доступ из интернета

- **Проброс порта на роутере:** внешний порт → IP сервера и порт 8080 (или 80).
- **Без белого IP:**
  - **Cloudflare Tunnel** — бесплатный туннель без открытия портов: <https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/>, затем `cloudflared tunnel --url http://localhost:8080`.
  - **ngrok** — то же самое, проще для быстрой проверки: <https://ngrok.com/download>, затем `ngrok http 8080`.

## Что умеет сервер

- Раздаёт только папку `site/`: содержимое папок не показывает, скрытые файлы и выход за пределы папки отдаёт как 404.
- Сжимает HTML, JS и CSS (gzip): страница весит 90 КБ вместо 275 КБ.
- Ставит заголовки безопасности (CSP, nosniff, Referrer-Policy) и кэширование: библиотеки кэшируются на 30 дней, сама игра проверяется при каждом заходе, чтобы обновление сразу доходило до игроков.
- Работает без интернета: three.js и шрифты лежат в `site/vendor/`.

## Если что-то не так

| Сообщение или симптом | Что сделать |
|---|---|
| «порт уже занят» | Найти, кто держит порт: `sudo ss -ltnp \| grep 8080`. Или запустить на другом: `--port 8000`. |
| «Нет прав на порт» | Порты ниже 1024 требуют root: используйте `sudo ./deploy/install.sh --port 80` или порт 8080. |
| С телефона не открывается | Телефон и сервер должны быть в одной сети. Проверьте файрвол: `sudo ufw allow 8080/tcp`. |
| Не работает как сервис | Смотрите `journalctl -u jade-go -n 50`. |

Сохранения, статистика и настройки хранятся в браузере каждого игрока (localStorage), сервер их не собирает.

`site/index.html` можно открыть и без сервера, двойным щелчком: тогда библиотеки загрузятся из интернета.
