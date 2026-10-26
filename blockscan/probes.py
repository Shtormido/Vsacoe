"""Сетевые проверки нижнего уровня: TCP, TLS (с SNI и без), HTTPS-данные, HTTP, QUIC."""

from __future__ import annotations

import errno
import os
import socket
import ssl
import time
from dataclasses import asdict, dataclass

USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"

# Исходы, означающие, что соединение кто-то оборвал или «съел» по дороге.
INTERRUPTED = {"reset", "timeout", "eof"}


@dataclass
class Probe:
    outcome: str  # ok | timeout | reset | refused | eof | alert | cert_invalid | unreachable | stall | error
    detail: str = ""
    elapsed_ms: int = 0
    status: int | None = None  # HTTP-статус
    location: str | None = None
    body: str | None = None  # начало тела HTTP-ответа (для поиска блок-страницы)
    received: int = 0  # байт получено (для HTTPS)

    @property
    def ok(self) -> bool:
        return self.outcome == "ok"

    @property
    def interrupted(self) -> bool:
        return self.outcome in INTERRUPTED

    def to_dict(self) -> dict:
        d = {k: v for k, v in asdict(self).items() if v not in (None, "", 0) or k == "outcome"}
        d.pop("body", None)
        return d


def classify_exception(e: BaseException) -> tuple[str, str]:
    if isinstance(e, ssl.SSLCertVerificationError):
        return "cert_invalid", e.verify_message or str(e)
    if isinstance(e, (socket.timeout, TimeoutError)):
        return "timeout", "таймаут"
    if isinstance(e, ConnectionResetError):
        return "reset", "соединение сброшено (RST)"
    if isinstance(e, ConnectionRefusedError):
        return "refused", "порт закрыт (RST на SYN)"
    if isinstance(e, ssl.SSLEOFError):
        return "eof", "соединение закрыто во время TLS"
    if isinstance(e, ssl.SSLError):
        reason = (e.reason or "").upper()
        if any(x in reason for x in ("ALERT", "HANDSHAKE_FAILURE", "TLSV1_", "WRONG_VERSION", "UNRECOGNIZED_NAME")):
            return "alert", f"TLS-ответ сервера: {e.reason}"
        if "UNEXPECTED_EOF" in reason:
            return "eof", "соединение закрыто во время TLS"
        return "error", f"TLS: {e.reason or e}"
    if isinstance(e, OSError):
        if e.errno in (errno.ENETUNREACH, errno.EHOSTUNREACH, 10051, 10065):
            return "unreachable", "сеть/хост недоступны"
        if e.errno in (errno.ECONNRESET, 10054):
            return "reset", "соединение сброшено (RST)"
        if e.errno in (errno.ETIMEDOUT, 10060):
            return "timeout", "таймаут"
        return "error", str(e)
    return "error", repr(e)


def _family(ip: str) -> int:
    return socket.AF_INET6 if ":" in ip else socket.AF_INET


def _connect(ip: str, port: int, timeout: float) -> socket.socket:
    s = socket.socket(_family(ip), socket.SOCK_STREAM)
    s.settimeout(timeout)
    try:
        s.connect((ip, port))
    except BaseException:
        s.close()
        raise
    return s


def _ms(start: float) -> int:
    return int((time.monotonic() - start) * 1000)


def tcp_connect(ip: str, port: int, timeout: float) -> Probe:
    start = time.monotonic()
    try:
        _connect(ip, port, timeout).close()
        return Probe("ok", elapsed_ms=_ms(start))
    except BaseException as e:  # noqa: BLE001 - любые сетевые сбои превращаем в исход
        outcome, detail = classify_exception(e)
        return Probe(outcome, detail, _ms(start))


def _unverified_context() -> ssl.SSLContext:
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    ctx.set_alpn_protocols(["h2", "http/1.1"])
    return ctx


def _verified_context() -> ssl.SSLContext:
    ctx = ssl.create_default_context()
    ctx.set_alpn_protocols(["http/1.1"])
    return ctx


def tls_handshake(ip: str, sni: str | None, timeout: float, port: int = 443,
                  verify: bool = False, http_get: bool = False, read_limit: int = 65536) -> Probe:
    """TLS-рукопожатие на ip с заданным SNI (None — без SNI).

    verify=True — проверять сертификат для sni (отличает «чужой» сервер от настоящего).
    http_get=True — после рукопожатия запросить «/» и читать ответ (ловит DPI, который
    пропускает рукопожатие, но режет или «замораживает» данные).
    """
    start = time.monotonic()
    ctx = _verified_context() if verify and sni else _unverified_context()
    try:
        raw = _connect(ip, port, timeout)
    except BaseException as e:  # noqa: BLE001
        outcome, detail = classify_exception(e)
        return Probe(outcome, "TCP: " + detail, _ms(start))
    try:
        with ctx.wrap_socket(raw, server_hostname=sni) as s:
            if not http_get:
                return Probe("ok", f"TLS {s.version()}", _ms(start))
            req = (f"GET / HTTP/1.1\r\nHost: {sni}\r\nUser-Agent: {USER_AGENT}\r\n"
                   "Accept: */*\r\nConnection: close\r\n\r\n").encode()
            s.sendall(req)
            return _read_http(s, start, read_limit, after_tls=True)
    except BaseException as e:  # noqa: BLE001
        outcome, detail = classify_exception(e)
        return Probe(outcome, detail, _ms(start))
    finally:
        raw.close()


def _read_http(s: socket.socket, start: float, limit: int, after_tls: bool = False) -> Probe:
    buf = b""
    try:
        while len(buf) < limit:
            chunk = s.recv(min(16384, limit - len(buf)))
            if not chunk:
                break
            buf += chunk
    except BaseException as e:  # noqa: BLE001
        outcome, detail = classify_exception(e)
        if buf and outcome == "timeout":
            # Данные шли и «застыли» — типичный признак замедления/заморозки ТСПУ.
            p = _parse_http(buf, start)
            p.outcome, p.detail = "stall", f"поток данных остановился после {len(buf)} байт"
            return p
        if buf and outcome in ("reset", "eof"):
            p = _parse_http(buf, start)
            if after_tls and p.status is None:
                p.outcome, p.detail = outcome, f"обрыв после {len(buf)} байт"
            return p
        prefix = "после рукопожатия: " if after_tls else ""
        return Probe(outcome, prefix + detail, _ms(start))
    if not buf:
        return Probe("eof", "сервер закрыл соединение без ответа", _ms(start))
    return _parse_http(buf, start)


def _parse_http(buf: bytes, start: float) -> Probe:
    head, _, body = buf.partition(b"\r\n\r\n")
    lines = head.decode("latin-1", "replace").split("\r\n")
    status = None
    location = None
    if lines and lines[0].startswith("HTTP/"):
        try:
            status = int(lines[0].split()[1])
        except (IndexError, ValueError):
            pass
    for line in lines[1:]:
        if line.lower().startswith("location:"):
            location = line.split(":", 1)[1].strip()
    if status is None:
        return Probe("error", "не HTTP-ответ", _ms(start), received=len(buf))
    text = body[:8192].decode("utf-8", "replace")
    if "�" in text[:2000]:
        text = body[:8192].decode("cp1251", "replace")
    return Probe("ok", f"HTTP {status}", _ms(start), status=status, location=location,
                 body=text, received=len(buf))


def http_get(ip: str, host: str, timeout: float, port: int = 80) -> Probe:
    """Обычный HTTP-запрос к ip с заголовком Host."""
    start = time.monotonic()
    try:
        s = _connect(ip, port, timeout)
    except BaseException as e:  # noqa: BLE001
        outcome, detail = classify_exception(e)
        return Probe(outcome, "TCP: " + detail, _ms(start))
    with s:
        try:
            s.sendall((f"GET / HTTP/1.1\r\nHost: {host}\r\nUser-Agent: {USER_AGENT}\r\n"
                       "Accept: */*\r\nConnection: close\r\n\r\n").encode())
        except BaseException as e:  # noqa: BLE001
            outcome, detail = classify_exception(e)
            return Probe(outcome, detail, _ms(start))
        return _read_http(s, start, 16384)


def build_quic_probe() -> bytes:
    """Long-header QUIC-пакет с «зарезервированной» версией: по RFC 9000 сервер
    обязан ответить Version Negotiation. SNI в пакете нет — проверка ловит
    блокировку UDP/443 целиком, но не фильтрацию по SNI внутри QUIC."""
    dcid = os.urandom(8)
    scid = os.urandom(8)
    pkt = bytes([0xC0 | (os.urandom(1)[0] & 0x0F)]) + bytes.fromhex("1a2a3a4a")
    pkt += bytes([len(dcid)]) + dcid + bytes([len(scid)]) + scid
    return pkt + os.urandom(1200 - len(pkt))  # Initial должен быть >= 1200 байт


def quic_probe(ip: str, timeout: float, port: int = 443) -> Probe:
    start = time.monotonic()
    try:
        with socket.socket(_family(ip), socket.SOCK_DGRAM) as s:
            s.settimeout(timeout)
            s.sendto(build_quic_probe(), (ip, port))
            data, _ = s.recvfrom(2048)
        if len(data) >= 5 and data[0] & 0x80 and data[1:5] == b"\x00\x00\x00\x00":
            return Probe("ok", "QUIC Version Negotiation", _ms(start))
        return Probe("ok", f"UDP-ответ {len(data)} байт", _ms(start))
    except BaseException as e:  # noqa: BLE001
        outcome, detail = classify_exception(e)
        return Probe(outcome, detail, _ms(start))
