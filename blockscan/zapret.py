"""Рекомендации для zapret: hostlist-файлы, стратегии обхода, применение только с подтверждением."""

from __future__ import annotations

import shutil
from datetime import datetime
from pathlib import Path

from blockscan.analyze import BLOCKED, DNS, DPI, HTTP, IP, QUIC, UNSTABLE
from blockscan.services import CATEGORIES, ServiceDB
from blockscan.storage import Storage

# Типы блокировок, которые zapret умеет обходить (десинхронизация DPI).
ZAPRET_TYPES = {DPI, HTTP, QUIC}

STRATEGIES = {
    DPI: {
        "title": "SNI/DPI — фильтрация по имени сайта в TLS",
        "zapret": True,
        "advice": "zapret помогает: десинхронизация DPI (fake / split / disorder) для TCP 443.",
        "examples": [
            "--filter-tcp=443 --hostlist={hostlist} --dpi-desync=fake,multidisorder "
            "--dpi-desync-split-pos=1,midsld --dpi-desync-fooling=badseq",
            "--filter-tcp=443 --hostlist={hostlist} --dpi-desync=fake,multisplit "
            "--dpi-desync-split-pos=1,sniext+1 --dpi-desync-fooling=md5sig",
            "--filter-tcp=443 --hostlist={hostlist} --dpi-desync=fakedsplit --dpi-desync-ttl=4",
        ],
    },
    HTTP: {
        "title": "HTTP — блок-страница или обрыв по заголовку Host",
        "zapret": True,
        "advice": "zapret помогает для TCP 80: split HTTP-запроса и/или модификация Host.",
        "examples": [
            "--filter-tcp=80 --hostlist={hostlist} --dpi-desync=fake,multisplit "
            "--dpi-desync-split-pos=method+2 --dpi-desync-fooling=md5sig",
            "--filter-tcp=80 --hostlist={hostlist} --hostcase --dpi-desync=multisplit --dpi-desync-split-pos=host+1",
        ],
    },
    QUIC: {
        "title": "QUIC / HTTP3 — блокировка UDP 443",
        "zapret": True,
        "advice": "zapret: fake-пакеты для UDP 443. Альтернатива — отключить QUIC в браузере "
                  "(chrome://flags/#enable-quic), тогда трафик пойдёт по TCP.",
        "examples": [
            "--filter-udp=443 --hostlist={hostlist} --dpi-desync=fake --dpi-desync-repeats=6",
        ],
    },
    DNS: {
        "title": "DNS — подмена ответа или NXDOMAIN",
        "zapret": False,
        "advice": "zapret DNS не исправляет. Включите шифрованный DNS (DoH/DoT): Windows 11 — "
                  "Параметры → Сеть → свойства адаптера → DNS → «Шифрование: только зашифрованный»; "
                  "браузер — «Безопасный DNS»; Linux — systemd-resolved (DNSOverTLS=yes) или dnscrypt-proxy. "
                  "Простая смена DNS на 8.8.8.8 не поможет, если провайдер перехватывает UDP/53.",
        "examples": [],
    },
    IP: {
        "title": "IP — адрес/порт недоступен",
        "zapret": False,
        "advice": "zapret не поможет: пакеты до IP не доходят. Нужен VPN или прокси "
                  "(либо проверьте, не лежит ли сам сервис — запустите повторный скан позже).",
        "examples": [],
    },
}


def _zapret_types(block_types: list[str]) -> list[str]:
    return [t for t in block_types if t in ZAPRET_TYPES]


def is_excluded(domain: str, exclude: list[str]) -> bool:
    d = domain.lower()
    return any(d == x or d.endswith("." + x) for x in (e.lower().strip(".") for e in exclude if e))


def hostlist_entries(result: dict, db: ServiceDB) -> list[str]:
    """Что добавить в hostlist для результата. zapret сам покрывает поддомены записи,
    поэтому для известного сервиса берём все его домены (включая CDN)."""
    svc = db.get(result["service"]) if result.get("service") else None
    if svc:
        return collapse(svc.domains)
    return [result["domain"]]


def collapse(domains: list[str]) -> list[str]:
    """Убирает записи, уже покрытые родительским доменом (yt3.ggpht.com при ggpht.com)."""
    uniq = sorted(set(d.lower() for d in domains))
    return [d for d in uniq if not any(d != p and d.endswith("." + p) for p in uniq)]


def recommendations(results: list[dict]) -> list[dict]:
    """Сводные рекомендации по типам блокировок, найденным в скане."""
    found: dict[str, list[str]] = {}
    for r in results:
        if r["status"] not in (BLOCKED, UNSTABLE):
            continue
        for t in r.get("block_types") or []:
            found.setdefault(t, []).append(r["domain"])
    out = []
    for t in (DPI, HTTP, QUIC, DNS, IP):
        if t in found:
            out.append({"type": t, "domains": sorted(set(found[t])), **STRATEGIES[t]})
    return out


def suggest(storage: Storage, scan_id: int, db: ServiceDB, cfg: dict) -> tuple[int, int]:
    """Формирует предложения «добавить в список». Возвращает (новых, пропущено исключениями)."""
    exclude = cfg.get("exclude") or []
    added = skipped = 0
    for r in storage.results(scan_id):
        if r["status"] not in (BLOCKED, UNSTABLE):
            continue
        kinds = _zapret_types(r["block_types"])
        if not kinds:
            continue
        for entry in hostlist_entries(r, db):
            if is_excluded(entry, exclude):
                skipped += 1
                continue
            added += storage.upsert_suggestion(entry, r.get("service"), r.get("category"), kinds, scan_id)
    for entry in cfg.get("include") or []:
        if not is_excluded(entry, exclude):
            svc = db.match(entry)
            added += storage.upsert_suggestion(entry, svc.name if svc else None,
                                               svc.category if svc else "other", ["вручную"], scan_id)
    return added, skipped


def read_hostlist(path: Path) -> list[str]:
    if not path.exists():
        return []
    out = []
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.split("#", 1)[0].strip().lower()
        if line:
            out.append(line)
    return out


def append_hostlist(path: Path, domains: list[str], header: str | None = None) -> tuple[list[str], Path | None]:
    """Дописывает домены без дублей. Перед изменением делает резервную копию."""
    path = Path(path)
    existing = set(read_hostlist(path))
    new = [d for d in dict.fromkeys(x.lower() for x in domains) if d not in existing]
    if not new:
        return [], None
    backup = None
    needs_newline = False
    if path.exists():
        backup = path.with_name(path.name + f".bak-{datetime.now():%Y%m%d-%H%M%S}")
        shutil.copy2(path, backup)
        data = path.read_bytes()
        needs_newline = bool(data) and not data.endswith(b"\n")
    else:
        path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "a", encoding="utf-8", newline="\n") as f:
        if needs_newline:
            f.write("\n")
        if header:
            f.write(f"# {header}\n")
        for d in new:
            f.write(d + "\n")
    return new, backup


def apply(storage: Storage, cfg: dict, domains: list[str]) -> tuple[list[str], Path | None]:
    """Записывает уже подтверждённые пользователем домены в hostlist zapret."""
    target = (cfg.get("zapret") or {}).get("hostlist_path")
    if not target:
        raise ValueError("не задан путь hostlist: blockscan config set zapret.hostlist_path <файл>")
    exclude = cfg.get("exclude") or []
    domains = [d for d in domains if not is_excluded(d, exclude)]
    new, backup = append_hostlist(Path(target), domains, header=f"blockscan {datetime.now():%Y-%m-%d %H:%M}")
    storage.set_suggestion_state(domains, "applied")
    exclude_path = (cfg.get("zapret") or {}).get("exclude_path")
    if exclude_path and exclude:
        append_hostlist(Path(exclude_path), exclude, header="blockscan: исключения")
    return new, backup


def export_hostlists(results: list[dict], db: ServiceDB, out_dir: Path, by: str = "category",
                     exclude: list[str] | None = None) -> dict[str, list[str]]:
    """Пишет hostlist-файлы для zapret по категориям или сервисам (только обходимые zapret типы)."""
    groups: dict[str, list[str]] = {}
    for r in results:
        if r["status"] not in (BLOCKED, UNSTABLE) or not _zapret_types(r.get("block_types") or []):
            continue
        if by == "service":
            key = r.get("service") or r["domain"]
        else:
            key = r.get("category") or "other"
        for entry in hostlist_entries(r, db):
            if not is_excluded(entry, exclude or []):
                groups.setdefault(key, []).append(entry)
    out_dir.mkdir(parents=True, exist_ok=True)
    written = {}
    all_entries: list[str] = []
    for key, entries in sorted(groups.items()):
        entries = sorted(set(entries))
        all_entries += entries
        fname = "zapret-" + _slug(key) + ".txt"
        title = CATEGORIES.get(key, key)
        (out_dir / fname).write_text(f"# {title}\n" + "\n".join(entries) + "\n", encoding="utf-8")
        written[fname] = entries
    if groups:
        all_entries = sorted(set(all_entries))
        (out_dir / "zapret-all.txt").write_text("\n".join(all_entries) + "\n", encoding="utf-8")
        written["zapret-all.txt"] = all_entries
    return written


_TRANSLIT = dict(zip("абвгдеёжзийклмнопрстуфхцчшщъыьэюя",
                     ["a", "b", "v", "g", "d", "e", "e", "zh", "z", "i", "y", "k", "l", "m", "n", "o", "p",
                      "r", "s", "t", "u", "f", "h", "ts", "ch", "sh", "sch", "", "y", "", "e", "yu", "ya"]))


def _slug(text: str) -> str:
    text = "".join(_TRANSLIT.get(c, c) for c in text.lower())
    out = "".join(c if c.isascii() and c.isalnum() else "-" for c in text)
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "list"


def applied_entries(storage: Storage) -> list[str]:
    return [s["domain"] for s in storage.suggestions("applied")]


def verify_domains(storage: Storage, scan_id: int) -> list[str]:
    """Домены из скана, которые покрыты применёнными записями hostlist — их и перепроверяем."""
    entries = applied_entries(storage)
    out = []
    for r in storage.results(scan_id):
        if any(r["domain"] == e or r["domain"].endswith("." + e) for e in entries):
            out.append(r["domain"])
    return out
