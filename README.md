# blockscan — сканер блокировок провайдера

Определяет, какие сайты и приложения блокирует провайдер, каким способом
(DNS, IP, SNI/DPI, HTTP, QUIC), группирует их по категориям и сервисам и
готовит hostlist-файлы для [zapret](https://github.com/bol-van/zapret).
Добавление в рабочий список zapret — только после подтверждения пользователем.

Python 3.9+, без внешних зависимостей. Windows и Linux. Есть CLI и веб-интерфейс на localhost.

## Установка

```bash
git clone <repo> && cd <repo>
pip install .            # появится команда blockscan
# или без установки:
python -m blockscan --help
```

Сканер сам открывает TCP/UDP-соединения, поэтому запускайте его на машине,
где zapret/VPN **выключены** (иначе вы проверите обход, а не провайдера).

### Windows: готовый exe

`blockscan.exe` не требует Python. Двойной щелчок запускает веб-интерфейс в браузере.
Из консоли работают все команды: `blockscan.exe scan`, `blockscan.exe show` и т.д.
Собрать самому: `packaging\build_exe.bat` (нужен Python), либо запустить workflow
«Windows exe» в GitHub Actions.

## Быстрый старт

```bash
blockscan scan --isp "Ростелеком"           # все сервисы из встроенной базы (72 сервиса)
blockscan scan -c messengers -c video       # по категориям
blockscan scan -s Telegram -d example.org   # сервис + свои домены
blockscan show                              # дерево «категория → сервис → домены»
blockscan recommend                         # что делать с каждым типом блокировки
blockscan web                               # веб-интерфейс http://127.0.0.1:8765
```

## Как определяется блокировка

Для каждого домена IP берутся из **эталонного DNS** (DoH/DoT: 1.1.1.1, 8.8.8.8, 9.9.9.9),
поэтому проверки не зависят от DNS провайдера и типы блокировок не маскируют друг друга.

| Проверка | Что сравнивается | Вывод |
|---|---|---|
| DNS | системный резолвер vs DoH/DoT | NXDOMAIN, заглушка (частный/указанный IP), чужой сертификат на «подменном» IP → **DNS** |
| UDP/53 к 8.8.8.8 | ответ vs эталон | пометка «провайдер перехватывает DNS» |
| TCP 443/80 | соединение с настоящим IP | таймаут/отказ при живых контрольных узлах → **IP** |
| TLS | рукопожатие с SNI vs без SNI | с SNI обрыв (RST/EOF/таймаут), без SNI сервер отвечает → **SNI/DPI** |
| HTTPS-данные | GET после рукопожатия | обрыв данных или «заморозка» потока на ~16 КБ → **SNI/DPI** (замедление ТСПУ) |
| HTTP | Host: домен vs нейтральный Host | блок-страница/редирект на неё или обрыв только для домена → **HTTP** |
| QUIC | пакет Version Negotiation на UDP 443 | сервис использует HTTP/3, контрольный узел отвечает, а он нет → **QUIC** |
| IP сервиса | TCP к адресам из базы (DC Telegram) | все недоступны → **IP** |

Отличие блокировки от сбоя:
- перед сканом проверяются контрольные узлы и эталонный DNS; без них скан не начнётся;
- подозрительный домен перепроверяется (`attempts`, по умолчанию 3); разные
  результаты → статус **нестабилен**;
- «TLS не проходит ни с SNI, ни без» — статус **ошибка/неясно**, а не блокировка.

Статусы: доступен, заблокирован, нестабилен, ошибка/неясно.

**Ограничение:** блокировку по IP нельзя отличить от «сервер лежит» без внешней точки
проверки. Если сомневаетесь, откройте сайт через VPN или повторите скан позже.
QUIC-проверка ловит блокировку UDP/443 целиком, а фильтрацию по SNI внутри QUIC не видит.

## Источники целей

```bash
blockscan import citizenlab --country ru [--global]   # Citizen Lab test-lists
blockscan import antifilter --limit 2000              # домены из реестра (antifilter.download)
blockscan import file my.txt --category news          # txt (по строке) или csv
blockscan scan --targets                               # проверить импортированное
```

База «сервис → домены/IP»: `blockscan services list|show <имя>`.
Свои сервисы: `blockscan services add "Мой сервис" --category other --domain a.com --domain cdn-a.net`
или `blockscan services edit` (покажет путь к JSON для ручного редактирования).

## Отчёты и история

```bash
blockscan history                 # все сканы (SQLite)
blockscan diff                    # «было → стало» между двумя последними сканами
blockscan export -f html|csv|json -o report.html
```

Каждый скан привязан к дате и провайдеру (`--isp`, или `--detect-isp` через ipinfo.io:
этому сервису уйдёт ваш внешний IP, поэтому флаг нужно указать явно).

## zapret

```bash
blockscan config set zapret.hostlist_path /opt/zapret/ipset/zapret-hosts-user.txt   # Linux
blockscan config set zapret.hostlist_path C:\zapret\lists\list-general.txt          # Windows

blockscan zapret suggest     # предложения «добавить в список» (только SNI/DPI, HTTP, QUIC)
blockscan zapret review      # подтвердить по сервисам: y / n / s / q
blockscan zapret apply       # записать подтверждённое (резервная копия файла делается автоматически)
# перезапустите zapret
blockscan zapret verify      # повторная проверка: помогло ли
blockscan zapret export --by category -o lists/   # hostlist-файлы по категориям или сервисам
```

- Для известного сервиса в список попадают все его домены, включая CDN
  (YouTube → youtube.com, googlevideo.com, ytimg.com…).
- DNS-блокировки zapret не обходит, поэтому совет — DoH/DoT. Для блокировки по IP — VPN или прокси.
- `blockscan recommend` подсказывает стартовые параметры nfqws/winws (fake/split/disorder).
  Рабочую стратегию под конкретного провайдера подбирает `blockcheck` из комплекта zapret.
- Белый список (не добавлять никогда): `blockscan lists exclude add sberbank.ru`.
  Чёрный (добавлять всегда): `blockscan lists include add example.org`.

## Настройки

`blockscan config show`, `blockscan config set <ключ> <значение>`. Основные ключи:

| Ключ | По умолчанию | |
|---|---|---|
| `threads` | 8 | потоков |
| `rps` | 5 | общий лимит запросов в секунду (чтобы не выглядеть как атака) |
| `timeout` | 5 | таймаут одной проверки, с |
| `attempts` | 3 | попыток для подозрительных доменов |
| `quic` | true | QUIC для сервисов с HTTP/3; `"all"` — для всех |
| `reference_dns` | Cloudflare/Google/Quad9 DoH+DoT | эталонные резолверы |
| `dns_stub_ips` | [] | известные IP заглушек вашего провайдера |
| `blockpage_patterns` | [] | дополнительные regex для блок-страниц |

Данные хранятся локально: `~/.config/blockscan/` (Linux) или `%APPDATA%\blockscan` (Windows),
переопределяется переменной `BLOCKSCAN_HOME`. Лог: `blockscan.log`.

## Приватность

Телеметрии нет. Наружу уходят только сами проверки: соединения с проверяемыми
сайтами и запросы к эталонным DoH/DoT-серверам. Загрузка внешних списков
(`import`) и определение провайдера (`--detect-isp`) запускаются только явной командой.

Используйте программу только в своей сети и в рамках законодательства.

## Тесты

```bash
pip install pytest && pytest
```

Интеграционный тест поднимает локальные серверы, которые ведут себя как DPI
провайдера (RST по SNI, «заморозка» потока, редирект на блок-страницу), и прогоняет полный цикл проверки.
