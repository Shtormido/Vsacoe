#!/usr/bin/env python3
"""Нефритовое Го — веб-сервер для игры.

Только стандартная библиотека Python 3 (есть в Kali Linux «из коробки»).
Раздаёт папку site/: сжимает текст gzip, ставит правильные типы и заголовки
безопасности, не показывает содержимое папок, отвечает на /healthz для проверки.

    python3 server/serve.py                    # http://0.0.0.0:8080
    python3 server/serve.py --port 8000 --host 127.0.0.1
    JADEGO_PORT=8000 python3 server/serve.py
"""
import argparse
import gzip
import http.server
import os
import socket
import sys
import threading

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_SITE = os.path.normpath(os.path.join(HERE, '..', 'site'))

# The game runs inline scripts and its bot in a blob: worker; libraries and fonts come from vendor/,
# with the public CDNs allowed only as the fallback the page itself uses.
CSP = ("default-src 'self'; "
       "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net; "
       "worker-src 'self' blob:; "
       "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
       "font-src 'self' https://fonts.gstatic.com; "
       "img-src 'self' data: blob:; "
       "media-src 'self' blob:; "
       "connect-src 'self'; "
       "object-src 'none'; base-uri 'none'; frame-ancestors 'self'")

COMPRESSIBLE = ('text/', 'application/javascript', 'application/json', 'image/svg+xml')
_gz_cache = {}
_gz_lock = threading.Lock()


class Handler(http.server.SimpleHTTPRequestHandler):
    server_version = 'JadeGo/1.0'
    sys_version = ''
    extensions_map = dict(http.server.SimpleHTTPRequestHandler.extensions_map, **{
        '.js': 'application/javascript', '.mjs': 'application/javascript', '.css': 'text/css',
        '.html': 'text/html', '.json': 'application/json', '.svg': 'image/svg+xml',
        '.woff2': 'font/woff2', '.woff': 'font/woff', '.wasm': 'application/wasm', '.sgf': 'application/x-go-sgf',
    })

    def do_GET(self):
        if self.path.split('?', 1)[0] in ('/healthz', '/health'):
            return self._send_bytes(200, b'ok\n', 'text/plain; charset=utf-8', cache='no-store')
        self._serve(head=False)

    def do_HEAD(self):
        self._serve(head=True)

    def list_directory(self, path):  # never expose directory contents
        self.send_error(404, 'Not Found')
        return None

    def _serve(self, head):
        path = self.translate_path(self.path)
        if os.path.isdir(path):
            if not self.path.split('?', 1)[0].endswith('/'):
                self.send_response(301)
                self.send_header('Location', self.path.split('?', 1)[0] + '/')
                self.end_headers()
                return
            path = os.path.join(path, 'index.html')
        if not os.path.isfile(path) or os.path.basename(path).startswith('.'):
            self.send_error(404, 'Not Found')
            return
        ctype = self.guess_type(path)
        if ctype.startswith('text/') or ctype in ('application/javascript', 'application/json'):
            ctype += '; charset=utf-8'
        st = os.stat(path)
        etag = '"%x-%x"' % (int(st.st_mtime), st.st_size)
        if self.headers.get('If-None-Match') == etag:
            self.send_response(304)
            self.send_header('ETag', etag)
            self._common_headers(path)
            self.end_headers()
            return
        with open(path, 'rb') as f:
            body = f.read()
        gz = 'gzip' in (self.headers.get('Accept-Encoding') or '') and ctype.startswith(COMPRESSIBLE) and len(body) > 1024
        if gz:
            key = (path, st.st_mtime, st.st_size)
            with _gz_lock:
                packed = _gz_cache.get(key)
                if packed is None:
                    packed = gzip.compress(body, 6)
                    _gz_cache[key] = packed
            body = packed
        self.send_response(200)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('ETag', etag)
        if gz:
            self.send_header('Content-Encoding', 'gzip')
        self.send_header('Vary', 'Accept-Encoding')
        self._common_headers(path)
        self.end_headers()
        if not head:
            self.wfile.write(body)

    def _common_headers(self, path):
        # the page itself is always revalidated, so an update reaches players at once; vendor files rarely change
        self.send_header('Cache-Control', 'public, max-age=2592000' if os.sep + 'vendor' + os.sep in path else 'no-cache')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
        if path.endswith('.html'):
            self.send_header('Content-Security-Policy', CSP)

    def _send_bytes(self, code, body, ctype, cache='no-cache'):
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', cache)
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        sys.stdout.write('%s - %s\n' % (self.address_string(), fmt % args))
        sys.stdout.flush()


def lan_addresses():
    """Best-effort list of this machine's IPv4 addresses, for the startup message."""
    found = set()
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(('10.255.255.255', 1))  # no packet is sent; this only picks the outgoing interface
            found.add(s.getsockname()[0])
    except OSError:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            found.add(info[4][0])
    except OSError:
        pass
    return sorted(a for a in found if not a.startswith('127.'))


def main():
    ap = argparse.ArgumentParser(description='Нефритовое Го — веб-сервер')
    ap.add_argument('--host', default=os.environ.get('JADEGO_HOST', '0.0.0.0'), help='адрес (по умолчанию 0.0.0.0 — все сети)')
    ap.add_argument('--port', type=int, default=int(os.environ.get('JADEGO_PORT', '8080')), help='порт (по умолчанию 8080)')
    ap.add_argument('--dir', default=os.environ.get('JADEGO_DIR', DEFAULT_SITE), help='папка с игрой (по умолчанию ../site)')
    a = ap.parse_args()
    site = os.path.abspath(a.dir)
    if not os.path.isfile(os.path.join(site, 'index.html')):
        sys.exit('Не найден %s/index.html — укажите папку игры через --dir' % site)

    handler = lambda *x, **k: Handler(*x, directory=site, **k)
    http.server.ThreadingHTTPServer.allow_reuse_address = True
    try:
        httpd = http.server.ThreadingHTTPServer((a.host, a.port), handler)
    except PermissionError:
        sys.exit('Нет прав на порт %d. Порты ниже 1024 требуют root (sudo) или выберите, например, --port 8080' % a.port)
    except OSError as e:
        sys.exit('Не удалось открыть порт %d: %s (порт уже занят?)' % (a.port, e.strerror))
    httpd.daemon_threads = True

    print('Нефритовое Го: раздаю %s' % site)
    hosts = ['localhost'] + (lan_addresses() if a.host in ('0.0.0.0', '') else [a.host])
    for h in hosts:
        print('  http://%s:%d/' % (h, a.port))
    print('Остановить: Ctrl+C')
    sys.stdout.flush()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print('\nОстановлено.')
    finally:
        httpd.server_close()


if __name__ == '__main__':
    main()
