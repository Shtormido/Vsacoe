"""2D curve helpers: interpolation, rounded polylines, polygon utilities."""
import math
import numpy as np


def pchip(xk, yk, x):
    """Monotone cubic (Fritsch-Carlson) interpolation; clamps outside the key range."""
    xk = np.asarray(xk, float)
    yk = np.asarray(yk, float)
    x = np.clip(np.asarray(x, float), xk[0], xk[-1])
    n = len(xk)
    if n == 1:
        return np.full_like(x, yk[0])
    h = np.diff(xk)
    d = np.diff(yk) / h
    m = np.zeros(n)
    if n == 2:
        m[:] = d[0]
    else:
        for i in range(1, n - 1):
            if d[i - 1] * d[i] <= 0:
                m[i] = 0.0
            else:
                w1 = 2 * h[i] + h[i - 1]
                w2 = h[i] + 2 * h[i - 1]
                m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])
        m[0] = _end_slope(h[0], h[1], d[0], d[1])
        m[-1] = _end_slope(h[-1], h[-2], d[-1], d[-2])
    idx = np.clip(np.searchsorted(xk, x, side="right") - 1, 0, n - 2)
    t = (x - xk[idx]) / h[idx]
    h00 = (1 + 2 * t) * (1 - t) ** 2
    h10 = t * (1 - t) ** 2
    h01 = t * t * (3 - 2 * t)
    h11 = t * t * (t - 1)
    return h00 * yk[idx] + h10 * h[idx] * m[idx] + h01 * yk[idx + 1] + h11 * h[idx] * m[idx + 1]


def _end_slope(h0, h1, d0, d1):
    m = ((2 * h0 + h1) * d0 - h0 * d1) / (h0 + h1)
    if np.sign(m) != np.sign(d0):
        return 0.0
    if np.sign(d0) != np.sign(d1) and abs(m) > abs(3 * d0):
        return 3 * d0
    return m


class Keys:
    """Named parameter tracks keyed along one axis, interpolated with PCHIP.

    rows: list of dicts, each with the key coordinate under `axis` and any subset
    of parameters. A parameter missing from a row is simply not keyed there.
    """

    def __init__(self, rows, axis="x"):
        self.tracks = {}
        for r in rows:
            for k, v in r.items():
                if k == axis:
                    continue
                self.tracks.setdefault(k, []).append((r[axis], v))
        for k in self.tracks:
            self.tracks[k].sort()
        self.lo = min(r[axis] for r in rows)
        self.hi = max(r[axis] for r in rows)

    def __call__(self, name, x, default=None):
        if name not in self.tracks:
            if default is None:
                raise KeyError(name)
            return np.full_like(np.asarray(x, float), default)
        xs, ys = zip(*self.tracks[name])
        return pchip(xs, ys, x)

    def has(self, name):
        return name in self.tracks


def round_polyline(pts, radii, n_edge, n_corner, closed=False, crown_last=False):
    """Polyline with corners replaced by quadratic Bezier arcs.

    Fixed vertex counts (independent of geometry) so consecutive sections loft into
    a clean quad grid. pts: (k,2). radii: per interior corner (len k-2, or k if closed).
    n_edge: samples per straight segment, n_corner: samples per corner.
    crown_last: last segment is drawn as a curve with a horizontal tangent at its
    end point (used for the top centre of sections, avoids a ridge on the mirror).
    """
    P = [np.asarray(p, float) for p in pts]
    k = len(P)
    corners = list(range(k)) if closed else list(range(1, k - 1))
    if isinstance(n_edge, int):
        n_edge = [n_edge] * (k if closed else k - 1)
    if isinstance(n_corner, int):
        n_corner = [n_corner] * len(corners)
    tin, tout = {}, {}
    for ci, i in enumerate(corners):
        a, b, c = P[(i - 1) % k], P[i], P[(i + 1) % k]
        la, lc = np.linalg.norm(a - b), np.linalg.norm(c - b)
        r = min(radii[ci], 0.49 * la, 0.49 * lc)
        tin[i] = b + (a - b) / la * r if la > 1e-9 else b.copy()
        tout[i] = b + (c - b) / lc * r if lc > 1e-9 else b.copy()
    out = []
    nseg = k if closed else k - 1
    for s in range(nseg):
        i, j = s, (s + 1) % k
        p0 = tout.get(i, P[i])
        p1 = tin.get(j, P[j])
        if i in tin:
            ci = corners.index(i)
            q0, q1, q2 = tin[i], P[i], tout[i]
            for t in np.linspace(0, 1, n_corner[ci], endpoint=False):
                out.append((1 - t) ** 2 * q0 + 2 * (1 - t) * t * q1 + t * t * q2)
        last = (not closed) and s == nseg - 1
        n = n_edge[s]
        if last and crown_last:
            ctrl = np.array([p0[0] * 0.45, p1[1]])
            for t in np.linspace(0, 1, n + 1):
                out.append((1 - t) ** 2 * p0 + 2 * (1 - t) * t * ctrl + t * t * p1)
        elif last:
            for t in np.linspace(0, 1, n + 1):
                out.append(p0 + (p1 - p0) * t)
        else:
            for t in np.linspace(0, 1, n, endpoint=False):
                out.append(p0 + (p1 - p0) * t)
    return np.array(out)


def chaikin(pts, iters=2, closed=True):
    P = np.asarray(pts, float)
    for _ in range(iters):
        Q = np.roll(P, -1, axis=0) if closed else P[1:]
        A = P if closed else P[:-1]
        new = np.empty((len(A) * 2, P.shape[1]))
        new[0::2] = 0.75 * A + 0.25 * Q
        new[1::2] = 0.25 * A + 0.75 * Q
        if not closed:
            new = np.vstack([P[:1], new, P[-1:]])
        P = new
    return P


def round_corners(poly, r, n=6):
    """Round every corner of a closed polygon with radius-ish r."""
    return round_polyline(poly, [r] * len(poly), 1, n, closed=True)


def resample(poly, step, closed=True):
    P = np.asarray(poly, float)
    if closed:
        P = np.vstack([P, P[:1]])
    out = []
    for a, b in zip(P[:-1], P[1:]):
        n = max(1, int(math.ceil(np.linalg.norm(b - a) / step)))
        for t in np.arange(n) / n:
            out.append(a + (b - a) * t)
    if not closed:
        out.append(P[-1])
    return np.array(out)


def signed_area(poly):
    P = np.asarray(poly, float)
    x, y = P[:, 0], P[:, 1]
    return 0.5 * np.sum(x * np.roll(y, -1) - np.roll(x, -1) * y)


def offset_polygon(poly, d):
    """Offset a closed polygon outward by d (miter, clamped). Works for mildly concave shapes."""
    P = np.asarray(poly, float)
    if signed_area(P) < 0:
        P = P[::-1]
    prev = np.roll(P, 1, axis=0)
    nxt = np.roll(P, -1, axis=0)
    e1 = P - prev
    e2 = nxt - P
    e1 /= np.linalg.norm(e1, axis=1, keepdims=True) + 1e-12
    e2 /= np.linalg.norm(e2, axis=1, keepdims=True) + 1e-12
    n1 = np.stack([e1[:, 1], -e1[:, 0]], 1)
    n2 = np.stack([e2[:, 1], -e2[:, 0]], 1)
    bis = n1 + n2
    bis /= np.linalg.norm(bis, axis=1, keepdims=True) + 1e-12
    cosv = np.clip(np.sum(bis * n1, axis=1), 0.35, 1.0)
    return P + bis * (d / cosv)[:, None]


def points_in_polygon(pts, poly):
    pts = np.asarray(pts, float)
    P = np.asarray(poly, float)
    x, y = pts[:, 0][:, None], pts[:, 1][:, None]
    x1, y1 = P[:, 0][None], P[:, 1][None]
    x2, y2 = np.roll(P[:, 0], -1)[None], np.roll(P[:, 1], -1)[None]
    cond = (y1 > y) != (y2 > y)
    with np.errstate(divide="ignore", invalid="ignore"):
        xint = x1 + (y - y1) * (x2 - x1) / (y2 - y1)
    return np.sum(cond & (x < xint), axis=1) % 2 == 1


def clip_halfplane(poly, a, b):
    """Keep the part of polygon on the left of the directed line a->b."""
    a, b = np.asarray(a, float), np.asarray(b, float)
    d = b - a

    def side(p):
        return d[0] * (p[1] - a[1]) - d[1] * (p[0] - a[0])

    out = []
    P = list(np.asarray(poly, float))
    for i in range(len(P)):
        cur, nxt = P[i], P[(i + 1) % len(P)]
        sc, sn = side(cur), side(nxt)
        if sc >= 0:
            out.append(cur)
        if (sc >= 0) != (sn >= 0):
            t = sc / (sc - sn)
            out.append(cur + (nxt - cur) * t)
    return np.array(out)


def ellipse(cx, cy, rx, ry, n=48, a0=0.0, a1=2 * math.pi, endpoint=False):
    t = np.linspace(a0, a1, n, endpoint=endpoint)
    return np.stack([cx + rx * np.cos(t), cy + ry * np.sin(t)], 1)


def superellipse(cx, cy, rx, ry, p=4.0, n=64):
    t = np.linspace(0, 2 * math.pi, n, endpoint=False)
    c, s = np.cos(t), np.sin(t)
    return np.stack([cx + rx * np.sign(c) * np.abs(c) ** (2 / p),
                     cy + ry * np.sign(s) * np.abs(s) ** (2 / p)], 1)


def rrect(cx, cy, w, h, r, n=6):
    """Rounded rectangle centred at (cx,cy) with full size w x h."""
    x0, x1, y0, y1 = cx - w / 2, cx + w / 2, cy - h / 2, cy + h / 2
    return round_corners([(x0, y0), (x1, y0), (x1, y1), (x0, y1)], r, n)


def polyline_strip(line, width):
    """Closed polygon outlining a thick 2D polyline (for seams, trim lines)."""
    L = np.asarray(line, float)
    t = np.gradient(L, axis=0)
    t /= np.linalg.norm(t, axis=1, keepdims=True) + 1e-12
    n = np.stack([-t[:, 1], t[:, 0]], 1) * width / 2
    return np.vstack([L + n, (L - n)[::-1]])
