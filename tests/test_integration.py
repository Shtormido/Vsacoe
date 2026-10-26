"""Интеграционный тест на локальных серверах, имитирующих DPI провайдера:
- TLS с SNI=blocked.test рвётся RST (как ТСПУ), без SNI — проходит;
- slow.test отдаёт 16 КБ и «замерзает»;
- HTTP с Host: httpblock.test получает редирект на блок-страницу.
"""

import shutil
import socket
import ssl
import struct
import subprocess
import tempfile
import threading
import time
import unittest
from pathlib import Path

from blockscan import analyze, dnswire, probes
from blockscan.config import DEFAULTS
from blockscan.scanner import Scanner, Target


def _rst_close(conn: socket.socket) -> None:
    conn.setsockopt(socket.SOL_SOCKET, socket.SO_LINGER, struct.pack("ii", 1, 0))
    conn.close()


class FakeDPIServers:
    def __init__(self, certfile: str, keyfile: str):
        self.ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        self.ctx.load_cert_chain(certfile, keyfile)
        self.tls = socket.create_server(("127.0.0.1", 0))
        self.http = socket.create_server(("127.0.0.1", 0))
        self.tls_port = self.tls.getsockname()[1]
        self.http_port = self.http.getsockname()[1]
        self.stop = False
        for srv, fn in ((self.tls, self._tls_conn), (self.http, self._http_conn)):
            threading.Thread(target=self._loop, args=(srv, fn), daemon=True).start()

    def _loop(self, srv, fn):
        while not self.stop:
            try:
                conn, _ = srv.accept()
            except OSError:
                return
            threading.Thread(target=fn, args=(conn,), daemon=True).start()

    def _tls_conn(self, conn):
        try:
            conn.settimeout(3)
            hello = conn.recv(4096, socket.MSG_PEEK)
            if b"blocked.test" in hello:  # «DPI» увидел SNI в ClientHello
                return _rst_close(conn)
            tls = self.ctx.wrap_socket(conn, server_side=True)
            req = tls.recv(4096)
            if b"Host: slow.test" in req:
                tls.sendall(b"HTTP/1.1 200 OK\r\nContent-Length: 100000\r\n\r\n" + b"x" * 16000)
                time.sleep(4)  # поток «замёрз»
            else:
                tls.sendall(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok")
            tls.close()
        except (OSError, ssl.SSLError):
            conn.close()

    def _http_conn(self, conn):
        try:
            conn.settimeout(3)
            req = conn.recv(4096)
            if b"Host: httpblock.test" in req:
                conn.sendall(b"HTTP/1.1 302 Found\r\nLocation: http://warning.rt.ru/?st=httpblock.test\r\n"
                             b"Content-Length: 0\r\nConnection: close\r\n\r\n")
            else:
                conn.sendall(b"HTTP/1.1 301 Moved\r\nLocation: https://example.test/\r\n"
                             b"Content-Length: 0\r\nConnection: close\r\n\r\n")
            conn.close()
        except OSError:
            conn.close()

    def close(self):
        self.stop = True
        self.tls.close()
        self.http.close()


class FakeReference:
    def resolve(self, name):
        return dnswire.DnsAnswer(ips=["127.0.0.1"])


@unittest.skipUnless(shutil.which("openssl"), "нужен openssl для самоподписанного сертификата")
class IntegrationTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cert, key = Path(cls.tmp.name) / "c.pem", Path(cls.tmp.name) / "k.pem"
        subprocess.run(["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
                        "-subj", "/CN=example.test", "-keyout", str(key), "-out", str(cert)],
                       check=True, capture_output=True)
        cls.srv = FakeDPIServers(str(cert), str(key))

    @classmethod
    def tearDownClass(cls):
        cls.srv.close()
        cls.tmp.cleanup()

    def test_probe_sni_reset_vs_no_sni(self):
        p_sni = probes.tls_handshake("127.0.0.1", "blocked.test", 2, self.srv.tls_port)
        p_none = probes.tls_handshake("127.0.0.1", None, 2, self.srv.tls_port)
        self.assertTrue(p_sni.interrupted, p_sni)
        self.assertEqual(p_none.outcome, "ok", p_none)

    def scanner(self):
        cfg = dict(DEFAULTS, https_port=self.srv.tls_port, http_port=self.srv.http_port, timeout=2,
                   rps=1000, attempts=2, public_udp_dns="", quic=False)
        sc = Scanner(cfg)
        sc.reference = FakeReference()
        return sc

    def check(self, domain):
        orig = dnswire.resolve_system
        dnswire.resolve_system = lambda name: dnswire.DnsAnswer(ips=["127.0.0.1"])
        try:
            return self.scanner().check(Target(domain))
        finally:
            dnswire.resolve_system = orig

    def test_full_check_sni_block(self):
        r = self.check("blocked.test")
        self.assertEqual(r["status"], analyze.BLOCKED, r["reasons"])
        self.assertEqual(r["block_types"], [analyze.DPI])
        self.assertEqual(len(r["details"]["attempts"]), 2)  # подтверждено повторной попыткой

    def test_full_check_throttle(self):
        r = self.check("slow.test")
        self.assertEqual(r["block_types"], [analyze.DPI], r["reasons"])
        self.assertIn("замирает", r["reasons"][0])

    def test_full_check_http_blockpage(self):
        r = self.check("httpblock.test")
        self.assertEqual(r["block_types"], [analyze.HTTP], r["reasons"])

    def test_full_check_available(self):
        r = self.check("fine.test")
        self.assertEqual(r["status"], analyze.AVAILABLE, r["reasons"])
        self.assertEqual(len(r["details"]["attempts"]), 1)


if __name__ == "__main__":
    unittest.main()
