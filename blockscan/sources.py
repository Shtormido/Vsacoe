"""Источники целей: Citizen Lab test-lists, реестры блокировок, файлы пользователя.

Загрузка из интернета выполняется только по явной команде пользователя.
"""

from __future__ import annotations

import csv
import io
import urllib.request
from pathlib import Path

from blockscan.scanner import normalize_domain
from blockscan.services import ServiceDB

CITIZENLAB_URL = "https://raw.githubusercontent.com/citizenlab/test-lists/master/lists/{cc}.csv"
# Сообщество antifilter.download: домены из реестра РКН (укороченный список).
ANTIFILTER_URL = "https://antifilter.download/list/domains.lst"

CITIZENLAB_CATEGORIES = {
    "NEWS": "news", "POLR": "news", "HUMR": "news",
    "GRP": "social", "DATE": "social",
    "COMT": "messengers",
    "MMED": "video",
    "ANON": "vpn",
    "FILE": "torrents",
    "HACK": "dev",
    "GAME": "games",
}


def _fetch(url: str, timeout: float = 30.0) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "blockscan"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310 — фиксированные https-URL
        raw = resp.read()
    for enc in ("utf-8", "cp1251"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", "replace")


def _annotate(items: list[dict], db: ServiceDB) -> list[dict]:
    for it in items:
        svc = db.match(it["domain"])
        if svc:
            it["service"], it["category"] = svc.name, svc.category
    return items


def parse_citizenlab(text: str) -> list[dict]:
    out, seen = [], set()
    for row in csv.DictReader(io.StringIO(text)):
        d = normalize_domain(row.get("url", ""))
        if d and d not in seen:
            seen.add(d)
            out.append({"domain": d, "category": CITIZENLAB_CATEGORIES.get(row.get("category_code", ""), "other")})
    return out


def citizenlab(db: ServiceDB, country: str = "ru", include_global: bool = False) -> list[dict]:
    items = parse_citizenlab(_fetch(CITIZENLAB_URL.format(cc=country.lower())))
    if include_global:
        known = {i["domain"] for i in items}
        items += [i for i in parse_citizenlab(_fetch(CITIZENLAB_URL.format(cc="global"))) if i["domain"] not in known]
    return _annotate(items, db)


def parse_plain(text: str, category: str = "other") -> list[dict]:
    out, seen = [], set()
    for line in text.splitlines():
        line = line.split("#", 1)[0].strip()
        if not line:
            continue
        # CSV: берём первую колонку, похожую на домен/URL.
        cells = [c.strip().strip('"') for c in line.replace(";", ",").split(",")] if "," in line or ";" in line else [line]
        for cell in cells:
            d = normalize_domain(cell)
            if d:
                if d not in seen:
                    seen.add(d)
                    out.append({"domain": d, "category": category})
                break
    return out


def antifilter(db: ServiceDB, limit: int | None = None) -> list[dict]:
    items = parse_plain(_fetch(ANTIFILTER_URL))
    if limit:
        items = items[:limit]
    return _annotate(items, db)


def from_file(path: Path, db: ServiceDB, category: str = "other") -> list[dict]:
    raw = Path(path).read_bytes()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("cp1251", "replace")
    if path.suffix.lower() == ".csv" and text.lower().startswith("url,"):
        return _annotate(parse_citizenlab(text), db)
    return _annotate(parse_plain(text, category), db)
