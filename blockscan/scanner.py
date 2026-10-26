"""Оркестрация проверок: потоки, лимит скорости, повторные попытки, контроль сети."""

from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from typing import Callable, Iterable

from blockscan import analyze, dnswire, probes
from blockscan.ratelimit import RateLimiter
from blockscan.services import Service, ServiceDB
from blockscan.storage import now

log = logging.getLogger("blockscan")


@dataclass
class Target:
    domain: str
    service: str | None = None
    category: str = "other"
    uses_quic: bool = False
    endpoints: list[str] = field(default_factory=list)


def targets_from_services(services: Iterable[Service]) -> list[Target]:
    out = []
    for svc in services:
        for i, host in enumerate(svc.probe_hosts):
            # IP-адреса сервиса проверяем один раз — вместе с первым доменом.
            out.append(Target(host, svc.name, svc.category, svc.quic, svc.endpoints if i == 0 else []))
    return out


def targets_from_domains(domains: Iterable[str], db: ServiceDB, category: str | None = None) -> list[Target]:
    out, seen = [], set()
    for d in domains:
        d = normalize_domain(d)
        if not d or d in seen:
            continue
        seen.add(d)
        svc = db.match(d)
        if svc:
            out.append(Target(d, svc.name, svc.category, svc.quic))
        else:
            out.append(Target(d, None, category or "other"))
    return out


def normalize_domain(raw: str) -> str:
    d = raw.strip().lower()
    if "://" in d:
        d = d.split("://", 1)[1]
    d = d.split("/", 1)[0].split(":", 1)[0].strip(".")
    if d.startswith("*."):
        d = d[2:]
    if not d or "." not in d or " " in d:
        return ""
    return d


class Scanner:
    def __init__(self, cfg: dict, on_result: Callable[[dict], None] | None = None,
                 log_fn: Callable[[str], None] | None = None):
        self.cfg = cfg
        self.timeout = float(cfg["timeout"])
        # Порты меняются только для тестов на локальных серверах.
        self.https_port = int(cfg.get("https_port", 443))
        self.http_port = int(cfg.get("http_port", 80))
        self.limiter = RateLimiter(float(cfg["rps"]))
        self.reference = dnswire.ReferenceResolver(cfg["reference_dns"], self.timeout)
        self.stub_ips = frozenset(cfg.get("dns_stub_ips") or [])
        self.patterns = list(cfg.get("blockpage_patterns") or [])
        self.on_result = on_result
        self.log = log_fn or (lambda msg: log.info(msg))
        self.network_ok = True
        self.quic_control_ok = False
        self.cancelled = False

    def _net(self, fn, *args, **kwargs):
        self.limiter.acquire()
        return fn(*args, **kwargs)

    # --- контроль сети
    def baseline(self) -> dict:
        """Проверка до сканирования: работает ли эталонный DNS и есть ли вообще сеть."""
        info: dict = {"reference_dns": False, "control": {}, "quic_control": False}
        for host in self.cfg["control_hosts"]:
            ans = self._net(self.reference.resolve, host)
            if ans.error is None:
                info["reference_dns"] = True
            ok = False
            for ip in ans.ips[:2]:
                if ":" in ip:
                    continue
                if self._net(probes.tcp_connect, ip, 443, self.timeout).ok:
                    ok = True
                    break
            info["control"][host] = ok
        self.network_ok = any(info["control"].values())
        qhost = self.cfg.get("quic_control")
        if qhost and self.cfg.get("quic"):
            ans = self._net(self.reference.resolve, qhost)
            v4 = [ip for ip in ans.ips if ":" not in ip]
            if v4:
                self.quic_control_ok = self._net(probes.quic_probe, v4[0], self.timeout).ok
        info["quic_control"] = self.quic_control_ok
        info["network_ok"] = self.network_ok
        return info

    # --- одна попытка для одного домена
    def check_once(self, t: Target) -> dict:
        to = self.timeout
        obs: dict = {"domain": t.domain, "network_ok": self.network_ok, "uses_quic": t.uses_quic,
                     "quic_control_ok": self.quic_control_ok}

        if t.endpoints:
            obs["endpoints"] = []
            for ep in t.endpoints:
                host, _, port = ep.rpartition(":")
                obs["endpoints"].append(
                    {"addr": ep, "probe": self._net(probes.tcp_connect, host, int(port), to).to_dict()})

        sys_ans = self._net(dnswire.resolve_system, t.domain)
        ref_ans = self._net(self.reference.resolve, t.domain)
        obs["sys_dns"] = _dns_dict(sys_ans)
        obs["ref_dns"] = _dns_dict(ref_ans)

        ref_v4 = [ip for ip in ref_ans.ips if ":" not in ip]
        sys_v4 = [ip for ip in sys_ans.ips if ":" not in ip]
        if not ref_v4:
            return obs

        public = self.cfg.get("public_udp_dns")
        if public:
            pub = self._net(dnswire.resolve_udp, t.domain, public, min(to, 3.0))
            stub = any(analyze.is_stub_ip(ip, self.stub_ips) for ip in pub.ips)
            if pub.error is None and (not pub.ips or stub) and ref_v4:
                obs["udp53_intercepted"] = True

        # Провайдер вернул другие IP: проверяем, «настоящий» ли там сервер.
        if sys_v4 and not set(sys_v4) & set(ref_v4) \
                and not any(analyze.is_stub_ip(ip, self.stub_ips) for ip in sys_v4):
            obs["dns_spoof_check"] = self._net(
                probes.tls_handshake, sys_v4[0], t.domain, to, self.https_port, verify=True).to_dict()
            if obs["dns_spoof_check"]["outcome"] != "ok":
                p = self._net(probes.http_get, sys_v4[0], t.domain, to, self.http_port)
                obs["dns_spoof_http"] = {**p.to_dict(), "body": p.body}

        # Дальше работаем с «правильными» IP из эталона — так DNS не маскирует DPI/IP-блок.
        target_ip = None
        tcp443 = None
        for ip in ref_v4[:3]:
            tcp443 = self._net(probes.tcp_connect, ip, self.https_port, to)
            target_ip = ip
            if tcp443.ok:
                break
        obs["target_ip"] = target_ip
        obs["tcp443"] = tcp443.to_dict()
        tcp80 = self._net(probes.tcp_connect, target_ip, self.http_port, to)
        obs["tcp80"] = tcp80.to_dict()

        if tcp443.ok:
            port = self.https_port
            sni = self._net(probes.tls_handshake, target_ip, t.domain, to, port)
            obs["tls_sni"] = sni.to_dict()
            if sni.interrupted:
                obs["tls_nosni"] = self._net(probes.tls_handshake, target_ip, None, to, port).to_dict()
            else:
                obs["https"] = self._net(probes.tls_handshake, target_ip, t.domain, to, port,
                                         http_get=True).to_dict()

        if tcp80.ok:
            http = self._net(probes.http_get, target_ip, t.domain, to, self.http_port)
            obs["http"] = {**http.to_dict(), "body": http.body}
            if http.interrupted:
                obs["http_neutral"] = self._net(probes.http_get, target_ip, self.cfg["neutral_host"], to,
                                                self.http_port).to_dict()

        if self.cfg.get("quic") and (t.uses_quic or self.cfg.get("quic") == "all"):
            obs["quic"] = self._net(probes.quic_probe, target_ip, min(to, 3.0), self.https_port).to_dict()
        return obs

    # --- домен целиком (с повторами)
    def check(self, t: Target) -> dict:
        attempts = max(1, int(self.cfg["attempts"]))
        verdicts: list[analyze.Verdict] = []
        observations: list[dict] = []
        for i in range(attempts):
            if self.cancelled:
                break
            try:
                obs = self.check_once(t)
            except Exception as e:  # noqa: BLE001 — сбой одной проверки не роняет весь скан
                log.exception("ошибка проверки %s", t.domain)
                obs = {"domain": t.domain, "exception": repr(e)}
                v = analyze.Verdict(analyze.ERROR, [], [f"внутренняя ошибка: {e!r}"])
            else:
                v = analyze.analyze(obs, self.stub_ips, self.patterns)
            verdicts.append(v)
            observations.append(obs)
            # Доступен с первого раза — перепроверять незачем.
            if i == 0 and v.status == analyze.AVAILABLE:
                break
        final = analyze.combine(verdicts) if verdicts else analyze.Verdict(analyze.ERROR, [], ["отменено"])
        for o in observations:
            for key in ("http", "dns_spoof_http"):
                if isinstance(o.get(key), dict):
                    o[key].pop("body", None)
        return {
            "domain": t.domain, "service": t.service, "category": t.category,
            "status": final.status, "block_types": final.block_types, "reasons": final.reasons,
            "details": {"attempts": observations}, "checked_at": now(),
        }

    def run(self, targets: list[Target]) -> list[dict]:
        results = []
        threads = max(1, int(self.cfg["threads"]))
        with ThreadPoolExecutor(max_workers=threads) as pool:
            futures = {pool.submit(self.check, t): t for t in targets}
            for fut in as_completed(futures):
                r = fut.result()
                results.append(r)
                if self.on_result:
                    self.on_result(r)
        return results


def _dns_dict(a: dnswire.DnsAnswer) -> dict:
    d: dict = {"rcode": a.rcode, "ips": a.ips}
    if a.cnames:
        d["cnames"] = a.cnames
    if a.error:
        d["error"] = a.error
    return d
