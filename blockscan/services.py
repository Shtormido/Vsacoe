"""База «сервис → домены/IP» и категории. Встроенная база + пользовательская (переопределяет)."""

from __future__ import annotations

import json
import shutil
from dataclasses import dataclass, field
from importlib import resources
from pathlib import Path

from blockscan import config

CATEGORIES = {
    "social": "Соцсети",
    "messengers": "Мессенджеры",
    "video": "Видео и стриминг",
    "news": "Новости",
    "vpn": "VPN и прокси",
    "torrents": "Торренты",
    "dev": "Разработка",
    "games": "Игры",
    "other": "Прочее",
}


@dataclass
class Service:
    name: str
    category: str
    domains: list[str]  # суффиксы для сопоставления: cdn.example.com -> example.com
    probe: list[str] = field(default_factory=list)  # что реально проверять
    endpoints: list[str] = field(default_factory=list)  # "ip:port" для проверки без DNS
    quic: bool = False

    @property
    def probe_hosts(self) -> list[str]:
        return self.probe or self.domains


def _builtin_path() -> Path:
    return Path(str(resources.files("blockscan") / "data" / "services.json"))


def _parse(raw: dict) -> list[Service]:
    out = []
    for s in raw.get("services", []):
        out.append(Service(
            name=s["name"], category=s.get("category", "other"),
            domains=[d.lower() for d in s.get("domains", [])],
            probe=[d.lower() for d in s.get("probe", [])],
            endpoints=s.get("endpoints", []), quic=bool(s.get("quic", False)),
        ))
    return out


class ServiceDB:
    def __init__(self, services: list[Service]):
        self.services = services
        self._suffix: dict[str, Service] = {}
        for svc in services:
            for d in svc.domains:
                self._suffix[d] = svc

    @classmethod
    def load(cls) -> "ServiceDB":
        with open(_builtin_path(), encoding="utf-8") as f:
            services = {s.name: s for s in _parse(json.load(f))}
        user = config.user_services_path()
        if user.exists():
            with open(user, encoding="utf-8") as f:
                for s in _parse(json.load(f)):
                    services[s.name] = s  # пользовательская запись заменяет встроенную
        return cls(list(services.values()))

    def match(self, domain: str) -> Service | None:
        """Самое длинное совпадение по суффиксу: rr1.googlevideo.com -> YouTube."""
        parts = domain.lower().rstrip(".").split(".")
        for i in range(len(parts) - 1):
            svc = self._suffix.get(".".join(parts[i:]))
            if svc:
                return svc
        return None

    def get(self, name: str) -> Service | None:
        low = name.lower()
        return next((s for s in self.services if s.name.lower() == low), None)

    def by_category(self, category: str) -> list[Service]:
        return [s for s in self.services if s.category == category]


def ensure_user_copy() -> Path:
    """Создаёт редактируемую копию базы сервисов в каталоге пользователя."""
    user = config.user_services_path()
    if not user.exists():
        shutil.copyfile(_builtin_path(), user)
    return user


def save_user_service(svc: Service) -> None:
    path = config.user_services_path()
    data = {"services": []}
    if path.exists():
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    data["services"] = [s for s in data.get("services", []) if s["name"] != svc.name]
    entry = {"name": svc.name, "category": svc.category, "domains": svc.domains}
    if svc.probe:
        entry["probe"] = svc.probe
    if svc.endpoints:
        entry["endpoints"] = svc.endpoints
    if svc.quic:
        entry["quic"] = True
    data["services"].append(entry)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
