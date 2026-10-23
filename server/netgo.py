"""Online play for Jade Go: two-player rooms with authoritative rules and clocks.

The server keeps every room's move list and replays it with the same rules as the game
(captures, suicide, simple ko, area scoring), so a client can never put an illegal or
out-of-turn move on the board. Changes are pushed to both players as Server-Sent Events:
the whole room state as one JSON message, which clients diff against what they show.
"""
import json
import queue
import re
import secrets
import threading
import time

ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
SIZES = (9, 13, 19)
BYO, PERIODS = 30.0, 3
MAX_ROOMS = 500
WAIT_TTL = 6 * 3600          # an unanswered invitation
IDLE_TTL = 24 * 3600         # a game nobody has touched
OVER_TTL = 2 * 3600          # a finished game nobody is watching

LOCK = threading.RLock()
ROOMS = {}
_created = {}                # ip -> recent room creation times


class ApiError(Exception):
    def __init__(self, msg, code=400):
        super().__init__(msg)
        self.code = code


# ---------- rules (mirror of the game's engine) ----------
_NB = {}


def neighbours(n):
    if n not in _NB:
        nb = []
        for p in range(n * n):
            x, y = p % n, p // n
            nb.append([q for q, ok in ((p - 1, x > 0), (p + 1, x < n - 1), (p - n, y > 0), (p + n, y < n - 1)) if ok])
        _NB[n] = nb
    return _NB[n]


def _group(b, nb, p):
    c, st, seen, libs = b[p], [p], {p}, False
    while st:
        q = st.pop()
        for r in nb[q]:
            if b[r] == 0:
                libs = True
            elif b[r] == c and r not in seen:
                seen.add(r)
                st.append(r)
    return seen, libs


def play(b, n, p, c, ko):
    """Returns (board, ko point, captured count) or None when the move is illegal."""
    if not 0 <= p < n * n or b[p] != 0 or p == ko:
        return None
    nb = neighbours(n)
    b = b[:]
    b[p] = c
    cap, cap_pos = 0, -1
    for q in nb[p]:
        if b[q] == 3 - c:
            g, libs = _group(b, nb, q)
            if not libs:
                for s in g:
                    b[s] = 0
                cap += len(g)
                cap_pos = q
    if cap == 0 and not _group(b, nb, p)[1]:
        return None
    nk = -1
    if cap == 1 and all(b[q] != c for q in nb[p]) and sum(1 for q in nb[p] if b[q] == 0) == 1:
        nk = cap_pos
    return b, nk, cap


def score(b, n, dead, komi):
    nb = neighbours(n)
    bb = [0 if p in dead else v for p, v in enumerate(b)]
    stones = {1: bb.count(1), 2: bb.count(2)}
    terr, seen = {1: 0, 2: 0}, set()
    for p in range(n * n):
        if bb[p] or p in seen:
            continue
        st, pts, border = [p], [], 0
        seen.add(p)
        while st:
            q = st.pop()
            pts.append(q)
            for r in nb[q]:
                if bb[r] == 0:
                    if r not in seen:
                        seen.add(r)
                        st.append(r)
                else:
                    border |= bb[r]
        if border in (1, 2):
            terr[border] += len(pts)
    tb, tw = stones[1] + terr[1], stones[2] + terr[2] + komi
    return {'b': {'stones': stones[1], 'terr': terr[1], 'total': tb},
            'w': {'stones': stones[2], 'terr': terr[2], 'komi': komi, 'total': tw},
            'winner': 1 if tb > tw else 2, 'margin': abs(tb - tw)}


# ---------- rooms ----------
def clean_name(s):
    s = re.sub(r'[\x00-\x1f\x7f<>]', '', str(s or '')).strip()
    return s[:20] or 'Игрок'


class Room:
    def __init__(self, code, n, komi, clock_min):
        self.code, self.n, self.komi, self.clock_min = code, n, komi, clock_min
        self.seats = {1: None, 2: None}          # colour -> {'name','token'}
        self.subs = []                            # (queue, colour)
        self.chat = []
        self.seq = 0
        self.gid = 0
        self.touched = time.time()
        self.phase = 'waiting'
        self.new_game()

    def new_game(self):
        self.gid += 1
        self.board = [0] * (self.n * self.n)
        self.ko, self.to_play, self.passes = -1, 1, 0
        self.caps = {1: 0, 2: 0}
        self.moves, self.hist = [], []
        self.dead, self.dead_ver, self.agree = set(), 0, set()
        self.result, self.undo_req, self.rematch = None, None, set()
        self.clock = {c: {'main': self.clock_min * 60.0, 'byo': BYO, 'per': PERIODS} for c in (1, 2)} if self.clock_min else None
        self.turn_t = time.monotonic()

    # who is who
    def colour_of(self, token):
        for c, s in self.seats.items():
            if s and secrets.compare_digest(s['token'], token or ''):
                return c
        return 0

    def online(self, c):
        return any(col == c for _, col in self.subs)

    # clocks
    def _spend(self, k, dt):
        """Charges dt seconds to clock k; returns False when the last byo-yomi period runs out."""
        if k['main'] > 0:
            k['main'] -= dt
            if k['main'] >= 0:
                return True
            dt, k['main'] = -k['main'], 0.0
        while dt > 0:
            k['byo'] -= dt
            if k['byo'] > 0:
                return True
            dt = -k['byo']
            k['per'] -= 1
            if k['per'] <= 0:
                k['per'], k['byo'] = 0, 0.0
                return False
            k['byo'] = BYO
        return True

    def live_clock(self):
        if not self.clock:
            return None
        view = {c: dict(k) for c, k in self.clock.items()}
        if self.phase == 'play':
            self._spend(view[self.to_play], time.monotonic() - self.turn_t)
        return view

    def charge_turn(self):
        """Bills the player to move for the time since their turn began; ends the game on a flag fall."""
        if not self.clock or self.phase != 'play':
            return True
        now = time.monotonic()
        ok = self._spend(self.clock[self.to_play], now - self.turn_t)
        self.turn_t = now
        if not ok:
            self.finish({'by': 'time', 'winner': 3 - self.to_play})
        return ok

    # game flow
    def finish(self, result):
        self.phase, self.result, self.undo_req = 'over', result, None

    def snapshot(self):
        return (self.board[:], self.ko, self.to_play, dict(self.caps), self.passes)

    def act(self, c, d):
        t = d.get('type')
        if t == 'chat':
            text = re.sub(r'[\x00-\x1f\x7f]', ' ', str(d.get('text') or '')).strip()[:200]
            if text:
                self.chat.append({'c': c, 'name': self.seats[c]['name'], 'text': text, 't': int(time.time() * 1000)})
                self.chat = self.chat[-40:]
            return
        if t == 'rematch':
            if self.phase != 'over':
                raise ApiError('Партия ещё идёт')
            self.rematch.add(c)
            if self.rematch == {1, 2}:
                self.seats[1], self.seats[2] = self.seats[2], self.seats[1]
                self.subs = [(q, 3 - c) for q, c in self.subs]   # open streams follow their player to the new colour
                self.new_game()
                self.phase = 'play'
            return
        if self.phase == 'waiting':
            raise ApiError('Соперник ещё не пришёл')
        if t == 'resign':
            if self.phase in ('play', 'scoring'):
                self.charge_turn()
                if self.phase != 'over':
                    self.finish({'by': 'resign', 'winner': 3 - c})
            return
        if t in ('move', 'pass'):
            if self.phase != 'play':
                raise ApiError('Сейчас нельзя ходить')
            if c != self.to_play:
                raise ApiError('Сейчас ход соперника')
            if not self.charge_turn():
                return
            if t == 'move':
                p = d.get('p')
                r = play(self.board, self.n, p, c, self.ko) if isinstance(p, int) else None
                if r is None:
                    raise ApiError('Недопустимый ход')
                self.hist.append(self.snapshot())
                self.board, self.ko, cap = r
                self.caps[c] += cap
                self.passes = 0
                self.moves.append([c, p])
            else:
                self.hist.append(self.snapshot())
                self.ko = -1
                self.passes += 1
                self.moves.append([c, -1])
            if self.clock and self.clock[c]['main'] <= 0:
                self.clock[c]['byo'] = BYO
            self.to_play = 3 - c
            self.undo_req = None
            if self.passes >= 2:
                self.phase, self.dead, self.agree = 'scoring', set(), set()
                self.dead_ver += 1
            return
        if t == 'undo_req':
            if self.phase != 'play' or not any(m[0] == c for m in self.moves):
                raise ApiError('Нечего возвращать')
            self.undo_req = c
            return
        if t == 'undo_ans':
            if self.undo_req != 3 - c:
                return
            asker, self.undo_req = self.undo_req, None
            if d.get('ok'):
                self.charge_turn()
                if self.phase != 'play':
                    return
                n = 1 if self.moves[-1][0] == asker else 2
                for _ in range(min(n, len(self.moves))):
                    self.moves.pop()
                    self.board, self.ko, self.to_play, self.caps, self.passes = self.hist.pop()
                self.turn_t = time.monotonic()
            return
        if t == 'dead':
            if self.phase != 'scoring':
                raise ApiError('Подсчёт ещё не начался')
            pts = d.get('points') or []
            self.dead = {p for p in pts if isinstance(p, int) and 0 <= p < len(self.board) and self.board[p]}
            self.dead_ver += 1
            self.agree = set()
            return
        if t == 'agree':
            if self.phase != 'scoring' or d.get('ver') != self.dead_ver:
                raise ApiError('Отметки изменились — проверьте ещё раз')
            self.agree.add(c)
            if self.agree == {1, 2}:
                s = score(self.board, self.n, self.dead, self.komi)
                self.finish({'by': 'score', 'winner': s['winner'], 'margin': s['margin']})
            return
        if t == 'resume':
            if self.phase == 'scoring':
                self.phase, self.passes, self.dead, self.agree = 'play', 0, set(), set()
                self.turn_t = time.monotonic()
            return
        raise ApiError('Неизвестное действие')

    def state(self, you):
        return {'code': self.code, 'seq': self.seq, 'gid': self.gid, 'you': you, 'n': self.n, 'komi': self.komi,
                'clockMin': self.clock_min, 'phase': self.phase,
                'names': {c: (s['name'] if s else None) for c, s in self.seats.items()},
                'online': {c: self.online(c) for c in (1, 2)},
                'moves': self.moves, 'toPlay': self.to_play, 'passes': self.passes,
                'dead': sorted(self.dead), 'deadVer': self.dead_ver, 'agree': sorted(self.agree),
                'result': self.result, 'undoReq': self.undo_req, 'rematch': sorted(self.rematch),
                'chat': self.chat, 'clock': self.live_clock()}

    def broadcast(self):
        self.seq += 1
        self.touched = time.time()
        cache = {}
        for q, c in list(self.subs):
            if c not in cache:
                cache[c] = json.dumps(self.state(c), ensure_ascii=False, separators=(',', ':'))
            try:
                q.put_nowait(cache[c])
            except queue.Full:
                pass


# ---------- API (called by the HTTP handler) ----------
def _room(code):
    r = ROOMS.get(str(code or '').upper())
    if not r:
        raise ApiError('Комната не найдена — проверьте код', 404)
    return r


def create(d, ip):
    with LOCK:
        now = time.time()
        recent = [t for t in _created.get(ip, []) if now - t < 3600]
        if len(recent) >= 30:
            raise ApiError('Слишком много комнат за час — попробуйте позже', 429)
        if len(ROOMS) >= MAX_ROOMS:
            raise ApiError('Сервер переполнен — попробуйте позже', 503)
        _created[ip] = recent + [now]
        n = d.get('n') if d.get('n') in SIZES else 9
        komi = d.get('komi') if d.get('komi') in (0.5, 6.5, 7.5) else 6.5
        clock = d.get('clock') if d.get('clock') in (5, 10, 20) else None
        code = ''.join(secrets.choice(ALPHA) for _ in range(6))
        while code in ROOMS:
            code = ''.join(secrets.choice(ALPHA) for _ in range(6))
        room = Room(code, n, komi, clock)
        colour = d.get('color')
        colour = 1 if colour == 'black' else 2 if colour == 'white' else secrets.choice((1, 2))
        token = secrets.token_urlsafe(18)
        room.seats[colour] = {'name': clean_name(d.get('name')), 'token': token}
        ROOMS[code] = room
        return {'code': code, 'token': token, 'color': colour}


def info(code):
    with LOCK:
        r = _room(code)
        return {'code': r.code, 'n': r.n, 'komi': r.komi, 'clockMin': r.clock_min, 'phase': r.phase,
                'names': {c: (s['name'] if s else None) for c, s in r.seats.items()},
                'free': [c for c in (1, 2) if not r.seats[c]]}


def join(code, d):
    with LOCK:
        r = _room(code)
        free = [c for c in (1, 2) if not r.seats[c]]
        if not free:
            raise ApiError('В комнате уже два игрока', 409)
        token = secrets.token_urlsafe(18)
        r.seats[free[0]] = {'name': clean_name(d.get('name')), 'token': token}
        r.phase = 'play'
        r.turn_t = time.monotonic()
        r.broadcast()
        return {'code': r.code, 'token': token, 'color': free[0]}


def act(code, d):
    with LOCK:
        r = _room(code)
        c = r.colour_of(d.get('token'))
        if not c:
            raise ApiError('Вы не участник этой комнаты', 403)
        if d.get('type') == 'leave':
            if r.phase == 'waiting':
                del ROOMS[r.code]
                r.phase = 'closed'
                r.broadcast()
            return {'ok': True}
        try:
            r.act(c, d)
        finally:
            r.broadcast()
        return {'ok': True}


def subscribe(code, token):
    """Registers an event stream; returns (room, queue, colour)."""
    with LOCK:
        r = _room(code)
        c = r.colour_of(token)
        if not c:
            raise ApiError('Вы не участник этой комнаты', 403)
        q = queue.Queue(maxsize=64)
        r.subs.append((q, c))
        r.broadcast()           # sends the full state to the newcomer and the presence change to the other player
        return r, q, c


def unsubscribe(room, q):
    with LOCK:
        room.subs = [s for s in room.subs if s[0] is not q]
        if room.code in ROOMS:
            room.broadcast()


def _ticker():
    """Flags fall even when nobody moves; idle rooms are cleared away."""
    while True:
        time.sleep(0.5)
        with LOCK:
            now = time.time()
            for code, r in list(ROOMS.items()):
                if r.phase == 'play' and r.clock:
                    k = r.live_clock()[r.to_play]
                    if k['per'] <= 0 and k['main'] <= 0 and k['byo'] <= 0:
                        r.charge_turn()
                        r.broadcast()
                ttl = WAIT_TTL if r.phase == 'waiting' else OVER_TTL if r.phase == 'over' else IDLE_TTL
                if not r.subs and now - r.touched > ttl:
                    del ROOMS[code]


threading.Thread(target=_ticker, daemon=True, name='jadego-ticker').start()
