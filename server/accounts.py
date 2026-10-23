#!/usr/bin/env python3
"""Accounts for the Jade Go server: players, sessions, ratings, game history.

Stored in SQLite (stdlib). Passwords are kept only as salted PBKDF2-SHA256 hashes; sessions are
random tokens handed to the browser in an HttpOnly cookie, of which the server keeps only a hash.

Admin commands (Kali/Linux service: run as the service user against its data folder):
    python3 server/accounts.py list
    python3 server/accounts.py add LOGIN [--admin]          # asks for the password
    python3 server/accounts.py passwd LOGIN
    python3 server/accounts.py rename LOGIN NEW_LOGIN       # rating, games and sessions stay with the account
    python3 server/accounts.py admin LOGIN | unadmin LOGIN
    python3 server/accounts.py del LOGIN
    python3 server/accounts.py invite [--uses N]            # code for --signup invite
    python3 server/accounts.py invites
    python3 server/accounts.py guests on|off                # may people play online without an account
    python3 server/accounts.py signup open|invite|closed    # who may create an account
    python3 server/accounts.py block LOGIN | unblock LOGIN
    python3 server/accounts.py rating LOGIN 1650             # set a rating by hand
    python3 server/accounts.py recompute                    # replay every rated game to rebuild the ratings
Most of this is also in the browser: Account → Server management (admins only).
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
SIGNUP_MODES = ('open', 'invite', 'closed')
LOGIN_RULE = 'Логин: 3–20 латинских букв, цифр, точек, дефисов или подчёркиваний'

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
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY, t INTEGER NOT NULL, admin INTEGER, admin_login TEXT, action TEXT NOT NULL, detail TEXT);
CREATE INDEX IF NOT EXISTS games_black ON games(black);
CREATE INDEX IF NOT EXISTS games_white ON games(white);
'''
# columns added after the first release: (table, column, definition)
MIGRATIONS = (('users', 'hide_games', 'INTEGER NOT NULL DEFAULT 0'),     # keep all my games from spectators and the archive
              ('users', 'blocked', 'INTEGER NOT NULL DEFAULT 0'),        # set by an admin: no sign-in
              ('games', 'public', 'INTEGER NOT NULL DEFAULT 0'),         # both players allowed others to watch
              ('games', 'started', 'INTEGER'),
              ('games', 'clock', 'INTEGER'))


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
    def __init__(self, data_dir=DEFAULT_DATA, signup=None):
        os.makedirs(data_dir, exist_ok=True)
        self.path = os.path.join(data_dir, 'jadego.db')
        self.started = time.time()
        self.db = sqlite3.connect(self.path, check_same_thread=False, isolation_level=None)
        self.db.row_factory = sqlite3.Row
        self.lock = threading.Lock()
        with self.lock:
            self.db.execute('PRAGMA journal_mode=WAL')
            self.db.execute('PRAGMA foreign_keys=ON')
            self.db.executescript(SCHEMA)
            for table, col, sql in MIGRATIONS:
                if col not in [r['name'] for r in self.db.execute('PRAGMA table_info(%s)' % table)]:
                    self.db.execute('ALTER TABLE %s ADD COLUMN %s %s' % (table, col, sql))
            self.db.execute('CREATE INDEX IF NOT EXISTS games_public ON games(public, ended)')
        self.attempts = {}       # key -> [times] for login throttling
        if signup in SIGNUP_MODES:  # given at start (--signup): stored, so the admin can still change it later
            self.set_setting('signup', signup)

    def q(self, sql, args=(), one=False):
        with self.lock:
            cur = self.db.execute(sql, args)
            return cur.fetchone() if one else cur.fetchall()

    @staticmethod
    def public(u):
        if not u:
            return None
        return {'id': u['id'], 'login': u['login'], 'name': u['name'], 'role': u['role'],
                'rating': round(u['rating']), 'games': u['games'], 'wins': u['wins'], 'hide': bool(u['hide_games'])}

    # ---------- server settings (changed by the admin) ----------
    def setting(self, key, default=None):
        row = self.q('SELECT value FROM settings WHERE key=?', (key,), one=True)
        return row['value'] if row else default

    def set_setting(self, key, value):
        self.q('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)', (key, str(value)))

    @property
    def signup(self):
        """open — anyone may sign up, invite — with an invitation code, closed — only the admin creates accounts"""
        v = self.setting('signup', 'open')
        return v if v in SIGNUP_MODES else 'open'

    @property
    def guests(self):
        """Guests play online under a name of their choice, without an account and outside the ratings."""
        return self.setting('guests', 'on') == 'on'

    # ---------- users ----------
    def create_user(self, login, password, name=None, role=None):
        login = str(login or '').strip()
        if not LOGIN_RE.match(login):
            raise AuthError(LOGIN_RULE)
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
        if u['blocked']:
            raise AuthError('Аккаунт заблокирован администратором сервера', 403)
        self.attempts.pop('login:' + login.lower(), None)
        return u

    def set_password(self, uid, old, new):
        u = self.q('SELECT * FROM users WHERE id=?', (uid,), one=True)
        if not u or not check_password(str(old or ''), u['pw']):
            raise AuthError('Текущий пароль указан неверно', 403)
        check_new_password(new)
        self.q('UPDATE users SET pw=? WHERE id=?', (hash_password(new), uid))
        self.q('DELETE FROM sessions WHERE uid=?', (uid,))     # sign out everywhere else

    def set_login(self, uid, password, new):
        """A new login, confirmed with the current password (tries are limited like sign-ins)."""
        key = 'uid:%d' % uid
        self._throttle(key)
        u = self.q('SELECT * FROM users WHERE id=?', (uid,), one=True)
        if not u or not check_password(str(password or ''), u['pw']):
            self.attempts.setdefault(key, []).append(time.time())
            raise AuthError('Текущий пароль указан неверно', 403)
        return self.rename(u, new)

    def rename(self, u, new):
        """Changes the login only: sessions, rating and games are tied to the account id and stay.
        A display name that was simply the old login follows it."""
        new = str(new or '').strip()
        if not LOGIN_RE.match(new):
            raise AuthError(LOGIN_RULE)
        if new == u['login']:
            raise AuthError('Это и так ваш логин')
        with self.lock:
            other = self.db.execute('SELECT id FROM users WHERE login=?', (new,)).fetchone()
            if other and other['id'] != u['id']:
                raise AuthError('Такой логин уже занят', 409)
            self.db.execute('UPDATE users SET login=? WHERE id=?', (new, u['id']))
            if u['name'] == u['login']:
                self.db.execute('UPDATE users SET name=? WHERE id=?', (new, u['id']))
            return self.db.execute('SELECT * FROM users WHERE id=?', (u['id'],)).fetchone()

    def set_hide(self, uid, hide):
        self.q('UPDATE users SET hide_games=? WHERE id=?', (1 if hide else 0, uid))

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
        self.q('UPDATE users SET seen=? WHERE id=?', (now, uid))
        return token

    def user_by_session(self, token):
        if not token:
            return None
        h = hashlib.sha256(token.encode()).hexdigest()
        u = self.q('SELECT u.* FROM sessions s JOIN users u ON u.id=s.uid WHERE s.hash=? AND s.expires>? AND u.blocked=0', (h, int(time.time())), one=True)
        if u:
            self.q('UPDATE users SET seen=? WHERE id=?', (int(time.time()), u['id']))
        return u

    def end_session(self, token):
        if token:
            self.q('DELETE FROM sessions WHERE hash=?', (hashlib.sha256(token.encode()).hexdigest(),))

    # ---------- games and ratings ----------
    def record_game(self, room, black, white, result, moves, public=False):
        """black/white: {'uid','name'}; result: {'winner','by','margin'}. Updates both ratings when both are accounts:
        a game with a guest is kept in the history and the archive, but never touches a rating."""
        with self.lock:
            b = self.db.execute('SELECT * FROM users WHERE id=?', (black.get('uid'),)).fetchone() if black.get('uid') else None
            w = self.db.execute('SELECT * FROM users WHERE id=?', (white.get('uid'),)).fetchone() if white.get('uid') else None
            db_ = dw = 0.0
            if b and w and b['id'] != w['id']:
                db_, dw = elo(b['rating'], w['rating'], 1.0 if result['winner'] == 1 else 0.0, b['games'], w['games'])
                for u, d, won in ((b, db_, result['winner'] == 1), (w, dw, result['winner'] == 2)):
                    self.db.execute('UPDATE users SET rating=rating+?, games=games+1, wins=wins+? WHERE id=?', (d, 1 if won else 0, u['id']))
            self.db.execute('INSERT INTO games(room,n,komi,black,white,black_name,white_name,winner,by,margin,moves,black_delta,white_delta,ended,public,started,clock) '
                            'VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                            (room.code, room.n, room.komi, b['id'] if b else None, w['id'] if w else None, black.get('name'), white.get('name'),
                             result['winner'], result['by'], result.get('margin') or 0, ','.join(str(m[1]) for m in moves), db_, dw, int(time.time()),
                             1 if public else 0, int(getattr(room, 'started', 0) or 0) or None, getattr(room, 'clock_min', None)))

    def games_of(self, uid, limit=30):
        rows = self.q('SELECT * FROM games WHERE black=? OR white=? ORDER BY ended DESC LIMIT ?', (uid, uid, limit))
        out = []
        for g in rows:
            me = 1 if g['black'] == uid else 2
            out.append({'id': g['id'], 'd': g['ended'] * 1000, 'n': g['n'], 'komi': g['komi'], 'you': me, 'opp': g['white_name'] if me == 1 else g['black_name'],
                        'oppGuest': (g['white'] if me == 1 else g['black']) is None,
                        'w': g['winner'], 'by': g['by'], 'm': g['margin'], 'moves': g['moves'], 'public': bool(g['public']),
                        'delta': round(g['black_delta'] if me == 1 else g['white_delta'])})
        return out

    # ---------- the server's archive of open games ----------
    VISIBLE = ('g.public=1 AND NOT EXISTS (SELECT 1 FROM users u WHERE u.hide_games=1 AND u.id IN (g.black, g.white))')

    @staticmethod
    def _card(g, moves=False):
        out = {'id': g['id'], 'd': g['ended'] * 1000, 'n': g['n'], 'komi': g['komi'], 'clock': g['clock'],
               'names': {1: g['black_name'], 2: g['white_name']}, 'guest': {1: g['black'] is None, 2: g['white'] is None},
               'w': g['winner'], 'by': g['by'], 'm': g['margin'], 'count': len(g['moves'].split(',')) if g['moves'] else 0}
        if moves:
            out['moves'] = g['moves']
        return out

    def archive(self, limit=30):
        """Recent finished games that both players left open (and neither account hides)."""
        return [self._card(g) for g in self.q('SELECT g.* FROM games g WHERE %s ORDER BY g.ended DESC LIMIT ?' % self.VISIBLE, (limit,))]

    def game(self, gid, uid=None):
        """One game with its moves, for a replay: an open game, or one of the viewer's own."""
        g = self.q('SELECT g.* FROM games g WHERE g.id=? AND (%s OR ? IN (g.black, g.white))' % self.VISIBLE, (gid, uid or -1), one=True)
        if not g:
            raise AuthError('Партия не найдена или скрыта игроками', 404)
        return self._card(g, moves=True)

    def leaderboard(self, limit=20):
        rows = self.q('SELECT * FROM users WHERE games>0 AND blocked=0 ORDER BY rating DESC LIMIT ?', (limit,))
        return [{'name': r['name'], 'rating': round(r['rating']), 'games': r['games'], 'wins': r['wins']} for r in rows]

    # ---------- invites ----------
    def make_invite(self, uses=1):
        code = ''.join(secrets.choice('ABCDEFGHJKLMNPQRSTUVWXYZ23456789') for _ in range(8))
        self.q('INSERT INTO invites(code,uses,created) VALUES(?,?,?)', (code, max(1, int(uses)), int(time.time())))
        return code


    # ---------- administration ----------
    def log(self, admin, action, detail=''):
        """The admin journal: who did what and when (admin is a users row, or None for the command line)."""
        self.q('INSERT INTO audit(t,admin,admin_login,action,detail) VALUES(?,?,?,?,?)',
               (int(time.time()), admin['id'] if admin else None, admin['login'] if admin else 'консоль', action, str(detail)[:300]))
        self.q('DELETE FROM audit WHERE id NOT IN (SELECT id FROM audit ORDER BY id DESC LIMIT 2000)')

    def journal(self, limit=60):
        return [{'t': r['t'] * 1000, 'who': r['admin_login'], 'action': r['action'], 'detail': r['detail']}
                for r in self.q('SELECT * FROM audit ORDER BY id DESC LIMIT ?', (limit,))]

    @staticmethod
    def row(u):
        return {'id': u['id'], 'login': u['login'], 'name': u['name'], 'role': u['role'], 'rating': round(u['rating']),
                'games': u['games'], 'wins': u['wins'], 'created': u['created'] * 1000, 'seen': (u['seen'] or 0) * 1000,
                'blocked': bool(u['blocked']), 'hide': bool(u['hide_games'])}

    def users(self, query='', offset=0, limit=50):
        like = '%' + str(query or '').strip() + '%'
        rows = self.q('SELECT * FROM users WHERE login LIKE ? OR name LIKE ? ORDER BY COALESCE(seen,created) DESC LIMIT ? OFFSET ?',
                      (like, like, limit, max(0, int(offset or 0))))
        total = self.q('SELECT COUNT(*) AS n FROM users WHERE login LIKE ? OR name LIKE ?', (like, like), one=True)['n']
        return {'users': [self.row(u) for u in rows], 'total': total}

    def user(self, uid):
        u = self.q('SELECT * FROM users WHERE id=?', (uid,), one=True)
        if not u:
            raise AuthError('Нет такого игрока', 404)
        return u

    def admins(self):
        return self.q('SELECT COUNT(*) AS n FROM users WHERE role=\'admin\' AND blocked=0', one=True)['n']

    def admin_user(self, admin, uid, action, d):
        """One change to one account. Returns the updated row (None once deleted)."""
        u = self.user(uid)
        me = admin and admin['id'] == u['id']
        last = u['role'] == 'admin' and self.admins() <= 1
        if action == 'login':
            old_login = u['login']
            u = self.rename(u, d.get('login'))
            self.log(admin, 'логин', '%s → %s' % (old_login, u['login']))
        elif action == 'name':
            name = clean_name(d.get('name'))
            if not name:
                raise AuthError('Имя не может быть пустым')
            self.q('UPDATE users SET name=? WHERE id=?', (name, uid))
            self.log(admin, 'имя', '%s: «%s»' % (u['login'], name))
        elif action == 'password':
            check_new_password(d.get('password'))
            self.q('UPDATE users SET pw=? WHERE id=?', (hash_password(d['password']), uid))
            self.q('DELETE FROM sessions WHERE uid=?', (uid,))
            self.log(admin, 'пароль', '%s: новый пароль, все входы завершены' % u['login'])
        elif action == 'rating':
            try:
                rating = float(d.get('rating'))
                games = int(d.get('games', u['games']))
                wins = int(d.get('wins', u['wins']))
            except (TypeError, ValueError):
                raise AuthError('Рейтинг, партии и победы — числа')
            if not 0 <= rating <= 5000 or games < 0 or not 0 <= wins <= games:
                raise AuthError('Рейтинг от 0 до 5000, побед не больше, чем партий')
            self.q('UPDATE users SET rating=?, games=?, wins=? WHERE id=?', (rating, games, wins, uid))
            self.log(admin, 'рейтинг', '%s: %d → %d, партий %d, побед %d' % (u['login'], round(u['rating']), round(rating), games, wins))
        elif action == 'role':
            role = 'admin' if d.get('role') == 'admin' else 'user'
            if role == 'user' and last:
                raise AuthError('Это последний администратор — сначала назначьте другого')
            self.q('UPDATE users SET role=? WHERE id=?', (role, uid))
            self.log(admin, 'права', '%s: %s' % (u['login'], 'администратор' if role == 'admin' else 'обычный игрок'))
        elif action == 'block':
            on = d.get('on') is True
            if on and (me or last):
                raise AuthError('Нельзя заблокировать себя или последнего администратора')
            self.q('UPDATE users SET blocked=? WHERE id=?', (1 if on else 0, uid))
            if on:
                self.q('DELETE FROM sessions WHERE uid=?', (uid,))
            self.log(admin, 'блокировка' if on else 'разблокировка', u['login'])
        elif action == 'logout':
            self.q('DELETE FROM sessions WHERE uid=?', (uid,))
            self.log(admin, 'выход везде', u['login'])
        elif action == 'clear_games':
            n = self.q('SELECT COUNT(*) AS n FROM games WHERE black=? OR white=?', (uid, uid), one=True)['n']
            self.q('DELETE FROM games WHERE black=? OR white=?', (uid, uid))
            self.log(admin, 'история игрока', '%s: удалено партий %d' % (u['login'], n))
        elif action == 'delete':
            if me or last:
                raise AuthError('Нельзя удалить себя или последнего администратора')
            self.q('DELETE FROM users WHERE id=?', (uid,))
            self.log(admin, 'удаление аккаунта', '%s (#%d)' % (u['login'], uid))
            return None
        else:
            raise AuthError('Неизвестное действие')
        return self.row(self.user(uid))

    def games_admin(self, query='', offset=0, limit=50):
        like = '%' + str(query or '').strip() + '%'
        rows = self.q('SELECT * FROM games WHERE black_name LIKE ? OR white_name LIKE ? OR room LIKE ? ORDER BY ended DESC LIMIT ? OFFSET ?',
                      (like, like, like, limit, max(0, int(offset or 0))))
        total = self.q('SELECT COUNT(*) AS n FROM games WHERE black_name LIKE ? OR white_name LIKE ? OR room LIKE ?', (like, like, like), one=True)['n']
        out = []
        for g in rows:
            c = self._card(g)
            c.update({'public': bool(g['public']), 'rated': bool(g['black_delta'] or g['white_delta']), 'room': g['room']})
            out.append(c)
        return {'games': out, 'total': total}

    def delete_games(self, admin, ids=None, everything=False):
        if everything:
            n = self.q('SELECT COUNT(*) AS n FROM games', one=True)['n']
            self.q('DELETE FROM games')
            self.log(admin, 'вся история', 'удалено партий %d' % n)
            return n
        ids = [int(i) for i in (ids or []) if str(i).isdigit()][:500]
        if not ids:
            return 0
        self.q('DELETE FROM games WHERE id IN (%s)' % ','.join('?' * len(ids)), ids)
        self.log(admin, 'удаление партий', '№ ' + ', '.join(map(str, ids[:30])) + ('…' if len(ids) > 30 else ''))
        return len(ids)

    def recompute(self, admin=None):
        """Rebuilds every rating from scratch by replaying the rated games that are still in the history."""
        with self.lock:
            self.db.execute('UPDATE users SET rating=1500, games=0, wins=0')
            n = 0
            for g in self.db.execute('SELECT id,black,white,winner FROM games ORDER BY ended, id').fetchall():
                b = self.db.execute('SELECT * FROM users WHERE id=?', (g['black'],)).fetchone() if g['black'] else None
                w = self.db.execute('SELECT * FROM users WHERE id=?', (g['white'],)).fetchone() if g['white'] else None
                db_ = dw = 0.0
                if b and w and b['id'] != w['id']:
                    db_, dw = elo(b['rating'], w['rating'], 1.0 if g['winner'] == 1 else 0.0, b['games'], w['games'])
                    for u, dl, won in ((b, db_, g['winner'] == 1), (w, dw, g['winner'] == 2)):
                        self.db.execute('UPDATE users SET rating=rating+?, games=games+1, wins=wins+? WHERE id=?', (dl, 1 if won else 0, u['id']))
                    n += 1
                self.db.execute('UPDATE games SET black_delta=?, white_delta=? WHERE id=?', (db_, dw, g['id']))
        self.log(admin, 'пересчёт рейтинга', 'по %d рейтинговым партиям' % n)
        return n

    def invites(self):
        return [{'code': r['code'], 'uses': r['uses'], 'created': r['created'] * 1000} for r in self.q('SELECT * FROM invites WHERE uses>0 ORDER BY created DESC')]

    def stats(self):
        one = lambda sql: self.q(sql, one=True)['n']
        size = sum(os.path.getsize(self.path + x) for x in ('', '-wal', '-shm') if os.path.exists(self.path + x))
        return {'users': one('SELECT COUNT(*) AS n FROM users'), 'admins': one("SELECT COUNT(*) AS n FROM users WHERE role='admin'"),
                'blocked': one('SELECT COUNT(*) AS n FROM users WHERE blocked=1'), 'active': one('SELECT COUNT(*) AS n FROM users WHERE seen>%d' % (time.time() - 7 * 86400)),
                'games': one('SELECT COUNT(*) AS n FROM games'), 'public': one('SELECT COUNT(*) AS n FROM games WHERE public=1'),
                'today': one('SELECT COUNT(*) AS n FROM games WHERE ended>%d' % (time.time() - 86400)), 'db': size, 'uptime': int(time.time() - self.started)}


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
    rn = sub.add_parser('rename', help='сменить логин')
    rn.add_argument('login')
    rn.add_argument('new_login')
    i = sub.add_parser('invite', help='код приглашения')
    i.add_argument('--uses', type=int, default=1)
    sub.add_parser('invites')
    sub.add_parser('guests', help='игра по сети без аккаунта').add_argument('state', nargs='?', choices=('on', 'off'))
    sub.add_parser('signup', help='кто может зарегистрироваться').add_argument('mode', nargs='?', choices=SIGNUP_MODES)
    for c in ('block', 'unblock'):
        sub.add_parser(c).add_argument('login')
    rt = sub.add_parser('rating', help='задать рейтинг вручную')
    rt.add_argument('login')
    rt.add_argument('value', type=float)
    sub.add_parser('recompute', help='пересчитать рейтинг по истории партий')
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
        elif args.cmd == 'rename':
            u = acc.rename(find(args.login), args.new_login)
            print('Логин %s изменён на %s. Рейтинг, партии и входы сохранены.' % (args.login, u['login']))
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
        elif args.cmd == 'signup':
            if args.mode:
                acc.set_setting('signup', args.mode)
                acc.log(None, 'регистрация', args.mode)
            print('Регистрация: %s.' % {'open': 'открыта для всех', 'invite': 'по кодам приглашения', 'closed': 'закрыта, аккаунты создаёт администратор'}[acc.signup])
        elif args.cmd in ('block', 'unblock'):
            u = find(args.login)
            acc.admin_user(None, u['id'], 'block', {'on': args.cmd == 'block'})
            print('%s %s.' % (u['login'], 'заблокирован, все его входы завершены' if args.cmd == 'block' else 'разблокирован'))
        elif args.cmd == 'rating':
            u = find(args.login)
            acc.admin_user(None, u['id'], 'rating', {'rating': args.value})
            print('Рейтинг %s теперь %d.' % (u['login'], round(args.value)))
        elif args.cmd == 'recompute':
            print('Рейтинг пересчитан по %d рейтинговым партиям.' % acc.recompute())
        elif args.cmd == 'guests':
            if args.state:
                acc.set_setting('guests', args.state)
            print('Гости %s.' % ('могут играть по сети без аккаунта' if acc.guests else 'не допускаются: по сети играют только с аккаунтом'))
    except AuthError as e:
        sys.exit(str(e))


if __name__ == '__main__':
    main()
