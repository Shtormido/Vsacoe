"""Общий слой для CLI и веб-интерфейса: выбор целей и запуск скана с сохранением."""

from __future__ import annotations

import json
import logging
import urllib.request
from typing import Callable

from blockscan import config
from blockscan.scanner import Scanner, Target, targets_from_domains, targets_from_services
from blockscan.services import ServiceDB
from blockscan.storage import Storage

log = logging.getLogger("blockscan")


def open_storage() -> Storage:
    return Storage(config.db_path())


def select_targets(db: ServiceDB, storage: Storage, *, categories: list[str] | None = None,
                   services: list[str] | None = None, domains: list[str] | None = None,
                   use_services: bool = False, use_targets: bool = False,
                   target_source: str | None = None) -> list[Target]:
    """По умолчанию (ничего не выбрано) — все сервисы из базы."""
    out: list[Target] = []
    explicit = bool(categories or services or domains or use_targets)
    if services:
        for name in services:
            svc = db.get(name)
            if not svc:
                raise ValueError(f"сервис не найден: {name}")
            out += targets_from_services([svc])
    if categories:
        for cat in categories:
            out += targets_from_services(db.by_category(cat))
    if use_services or not explicit:
        out += targets_from_services(db.services)
    if use_targets:
        rows = storage.targets(target_source)
        by_cat: dict[str, list[str]] = {}
        for r in rows:
            by_cat.setdefault(r.get("category") or "other", []).append(r["domain"])
        for cat, ds in by_cat.items():
            out += targets_from_domains(ds, db, cat)
    if domains:
        out += targets_from_domains(domains, db)
    # Убираем дубли, сохраняя первую (самую информативную) запись.
    seen: dict[str, Target] = {}
    for t in out:
        if t.domain not in seen:
            seen[t.domain] = t
        elif t.endpoints and not seen[t.domain].endpoints:
            seen[t.domain].endpoints = t.endpoints
    return list(seen.values())


def run_scan(cfg: dict, storage: Storage, targets: list[Target], *, isp: str = "", kind: str = "scan",
             note: str = "", on_result: Callable[[dict], None] | None = None,
             on_baseline: Callable[[dict], None] | None = None,
             scanner_hook: Callable[[Scanner], None] | None = None) -> int:
    params = {k: cfg[k] for k in ("threads", "rps", "timeout", "attempts", "quic")}
    params["targets"] = len(targets)
    scan_id = storage.start_scan(isp or cfg.get("isp") or "", params, kind=kind, note=note)

    def store(r: dict) -> None:
        storage.add_result(scan_id, r)
        if on_result:
            on_result(r)

    scanner = Scanner(cfg, on_result=store)
    if scanner_hook:
        scanner_hook(scanner)
    base = scanner.baseline()
    params["baseline"] = base
    storage.update_scan_params(scan_id, params)
    if on_baseline:
        on_baseline(base)
    if not base["reference_dns"]:
        storage.delete_scan(scan_id)
        raise RuntimeError("эталонные DoH/DoT-серверы недоступны — сравнивать не с чем. "
                           "Укажите другие в config (reference_dns).")
    if not base["network_ok"]:
        log.warning("контрольные узлы недоступны — результаты могут быть недостоверны")
    try:
        scanner.run(targets)
    finally:
        storage.finish_scan(scan_id)
    return scan_id


def detect_isp(timeout: float = 10.0) -> str:
    """Определение провайдера через внешний сервис ipinfo.io. Вызывается только по явному
    флагу --detect-isp: сервису уходит ваш внешний IP-адрес."""
    req = urllib.request.Request("https://ipinfo.io/json", headers={"User-Agent": "blockscan"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310
        data = json.load(resp)
    return " · ".join(x for x in (data.get("org"), data.get("city"), data.get("country")) if x)
