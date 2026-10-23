#!/usr/bin/env python3
"""Нефритовое Го — веб-сервер для игры.

Только стандартная библиотека Python 3 (есть в Kali Linux «из коробки»).
Раздаёт папку site/: сжимает текст gzip, ставит правильные типы и заголовки
безопасности, не показывает содержимое папок, отвечает на /healthz для проверки.
Онлайн-партии: /api/… (комнаты на двоих, ходы проверяются на сервере, события — SSE).
Аккаунты: регистрация и вход, рейтинг и история партий (SQLite в папке data/).

    python3 server/serve.py --signup invite     # регистрация только по приглашениям
    python3 server/serve.py --signup closed     # аккаунты создаёт только админ (server/accounts.py)
    python3 server/serve.py --private           # без входа игра не откроется вовсе

    python3 server/serve.py                    # http://0.0.0.0:8080
    python3 server/serve.py --port 8000 --host 127.0.0.1
    JADEGO_PORT=8000 python3 server/serve.py
"""
import argparse
import gzip
import http.server
import json
import os
import queue
import re
import socket
import sqlite3
import sys
import threading

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import netgo  # noqa: E402  (online rooms)
import accounts  # noqa: E402  (players, sessions, ratings)

ACC = None          # accounts.Accounts, opened in main()
PRIVATE = False     # True: nothing but the sign-in page without an account
COOKIE = 'jg_session'
OPEN_PATHS = ('/login.html', '/vendor/', '/healthz', '/health', '/api/ping', '/api/auth/')

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

    # ---------- accounts ----------
    def _token(self):
        for part in (self.headers.get('Cookie') or '').split(';'):
            k, _, v = part.strip().partition('=')
            if k == COOKIE:
                return v
        return ''

    def _user(self):
        return ACC.user_by_session(self._token()) if ACC else None

    def _cookie(self, token, max_age):
        secure = '; Secure' if (self.headers.get('X-Forwarded-Proto') or '').lower() == 'https' else ''
        return '%s=%s; Path=/; Max-Age=%d; HttpOnly; SameSite=Lax%s' % (COOKIE, token, max_age, secure)

    def _ip(self):
        ip = self.client_address[0]
        if ip.startswith('127.') or ip == '::1':   # behind nginx on the same machine: use the player's address
            ip = (self.headers.get('X-Forwarded-For') or ip).split(',')[0].strip()
        return ip

    def _gate(self, route):
        """Private server: everything except the sign-in page needs an account."""
        if not PRIVATE or any(route.startswith(p) if p.endswith('/') else route == p for p in OPEN_PATHS) or self._user():
            return True
        if route.startswith('/api/'):
            self._json(401, {'error': 'Нужно войти в аккаунт'})
        else:
            self.send_response(302)
            self.send_header('Location', 'login.html')
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
        return False

    def _auth(self, method, route, body):
        u = self._user()
        if route == '/api/auth/me':
            return self._json(200, {'user': ACC.public(u), 'signup': ACC.signup, 'private': PRIVATE})
        if method != 'POST':
            raise netgo.ApiError('Не найдено', 404)
        if route in ('/api/auth/login', '/api/auth/register'):
            try:
                nu = ACC.register(body) if route.endswith('register') else ACC.login(body.get('login'), body.get('password'), self._ip())
            except accounts.AuthError as e:
                raise netgo.ApiError(str(e), e.code)
            token = ACC.new_session(nu['id'])
            return self._json(200, {'user': ACC.public(nu)}, headers={'Set-Cookie': self._cookie(token, accounts.SESSION_DAYS * 86400)})
        if route == '/api/auth/logout':
            ACC.end_session(self._token())
            return self._json(200, {'ok': True}, headers={'Set-Cookie': self._cookie('', 0)})
        if not u:
            raise netgo.ApiError('Нужно войти в аккаунт', 401)
        try:
            if route == '/api/auth/password':
                ACC.set_password(u['id'], body.get('old'), body.get('new'))
                token = ACC.new_session(u['id'])
                return self._json(200, {'ok': True}, headers={'Set-Cookie': self._cookie(token, accounts.SESSION_DAYS * 86400)})
            if route == '/api/auth/name':
                ACC.set_name(u['id'], body.get('name'))
                return self._json(200, {'user': ACC.public(ACC.user_by_session(self._token()))})
        except accounts.AuthError as e:
            raise netgo.ApiError(str(e), e.code)
        raise netgo.ApiError('Не найдено', 404)

    def do_GET(self):
        route = self.path.split('?', 1)[0]
        if not self._gate(route):
            return
        if route in ('/healthz', '/health'):
            return self._send_bytes(200, b'ok\n', 'text/plain; charset=utf-8', cache='no-store')
        if route.startswith('/api/'):
            return self._api('GET', route)
        self._serve(head=False)

    def do_POST(self):
        route = self.path.split('?', 1)[0]
        if not route.startswith('/api/'):
            return self.send_error(405, 'Method Not Allowed')
        # requests from other sites are refused (with the JSON body this also rules out CSRF)
        origin = self.headers.get('Origin')
        if origin and origin.split('://', 1)[-1] != (self.headers.get('X-Forwarded-Host') or self.headers.get('Host') or ''):
            return self._json(403, {'error': 'Запрос с чужого сайта'})
        if not self._gate(route):
            return
        self._api('POST', route)

    # ---------- online play ----------
    def _json(self, code, obj, headers=None):
        self._send_bytes(code, json.dumps(obj, ensure_ascii=False).encode('utf-8'), 'application/json; charset=utf-8', cache='no-store', headers=headers)

    def _api(self, method, route):
        try:
            body = {}
            if method == 'POST':
                n = int(self.headers.get('Content-Length') or 0)
                if n > 8192:
                    raise netgo.ApiError('Слишком большой запрос', 413)
                body = json.loads(self.rfile.read(n) or b'{}') if n else {}
                if not isinstance(body, dict):
                    raise netgo.ApiError('Ожидался JSON-объект')
            m = re.fullmatch(r'/api/rooms/([A-Za-z0-9]{6})(?:/(join|act|events))?', route)
            if route == '/api/ping' and method == 'GET':
                return self._json(200, {'ok': True, 'online': True, 'accounts': True})
            if route.startswith('/api/auth/'):
                return self._auth(method, route, body)
            if route == '/api/leaderboard' and method == 'GET':
                return self._json(200, {'top': ACC.leaderboard()})
            if route == '/api/me/games' and method == 'GET':
                u = self._user()
                if not u:
                    raise netgo.ApiError('Нужно войти в аккаунт', 401)
                return self._json(200, {'games': ACC.games_of(u['id'])})
            if route == '/api/rooms' and method == 'POST':
                u = self._user()
                if not u:
                    raise netgo.ApiError('Чтобы играть по сети, войдите в аккаунт', 401)
                return self._json(200, netgo.create(body, self._ip(), ACC.public(u)))
            if m and method == 'GET' and m.group(2) is None:
                return self._json(200, netgo.info(m.group(1)))
            if m and method == 'POST' and m.group(2) == 'join':
                u = self._user()
                if not u:
                    raise netgo.ApiError('Чтобы играть по сети, войдите в аккаунт', 401)
                return self._json(200, netgo.join(m.group(1), body, ACC.public(u)))
            if m and method == 'POST' and m.group(2) == 'act':
                return self._json(200, netgo.act(m.group(1), body))
            if m and method == 'GET' and m.group(2) == 'events':
                q = re.search(r'[?&]token=([A-Za-z0-9_-]+)', self.path)
                return self._events(m.group(1), q.group(1) if q else '')
            raise netgo.ApiError('Не найдено', 404)
        except netgo.ApiError as e:
            self._json(e.code, {'error': str(e)})
        except (ValueError, json.JSONDecodeError):
            self._json(400, {'error': 'Неверный запрос'})

    def _events(self, code, token):
        room, q, _ = netgo.subscribe(code, token)
        try:
            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream; charset=utf-8')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Accel-Buffering', 'no')      # nginx: do not buffer the stream
            self.end_headers()
            self.wfile.write(b'retry: 2000\n\n')
            while True:
                try:
                    msg = q.get(timeout=15)
                    self.wfile.write(b'data: ' + msg.encode('utf-8') + b'\n\n')
                except queue.Empty:
                    self.wfile.write(b': ping\n\n')      # keeps proxies and NAT from closing an idle stream
                self.wfile.flush()
                if room.phase == 'closed':
                    break
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass
        finally:
            netgo.unsubscribe(room, q)

    def do_HEAD(self):
        if self._gate(self.path.split('?', 1)[0]):
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

    def _send_bytes(self, code, body, ctype, cache='no-cache', headers=None):
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', cache)
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        if '/api/' in (getattr(self, 'path', '') or '') and ' 200 ' in (' %s ' % ' '.join(map(str, args))):
            return  # online play is chatty; log only its errors
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
    ap.add_argument('--data', default=accounts.DEFAULT_DATA, help='папка для базы аккаунтов (по умолчанию ../data или $JADEGO_DATA)')
    ap.add_argument('--signup', choices=('open', 'invite', 'closed'), default=os.environ.get('JADEGO_SIGNUP', 'open'),
                    help='регистрация: open — для всех, invite — по приглашениям, closed — только админ')
    ap.add_argument('--private', action='store_true', default=os.environ.get('JADEGO_PRIVATE', '') in ('1', 'yes', 'true'),
                    help='закрытый сервер: без входа в аккаунт игра не откроется')
    a = ap.parse_args()
    site = os.path.abspath(a.dir)
    if not os.path.isfile(os.path.join(site, 'index.html')):
        sys.exit('Не найден %s/index.html — укажите папку игры через --dir' % site)

    global ACC, PRIVATE
    try:
        ACC = accounts.Accounts(a.data, a.signup)
    except (OSError, sqlite3.Error) as e:
        sys.exit('Не удалось открыть базу аккаунтов в %s: %s' % (a.data, e))
    PRIVATE = a.private
    netgo.ON_FINISH = lambda room, result: ACC.record_game(room, room.seats[1], room.seats[2], result, room.moves)
    handler = lambda *x, **k: Handler(*x, directory=site, **k)
    # on Windows SO_REUSEADDR would let a second copy silently share the port, so only reuse it elsewhere
    http.server.ThreadingHTTPServer.allow_reuse_address = os.name != 'nt'
    try:
        httpd = http.server.ThreadingHTTPServer((a.host, a.port), handler)
    except PermissionError:
        sys.exit('Нет прав на порт %d. Порты ниже 1024 требуют root (sudo) или выберите, например, --port 8080' % a.port)
    except OSError as e:
        sys.exit('Не удалось открыть порт %d: %s (порт уже занят?)' % (a.port, e.strerror))
    httpd.daemon_threads = True

    print('Нефритовое Го: раздаю %s' % site)
    users = ACC.q('SELECT COUNT(*) AS n FROM users', one=True)['n']
    print('Аккаунты: %s, регистрация %s%s. Аккаунтов: %d%s' % (ACC.path, {'open': 'открыта', 'invite': 'по приглашениям', 'closed': 'закрыта'}[ACC.signup],
          ', сервер закрытый' if PRIVATE else '', users, ' — первый зарегистрированный станет администратором' if not users else ''))
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
