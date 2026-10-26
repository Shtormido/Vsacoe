"""Минимальный DNS wire-format (RFC 1035) и резолверы: системный, UDP, DoH, DoT."""

from __future__ import annotations

import http.client
import random
import socket
import ssl
import struct
from dataclasses import dataclass, field
from urllib.parse import urlsplit

TYPE_A = 1
TYPE_CNAME = 5
TYPE_AAAA = 28

RCODE_NAMES = {0: "NOERROR", 1: "FORMERR", 2: "SERVFAIL", 3: "NXDOMAIN", 4: "NOTIMP", 5: "REFUSED"}


@dataclass
class DnsAnswer:
    rcode: str = "NOERROR"
    ips: list[str] = field(default_factory=list)
    cnames: list[str] = field(default_factory=list)
    error: str | None = None  # сетевая ошибка (таймаут, отказ), а не DNS-ответ

    @property
    def ok(self) -> bool:
        return self.error is None and self.rcode == "NOERROR" and bool(self.ips)


def build_query(name: str, qtype: int = TYPE_A, qid: int | None = None) -> bytes:
    qid = random.getrandbits(16) if qid is None else qid
    header = struct.pack("!HHHHHH", qid, 0x0100, 1, 0, 0, 0)  # RD=1
    qname = b"".join(
        bytes([len(label)]) + label for label in name.rstrip(".").encode("idna").split(b".")
    ) + b"\x00"
    return header + qname + struct.pack("!HH", qtype, 1)


def _read_name(data: bytes, offset: int, depth: int = 0) -> tuple[str, int]:
    if depth > 10:
        raise ValueError("слишком глубокая компрессия имени")
    labels = []
    while True:
        length = data[offset]
        if length & 0xC0 == 0xC0:
            pointer = struct.unpack("!H", data[offset:offset + 2])[0] & 0x3FFF
            name, _ = _read_name(data, pointer, depth + 1)
            labels.append(name)
            return ".".join(x for x in labels if x), offset + 2
        offset += 1
        if length == 0:
            return ".".join(labels), offset
        labels.append(data[offset:offset + length].decode("ascii", "replace"))
        offset += length


def parse_response(data: bytes) -> DnsAnswer:
    if len(data) < 12:
        raise ValueError("короткий DNS-ответ")
    _qid, flags, qd, an, _ns, _ar = struct.unpack("!HHHHHH", data[:12])
    ans = DnsAnswer(rcode=RCODE_NAMES.get(flags & 0x0F, str(flags & 0x0F)))
    offset = 12
    for _ in range(qd):
        _, offset = _read_name(data, offset)
        offset += 4
    for _ in range(an):
        _, offset = _read_name(data, offset)
        rtype, _rclass, _ttl, rdlen = struct.unpack("!HHIH", data[offset:offset + 10])
        offset += 10
        rdata = data[offset:offset + rdlen]
        if rtype == TYPE_A and rdlen == 4:
            ans.ips.append(socket.inet_ntop(socket.AF_INET, rdata))
        elif rtype == TYPE_AAAA and rdlen == 16:
            ans.ips.append(socket.inet_ntop(socket.AF_INET6, rdata))
        elif rtype == TYPE_CNAME:
            ans.cnames.append(_read_name(data, offset)[0])
        offset += rdlen
    return ans


def resolve_system(name: str) -> DnsAnswer:
    """Резолвинг через ОС, т.е. через DNS провайдера (или того, что настроено)."""
    try:
        infos = socket.getaddrinfo(name, 443, socket.AF_INET, socket.SOCK_STREAM)
    except socket.gaierror as e:
        if e.errno in (getattr(socket, "EAI_NONAME", -2), getattr(socket, "EAI_NODATA", -5), 11001, 11004):
            return DnsAnswer(rcode="NXDOMAIN")
        return DnsAnswer(error=f"gaierror: {e}")
    except OSError as e:
        return DnsAnswer(error=str(e))
    ips = sorted({info[4][0] for info in infos})
    return DnsAnswer(ips=ips)


def resolve_udp(name: str, server: str, timeout: float = 3.0, qtype: int = TYPE_A) -> DnsAnswer:
    """Обычный DNS по UDP/53 на указанный сервер (провайдер может его перехватывать)."""
    query = build_query(name, qtype)
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.settimeout(timeout)
            s.sendto(query, (server, 53))
            data, _ = s.recvfrom(4096)
        return parse_response(data)
    except (OSError, ValueError) as e:
        return DnsAnswer(error=f"udp {server}: {e}")


def resolve_doh(name: str, url: str, timeout: float = 5.0, qtype: int = TYPE_A) -> DnsAnswer:
    """DNS-over-HTTPS (RFC 8484, POST application/dns-message). Прямое соединение, без прокси."""
    parts = urlsplit(url)
    ctx = ssl.create_default_context()
    try:
        conn = http.client.HTTPSConnection(parts.hostname, parts.port or 443, timeout=timeout, context=ctx)
        conn.request(
            "POST", parts.path or "/dns-query", body=build_query(name, qtype, qid=0),
            headers={"Content-Type": "application/dns-message", "Accept": "application/dns-message"},
        )
        resp = conn.getresponse()
        body = resp.read()
        conn.close()
        if resp.status != 200:
            return DnsAnswer(error=f"doh {parts.hostname}: HTTP {resp.status}")
        return parse_response(body)
    except (OSError, ValueError, http.client.HTTPException) as e:
        return DnsAnswer(error=f"doh {parts.hostname}: {e}")


def resolve_dot(name: str, server: str, hostname: str, timeout: float = 5.0, qtype: int = TYPE_A) -> DnsAnswer:
    """DNS-over-TLS (RFC 7858), порт 853."""
    query = build_query(name, qtype)
    ctx = ssl.create_default_context()
    try:
        with socket.create_connection((server, 853), timeout=timeout) as raw:
            with ctx.wrap_socket(raw, server_hostname=hostname) as s:
                s.sendall(struct.pack("!H", len(query)) + query)
                length = struct.unpack("!H", _recv_exact(s, 2))[0]
                return parse_response(_recv_exact(s, length))
    except (OSError, ValueError, ssl.SSLError) as e:
        return DnsAnswer(error=f"dot {hostname}: {e}")


def _recv_exact(s: socket.socket, n: int) -> bytes:
    buf = b""
    while len(buf) < n:
        chunk = s.recv(n - len(buf))
        if not chunk:
            raise ValueError("соединение закрыто")
        buf += chunk
    return buf


class ReferenceResolver:
    """Эталонный резолвер: перебирает DoH/DoT-серверы, пока один не ответит."""

    def __init__(self, endpoints: list[dict], timeout: float = 5.0):
        self.endpoints = endpoints
        self.timeout = timeout
        self._preferred = 0

    def resolve(self, name: str) -> DnsAnswer:
        last = DnsAnswer(error="нет эталонных DNS-серверов")
        order = self.endpoints[self._preferred:] + self.endpoints[:self._preferred]
        for ep in order:
            if ep["type"] == "doh":
                ans = resolve_doh(name, ep["url"], self.timeout)
            elif ep["type"] == "dot":
                ans = resolve_dot(name, ep["ip"], ep["hostname"], self.timeout)
            else:
                continue
            if ans.error is None:
                self._preferred = self.endpoints.index(ep)
                return ans
            last = ans
        return last
