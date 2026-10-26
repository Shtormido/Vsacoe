"""Настройки и пути. Всё хранится локально в каталоге пользователя."""

from __future__ import annotations

import copy
import json
import os
import sys
from pathlib import Path

DEFAULTS: dict = {
    # Лимиты: не больше rps сетевых запросов в секунду на всё приложение.
    "threads": 8,
    "rps": 5.0,
    "timeout": 5.0,
    # Сколько раз перепроверять подозрительный домен (отличаем блокировку от сбоя).
    "attempts": 3,
    "quic": True,
    "isp": "",
    # Эталонные резолверы. Адреса по IP — чтобы сам DoH не зависел от DNS провайдера.
    "reference_dns": [
        {"type": "doh", "url": "https://1.1.1.1/dns-query"},
        {"type": "doh", "url": "https://8.8.8.8/dns-query"},
        {"type": "doh", "url": "https://9.9.9.9/dns-query"},
        {"type": "dot", "ip": "1.1.1.1", "hostname": "cloudflare-dns.com"},
        {"type": "dot", "ip": "8.8.8.8", "hostname": "dns.google"},
    ],
    # Публичный DNS по UDP/53 — для обнаружения перехвата DNS провайдером.
    "public_udp_dns": "8.8.8.8",
    # Контрольные узлы: если они недоступны — проблема в сети, а не блокировка.
    "control_hosts": ["example.com", "ya.ru"],
    "quic_control": "www.google.com",
    # Нейтральный Host для сравнения при HTTP-проверке.
    "neutral_host": "example.com",
    "dns_stub_ips": [],
    "blockpage_patterns": [],
    "zapret": {
        # Куда дописывать подтверждённые домены (hostlist zapret). Пусто — только экспорт.
        "hostlist_path": "",
        "exclude_path": "",
    },
    # Белый список (никогда не предлагать для zapret) и чёрный (предлагать всегда).
    "exclude": [],
    "include": [],
}


def home_dir() -> Path:
    env = os.environ.get("BLOCKSCAN_HOME")
    if env:
        path = Path(env)
    elif sys.platform == "win32":
        path = Path(os.environ.get("APPDATA", Path.home())) / "blockscan"
    else:
        path = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config")) / "blockscan"
    path.mkdir(parents=True, exist_ok=True)
    return path


def config_path() -> Path:
    return home_dir() / "config.json"


def db_path() -> Path:
    return home_dir() / "blockscan.sqlite3"


def user_services_path() -> Path:
    return home_dir() / "services.json"


def _merge(base: dict, over: dict) -> dict:
    out = copy.deepcopy(base)
    for k, v in over.items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _merge(out[k], v)
        else:
            out[k] = v
    return out


def load() -> dict:
    path = config_path()
    if path.exists():
        with open(path, encoding="utf-8") as f:
            return _merge(DEFAULTS, json.load(f))
    return copy.deepcopy(DEFAULTS)


def save(cfg: dict) -> None:
    with open(config_path(), "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)


def set_value(cfg: dict, dotted_key: str, raw: str) -> None:
    """config set zapret.hostlist_path /opt/zapret/ipset/zapret-hosts-user.txt"""
    keys = dotted_key.split(".")
    node = cfg
    for k in keys[:-1]:
        node = node.setdefault(k, {})
    try:
        value = json.loads(raw)
    except json.JSONDecodeError:
        value = raw
    node[keys[-1]] = value
