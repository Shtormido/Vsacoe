#!/usr/bin/env python3
"""Accounts for the Jade Go server: players, sessions, ratings, game history.

Stored in SQLite (stdlib). Passwords are kept only as salted PBKDF2-SHA256 hashes; sessions are
random tokens handed to the browser in an HttpOnly cookie, of which the server keeps only a hash.

Admin commands (Kali/Linux service: run as the service user against its data folder):
    python3 server/accounts.py list
    python3 server/accounts.py add LOGIN [--admin]          # asks for the password
    python3 server/accounts.py passwd LOGIN
    python3 server/accounts.py admin LOGIN | unadmin LOGIN
    python3 server/accounts.py del LOGIN
    python3 server/accounts.py invite [--uses N]            # code for --signup invite
    python3 server/accounts.py invites
    sudo -u jadego python3 /opt/jade-go/server/accounts.py --data /var/lib/jade-go list
"""
import argparse
import getpass
import hashlib
import hmac
import os
import re
import secrets
import sqlite3
import sys
import threading
import time

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_DATA = os.environ.get('JADEGO_DATA') or os.path.normpath(os.path.join(HERE, '..', 'data'))
ITER = 240_000
SESSION_DAYS = 30
LOGIN_RE = re.compile(r'^[A-Za-z0-9_.-]{3,20}$')

SCHEMA = '''
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY, login TEXT NOT NULL UNIQUE COLLATE NOCASE, name TEXT NOT NULL,
  pw TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user', rating REAL NOT NULL DEFAULT 1500,
  games INTEGER NOT NULL DEFAULT 0, wins INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL, seen INTEGER);
CREATE TABLE IF NOT EXISTS sessions(
  hash TEXT PRIMARY KEY, uid INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, created INTEGER NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS games(
  id INTEGER PRIMARY KEY, room TEXT, n INTEGER, komi REAL, black INTEGER, white INTEGER, black_name TEXT, white_name TEXT,
  winner INTEGER, by TEXT, margin REAL, moves TEXT, black_delta REAL, white_delta REAL, ended INTEGER);
CREATE TABLE IF NOT EXISTS invites(code TEXT PRIMARY KEY, uses INTEGER NOT NULL, created INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS games_black ON games(black);
CREATE INDEX IF NOT EXISTS games_white ON games(white);
'''


class AuthError(Exception):
    def __init__(self, msg, code=400):
        super().__init__(msg)
        self.code = code


def hash_password(pw, salt=None, it=ITER):
    salt = salt or secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac('sha256', pw.encode('utf-8'), salt.encode(), it)
    return 'pbkdf2$%d$%s$%s' % (it, salt, dk.hex())


def check_password(pw, stored):
    try:
        _, it, salt, _h = stored.split('$')
        return hmac.compare_digest(hash_password(pw, salt, int(it)), stored)
    except (ValueError, TypeError):
        return False


def clean_name(s):
    s = re.sub(r'[\x00-\x1f\x7f<>]', '', str(s or '')).strip()
    return s[:20]


def check_new_password(pw):
    if not isinstance(pw, str) or len(pw) < 6:
        raise AuthError('Пароль — не короче 6 символов')
    if len(pw) > 128:
        raise AuthError('Слишком длинный пароль')


def elo(ra, rb, score_a, games_a, games_b):
    """Elo with a larger step for newcomers, so ratings settle quickly."""
    ka = 40 if games_a < 10 else 24
    kb = 40 if games_b < 10 else 24
    ea = 1 / (1 + 10 ** ((rb - ra) / 400))
    return ka * (score_a - ea), kb * ((1 - score_a) - (1 - ea))


class Accounts:
    def __init__(self, data_dir=DEFAULT_DATA, signup='open'):
        os.makedirs(data_dir, exist_ok=True)
        self.path = os.path.join(data_dir, 'jadego.db')
        self.signup = signup if signup in ('open', 'invite', 'closed') else 'open'
        self.db = sqlite3.connect(self.path, check_same_thread=False, isolation_level=None)
        self.db.row_factory = sqlite3.Row
        self.lock = threading.Lock()
        with self.lock:
            self.db.execute('PRAGMA journal_mode=WAL')
            self.db.execute('PRAGMA foreign_keys=ON')
            self.db.executescript(SCHEMA)
        self.attempts = {}       # key -> [times] for login throttling

    def q(self, sql, args=(), one=False):
        with self.lock:
            cur = self.db.execute(sql, args)
            return cur.fetchone() if one else cur.fetchall()

    @staticmethod
    def public(u):
        if not u:
            return None
        return {'id': u['id'], 'login': u['login'], 'name': u['name'], 'role': u['role'],
                'rating': round(u['rating']), 'games': u['games'], 'wins': u['wins']}

    # ---------- users ----------
    def create_user(self, login, password, name=None, role=None):
        login = str(login or '').strip()
        if not LOGIN_RE.match(login):
            raise AuthError('Логин: 3–20 латинских букв, цифр, точек, дефисов или подчёркиваний')
        check_new_password(password)
        name = clean_name(name) or login
        with self.lock:
            if self.db.execute('SELECT 1 FROM users WHERE login=?', (login,)).fetchone():
                raise AuthError('Такой логин уже занят', 409)
            first = not self.db.execute('SELECT 1 FROM users LIMIT 1').fetchone()
            role = role or ('admin' if first else 'user')     # the first account on a server runs it
            cur = self.db.execute('INSERT INTO users(login,name,pw,role,created) VALUES(?,?,?,?,?)',
                                  (login, name, hash_password(password), role, int(time.time())))
            return self.db.execute('SELECT * FROM users WHERE id=?', (cur.lastrowid,)).fetchone()

    def register(self, d):
        if self.signup == 'closed':
            raise AuthError('Регистрация закрыта — попросите администратора создать аккаунт', 403)
        if self.signup == 'invite':
            code = str(d.get('invite') or '').strip().upper()
            with self.lock:
                row = self.db.execute('SELECT uses FROM invites WHERE code=?', (code,)).fetchone()
                if not row or row['uses'] <= 0:
                    raise AuthError('Нужен действующий код приглашения', 403)
                self.db.execute('UPDATE invites SET uses=uses-1 WHERE code=?', (code,))
        return self.create_user(d.get('login'), d.get('password'), d.get('name'))

    def _throttle(self, key):
        now = time.time()
        recent = [t for t in self.attempts.get(key, []) if now - t < 600]
        self.attempts[key] = recent
        if len(recent) >= 10:
            raise AuthError('Слишком много попыток входа — подождите 10 минут', 429)

    def login(self, login, password, ip):
        login = str(login or '').strip()
        for key in ('ip:' + ip, 'login:' + login.lower()):
            self._throttle(key)
        u = self.q('SELECT * FROM users WHERE login=?', (login,), one=True)
        if not u or not check_password(str(password or ''), u['pw']):
            for key in ('ip:' + ip, 'login:' + login.lower()):
                self.attempts.setdefault(key, []).append(time.time())
            raise AuthError('Неверный логин или пароль', 401)
        self.attempts.pop('login:' + login.lower(), None)
        return u

    def set_password(self, uid, old, new):
        u = self.q('SELECT * FROM users WHERE id=?', (uid,), one=True)
        if not u or not check_password(str(old or ''), u['pw']):
            raise AuthError('Текущий пароль указан неверно', 403)
        check_new_password(new)
        self.q('UPDATE users SET pw=? WHERE id=?', (hash_password(new), uid))
        self.q('DELETE FROM sessions WHERE uid=?', (uid,))     # sign out everywhere else

    def set_name(self, uid, name):
        name = clean_name(name)
        if not name:
            raise AuthError('Имя не может быть пустым')
        self.q('UPDATE users SET name=? WHERE id=?', (name, uid))

    # ---------- sessions ----------
    def new_session(self, uid):
        token = secrets.token_urlsafe(32)
        now = int(time.time())
        self.q('INSERT INTO sessions(hash,uid,created,expires) VALUES(?,?,?,?)',
               (hashlib.sha256(token.encode()).hexdigest(), uid, now, now + SESSION_DAYS * 86400))
        self.q('DELETE FROM sessions WHERE expires<?', (now,))
        return token

    def user_by_session(self, token):
        if not token:
            return None
        h = hashlib.sha256(token.encode()).hexdigest()
        u = self.q('SELECT u.* FROM sessions s JOIN users u ON u.id=s.uid WHERE s.hash=? AND s.expires>?', (h, int(time.time())), one=True)
        if u:
            self.q('UPDATE users SET seen=? WHERE id=?', (int(time.time()), u['id']))
        return u

    def end_session(self, token):
        if token:
            self.q('DELETE FROM sessions WHERE hash=?', (hashlib.sha256(token.encode()).hexdigest(),))

    # ---------- games and ratings ----------
    def record_game(self, room, black, white, result, moves):
        """black/white: {'uid','name'}; result: {'winner','by','margin'}. Updates both ratings."""
        with self.lock:
            b = self.db.execute('SELECT * FROM users WHERE id=?', (black.get('uid'),)).fetchone() if black.get('uid') else None
            w = self.db.execute('SELECT * FROM users WHERE id=?', (white.get('uid'),)).fetchone() if white.get('uid') else None
            db_ = dw = 0.0
            if b and w and b['id'] != w['id']:
                db_, dw = elo(b['rating'], w['rating'], 1.0 if result['winner'] == 1 else 0.0, b['games'], w['games'])
                for u, d, won in ((b, db_, result['winner'] == 1), (w, dw, result['winner'] == 2)):
                    self.db.execute('UPDATE users SET rating=rating+?, games=games+1, wins=wins+? WHERE id=?', (d, 1 if won else 0, u['id']))
            self.db.execute('INSERT INTO games(room,n,komi,black,white,black_name,white_name,winner,by,margin,moves,black_delta,white_delta,ended) '
                            'VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                            (room.code, room.n, room.komi, b['id'] if b else None, w['id'] if w else None, black.get('name'), white.get('name'),
                             result['winner'], result['by'], result.get('margin') or 0, ','.join(str(m[1]) for m in moves), db_, dw, int(time.time())))

    def games_of(self, uid, limit=30):
        rows = self.q('SELECT * FROM games WHERE black=? OR white=? ORDER BY ended DESC LIMIT ?', (uid, uid, limit))
        out = []
        for g in rows:
            me = 1 if g['black'] == uid else 2
            out.append({'d': g['ended'] * 1000, 'n': g['n'], 'komi': g['komi'], 'you': me, 'opp': g['white_name'] if me == 1 else g['black_name'],
                        'w': g['winner'], 'by': g['by'], 'm': g['margin'], 'moves': g['moves'],
                        'delta': round(g['black_delta'] if me == 1 else g['white_delta'])})
        return out

    def leaderboard(self, limit=20):
        rows = self.q('SELECT * FROM users WHERE games>0 ORDER BY rating DESC LIMIT ?', (limit,))
        return [{'name': r['name'], 'rating': round(r['rating']), 'games': r['games'], 'wins': r['wins']} for r in rows]

    # ---------- invites ----------
    def make_invite(self, uses=1):
        code = ''.join(secrets.choice('ABCDEFGHJKLMNPQRSTUVWXYZ23456789') for _ in range(8))
        self.q('INSERT INTO invites(code,uses,created) VALUES(?,?,?)', (code, max(1, int(uses)), int(time.time())))
        return code


# ---------- admin command line ----------
def _ask_password():
    while True:
        a = getpass.getpass('Пароль: ')
        b = getpass.getpass('Ещё раз: ')
        if a != b:
            print('Пароли не совпали, ещё раз.')
            continue
        try:
            check_new_password(a)
            return a
        except AuthError as e:
            print(e)


def main():
    ap = argparse.ArgumentParser(description='Нефритовое Го — управление аккаунтами')
    ap.add_argument('--data', default=DEFAULT_DATA, help='папка с базой (по умолчанию ../data или $JADEGO_DATA)')
    sub = ap.add_subparsers(dest='cmd', required=True)
    sub.add_parser('list', help='список аккаунтов')
    a = sub.add_parser('add', help='создать аккаунт')
    a.add_argument('login')
    a.add_argument('--name')
    a.add_argument('--admin', action='store_true')
    for c in ('passwd', 'del', 'admin', 'unadmin'):
        sub.add_parser(c).add_argument('login')
    i = sub.add_parser('invite', help='код приглашения')
    i.add_argument('--uses', type=int, default=1)
    sub.add_parser('invites')
    args = ap.parse_args()
    acc = Accounts(args.data)

    def find(login):
        u = acc.q('SELECT * FROM users WHERE login=?', (login,), one=True)
        if not u:
            sys.exit('Нет аккаунта «%s»' % login)
        return u

    try:
        if args.cmd == 'list':
            rows = acc.q('SELECT * FROM users ORDER BY id')
            if not rows:
                print('Аккаунтов пока нет.')
            for u in rows:
                seen = time.strftime('%Y-%m-%d', time.localtime(u['seen'])) if u['seen'] else '—'
                print('%-20s %-20s %-5s рейтинг %4d  партий %3d  побед %3d  был %s' % (u['login'], u['name'], u['role'], u['rating'], u['games'], u['wins'], seen))
        elif args.cmd == 'add':
            u = acc.create_user(args.login, _ask_password(), args.name, 'admin' if args.admin else None)
            print('Создан %s (%s)' % (u['login'], u['role']))
        elif args.cmd == 'passwd':
            u = find(args.login)
            acc.q('UPDATE users SET pw=? WHERE id=?', (hash_password(_ask_password()), u['id']))
            acc.q('DELETE FROM sessions WHERE uid=?', (u['id'],))
            print('Пароль изменён, все входы %s завершены.' % u['login'])
        elif args.cmd in ('admin', 'unadmin'):
            u = find(args.login)
            acc.q('UPDATE users SET role=? WHERE id=?', ('admin' if args.cmd == 'admin' else 'user', u['id']))
            print('%s теперь %s' % (u['login'], 'администратор' if args.cmd == 'admin' else 'обычный игрок'))
        elif args.cmd == 'del':
            u = find(args.login)
            acc.q('DELETE FROM users WHERE id=?', (u['id'],))
            print('Аккаунт %s удалён.' % u['login'])
        elif args.cmd == 'invite':
            print(acc.make_invite(args.uses))
        elif args.cmd == 'invites':
            for r in acc.q('SELECT * FROM invites WHERE uses>0 ORDER BY created DESC'):
                print('%s  осталось %d' % (r['code'], r['uses']))
    except AuthError as e:
        sys.exit(str(e))


if __name__ == '__main__':
    main()
