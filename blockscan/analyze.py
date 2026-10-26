"""Сведение результатов проверок в вердикт: статус и тип блокировки.

Функции здесь чистые (без сети), поэтому покрыты юнит-тестами.
"""

from __future__ import annotations

import ipaddress
import re
from dataclasses import dataclass, field

AVAILABLE = "available"
BLOCKED = "blocked"
UNSTABLE = "unstable"
ERROR = "error"

STATUS_RU = {AVAILABLE: "доступен", BLOCKED: "заблокирован", UNSTABLE: "нестабилен", ERROR: "ошибка/неясно"}

DNS = "DNS"
IP = "IP"
DPI = "SNI/DPI"
HTTP = "HTTP"
QUIC = "QUIC"
BLOCK_TYPES = (DNS, IP, DPI, HTTP, QUIC)

# Признаки блок-страниц провайдеров (РФ и общие). Дополняются через config: blockpage_patterns.
BLOCKPAGE_PATTERNS = [
    r"rkn\.gov\.ru", r"zapret-info", r"eais\.rkn", r"роскомнадзор", r"149-фз",
    r"единый реестр", r"доступ к (информационному )?ресурсу ограничен", r"доступ ограничен",
    r"ресурс заблокирован", r"сайт заблокирован", r"заблокирован по требованию",
    r"warning\.rt\.ru", r"blocked\.mts\.ru", r"block\.dtln\.ru", r"lawfilter",
    r"blocked by (your )?(isp|provider|operator)", r"access (to this (site|resource) )?(is )?(denied|restricted) by",
]
_LOCATION_HINT = re.compile(r"block|zapret|warning|lawfilter|restrict|deny|forbidden|rkn", re.I)

# Типичные пороги «заморозки» ТСПУ: поток встаёт после ~16 КБ от сервера.
STALL_MIN, STALL_MAX = 8 * 1024, 40 * 1024


@dataclass
class Verdict:
    status: str
    block_types: list[str] = field(default_factory=list)
    reasons: list[str] = field(default_factory=list)

    def key(self) -> tuple:
        return self.status, tuple(sorted(self.block_types))

    def to_dict(self) -> dict:
        return {"status": self.status, "block_types": self.block_types, "reasons": self.reasons}


def is_stub_ip(ip: str, extra_stub_ips: frozenset[str] = frozenset()) -> bool:
    if ip in extra_stub_ips:
        return True
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    return addr.is_private or addr.is_loopback or addr.is_unspecified or addr.is_reserved or addr.is_link_local


def is_blockpage(probe: dict, domain: str, extra_patterns: list[str] | None = None) -> str | None:
    """Возвращает причину, если HTTP-ответ похож на блок-страницу провайдера."""
    location = probe.get("location") or ""
    if location:
        m = re.match(r"(?i)https?://([^/:]+)", location)
        loc_host = m.group(1).lower() if m else ""
        same_site = loc_host == domain or loc_host.endswith("." + domain) or domain.endswith("." + loc_host)
        if loc_host and not same_site and _LOCATION_HINT.search(location):
            return f"редирект на {location}"
    body = (probe.get("body") or "").lower()
    if body:
        for pat in BLOCKPAGE_PATTERNS + list(extra_patterns or []):
            if re.search(pat, body, re.I):
                return f"блок-страница (совпадение «{pat}»)"
    return None


def _fmt(probe: dict | None) -> str:
    if not probe:
        return "нет данных"
    return probe.get("detail") or probe.get("outcome", "?")


def _interrupted(p: dict | None) -> bool:
    return bool(p) and p.get("outcome") in ("reset", "timeout", "eof")


def _responded(p: dict | None) -> bool:
    """Сервер ответил хоть чем-то осмысленным (в т.ч. TLS-alert) — путь не перерезан."""
    return bool(p) and p.get("outcome") in ("ok", "alert", "cert_invalid")


def analyze(obs: dict, stub_ips: frozenset[str] = frozenset(),
            blockpage_patterns: list[str] | None = None) -> Verdict:
    """obs — словарь наблюдений одной попытки (формирует scanner.check_once)."""
    domain = obs["domain"]
    blocks: list[str] = []
    reasons: list[str] = []

    def block(kind: str, why: str) -> None:
        if kind not in blocks:
            blocks.append(kind)
        reasons.append(f"{kind}: {why}")

    ref = obs.get("ref_dns") or {}
    sysd = obs.get("sys_dns") or {}
    ref_ips = ref.get("ips") or []
    sys_ips = sysd.get("ips") or []

    # --- Сервисные IP (например, дата-центры Telegram) — проверяются без DNS.
    endpoints = obs.get("endpoints") or []
    if endpoints:
        failed = [e for e in endpoints if not (e.get("probe") or {}).get("outcome") == "ok"]
        if failed and len(failed) == len(endpoints) and obs.get("network_ok", True):
            block(IP, "все IP сервиса недоступны: " + ", ".join(
                f"{e['addr']} ({_fmt(e.get('probe'))})" for e in failed))
        elif failed:
            reasons.append("часть IP сервиса недоступна: " + ", ".join(e["addr"] for e in failed))

    if not ref_ips:
        if blocks:
            return Verdict(BLOCKED, blocks, reasons)
        if ref.get("error"):
            return Verdict(ERROR, [], reasons + [f"эталонный DNS недоступен: {ref['error']}"])
        return Verdict(ERROR, [], reasons + [f"домен не резолвится и через эталон ({ref.get('rcode', '?')})"])

    # --- DNS
    if sysd.get("error"):
        reasons.append(f"системный DNS: {sysd['error']}")
    elif not sys_ips:
        block(DNS, f"DNS провайдера: {sysd.get('rcode', 'пустой ответ')}, эталон: {', '.join(ref_ips[:3])}")
    else:
        stubs = [ip for ip in sys_ips if is_stub_ip(ip, stub_ips) and ip not in ref_ips]
        if stubs:
            block(DNS, f"подмена ответа на заглушку {', '.join(stubs)}")
        elif not set(sys_ips) & set(ref_ips):
            chk = obs.get("dns_spoof_check")
            if chk and chk.get("outcome") == "ok":
                pass  # другой IP, но с валидным сертификатом — CDN/геобалансировка
            elif chk and chk.get("outcome") == "cert_invalid":
                block(DNS, f"подмена: IP {sys_ips[0]} отдаёт чужой сертификат ({_fmt(chk)})")
            elif chk and _blockpage_reason(obs.get("dns_spoof_http"), domain, blockpage_patterns):
                block(DNS, f"подмена: IP {sys_ips[0]} отдаёт блок-страницу")
            else:
                reasons.append(f"IP от провайдера ({', '.join(sys_ips[:2])}) не совпадают с эталоном — "
                               f"проверка по ним: {_fmt(chk)}")
    if obs.get("udp53_intercepted"):
        reasons.append("ответы публичного DNS по UDP/53 отличаются от эталона — провайдер перехватывает DNS")

    # --- TCP
    tcp443 = obs.get("tcp443")
    tcp80 = obs.get("tcp80")
    network_ok = obs.get("network_ok", True)
    if tcp443 and tcp443.get("outcome") != "ok":
        if not network_ok:
            return Verdict(ERROR, blocks, reasons + ["нет связи с контрольными узлами — проверка недостоверна"])
        port80 = " (порт 80 при этом доступен)" if tcp80 and tcp80.get("outcome") == "ok" else ""
        block(IP, f"TCP к {obs.get('target_ip')}:443 — {_fmt(tcp443)}{port80}; "
                  "если сайт работает из другой сети — блокировка по IP")
    else:
        # --- TLS / SNI
        sni, nosni, https = obs.get("tls_sni"), obs.get("tls_nosni"), obs.get("https")
        if _interrupted(sni) and _responded(nosni):
            block(DPI, f"TLS с SNI={domain}: {_fmt(sni)}; без SNI сервер отвечает ({_fmt(nosni)})")
        elif _interrupted(sni) and _interrupted(nosni):
            reasons.append(f"TLS не устанавливается ни с SNI, ни без ({_fmt(sni)}) — "
                           "сбой сервера или DPI по IP")
            if not blocks:
                return Verdict(ERROR, blocks, reasons)
        elif sni and sni.get("outcome") == "ok" and https:
            out = https.get("outcome")
            got = https.get("received", 0)
            if out == "stall" and STALL_MIN <= got <= STALL_MAX:
                block(DPI, f"поток данных замирает после {got} байт — замедление/заморозка ТСПУ")
            elif out in ("reset", "eof", "timeout") and not https.get("status"):
                block(DPI, f"рукопожатие проходит, но данные обрываются ({_fmt(https)})")
            elif out == "stall":
                reasons.append(f"HTTPS: {_fmt(https)}")

    # --- HTTP (порт 80)
    http, neutral = obs.get("http"), obs.get("http_neutral")
    why = _blockpage_reason(http, domain, blockpage_patterns)
    if why:
        block(HTTP, why)
    elif _interrupted(http) and _responded(neutral) and tcp80 and tcp80.get("outcome") == "ok":
        block(HTTP, f"обрыв при Host: {domain} ({_fmt(http)}), с нейтральным Host ответ есть")

    # --- QUIC
    quic = obs.get("quic")
    if quic and quic.get("outcome") != "ok":
        if obs.get("quic_control_ok") and obs.get("uses_quic"):
            block(QUIC, f"UDP/443 (QUIC) не отвечает ({_fmt(quic)}), контрольный QUIC-узел отвечает")
        elif obs.get("quic_control_ok"):
            reasons.append("QUIC не отвечает (сервер может не поддерживать HTTP/3)")
        else:
            reasons.append("QUIC не проверен: контрольный узел тоже не отвечает (UDP/443 закрыт целиком?)")

    return Verdict(BLOCKED if blocks else AVAILABLE, blocks, reasons)


def _blockpage_reason(probe: dict | None, domain: str, patterns: list[str] | None) -> str | None:
    if not probe or probe.get("outcome") != "ok":
        return None
    return is_blockpage(probe, domain, patterns)


def combine(verdicts: list[Verdict]) -> Verdict:
    """Сводит несколько попыток: разные результаты => «нестабилен»."""
    if len(verdicts) == 1:
        return verdicts[0]
    keys = {v.key() for v in verdicts}
    if len(keys) == 1:
        return verdicts[-1]
    kinds: list[str] = []
    for v in verdicts:
        for k in v.block_types:
            if k not in kinds:
                kinds.append(k)
    summary = ", ".join(f"{STATUS_RU[v.status]}{'(' + '/'.join(v.block_types) + ')' if v.block_types else ''}"
                        for v in verdicts)
    reasons = [f"результаты попыток различаются: {summary}"]
    for v in verdicts:
        reasons.extend(r for r in v.reasons if r not in reasons)
    return Verdict(UNSTABLE, kinds, reasons)
