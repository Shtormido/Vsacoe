"""Procedural car body: lofted lower body, greenhouse, surface projection (decals)."""
import math
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import delaunay_2d_cdt

from . import curves as C
from . import util as U


# ---------------------------------------------------------------- lower body
class Body:
    """Lower body (everything below the window line) lofted along X.

    Each station section is a half-outline in (y, z):
        A (0, zb) bottom centre
        B (wb, zb) bottom edge          corner radius rb
        C (wl, zm) widest lower point   corner radius rm
        D (ws, zs) shoulder / beltline  corner radius rs
        E (we, ze) outer edge of top    corner radius re
        F (0, zt) top centre (curved, horizontal tangent)
    All values are keyed along x and PCHIP-interpolated. Optional tracks:
    lean (x shift per metre of height), bow (plan-view curvature of the ends),
    rb/rm/rs/re per-station corner radii.
    Front and rear get plan-view rounded corners (radius rc) and a triangulated end face.
    """

    N_EDGE = [5, 8, 10, 3, 12]
    N_CORNER = [5, 8, 6, 6]

    def __init__(self, rows, radii, step=0.02, nose=None, tail=None, lean_z=0.55):
        self.k = C.Keys(rows)
        self.radii = radii
        self.step = step
        self.nose = dict(rc=0.06, n_round=7) | (nose or {})
        self.tail = dict(rc=0.06, n_round=7) | (tail or {})
        self.lean_z = lean_z
        self.wref = float(max(np.max(self.k(t, np.linspace(self.k.lo, self.k.hi, 50)))
                              for t in ("wb", "wl", "ws", "we")))

    def p(self, name, x):
        default = self.radii.get(name, 0.0 if name in ("lean", "bow") else None)
        return float(self.k(name, x, default))

    def half_section(self, x, yscale=1.0):
        g = lambda n: self.p(n, x)
        pts = [(0, g("zb")), (g("wb") * yscale, g("zb")), (g("wl") * yscale, g("zm")),
               (g("ws") * yscale, g("zs")), (g("we") * yscale, g("ze")), (0, g("zt"))]
        radii = [g("rb"), g("rm"), g("rs"), g("re")]
        return C.round_polyline(pts, radii, self.N_EDGE, self.N_CORNER, crown_last=True)

    def ring(self, x, yscale=1.0, xoff=0.0, xkey=None):
        xk = x if xkey is None else xkey
        h = self.half_section(xk, yscale)
        full = np.vstack([h, (h[1:-1] * [-1, 1])[::-1]])
        y, z = full[:, 0], full[:, 1]
        lean, bow = self.p("lean", xk), self.p("bow", xk)
        xs = x + xoff + lean * (z - self.lean_z) - bow * (y / self.wref) ** 2
        return np.stack([xs, y, z], 1)

    def build(self, name, mat):
        lo, hi = self.k.lo, self.k.hi
        n = max(3, int(round((hi - lo) / self.step)))
        xs = np.linspace(lo, hi, n + 1)
        rings = []
        rings += self._cap(lo, self.tail, -1)[::-1]
        rings += [self.ring(x) for x in xs]
        rings += self._cap(hi, self.nose, +1)
        nr, nc = len(rings), len(rings[0])
        V = list(np.vstack(rings))
        F = U.grid_faces(nr, nc, closed_cols=True)
        for ring_i, xend, cfg, sgn in ((0, lo, self.tail, -1), (nr - 1, hi, self.nose, 1)):
            V, F = self._end_face(V, F, ring_i * nc, rings[ring_i], xend, cfg, sgn)
        obj = U.mesh_object(name, V, F, mat, smooth=True)
        U.cleanup_mesh(obj, merge=2e-6)
        U.ensure_outward(obj)
        obj.data.shade_smooth()
        obj.data.set_sharp_from_angle(angle=math.radians(50))
        self.obj = obj
        return obj

    def _cap(self, xend, cfg, sgn):
        """Rounded plan-view corners: sections shrink in y while moving out by rc."""
        w_end = max(self.p(t, xend) for t in ("wb", "wl", "ws", "we"))
        rc = cfg["rc"]
        out = []
        for th in np.linspace(0, math.pi / 2, cfg["n_round"] + 1)[1:]:
            s = 1 - (rc / w_end) * (1 - math.cos(th))
            out.append(self.ring(xend, s, sgn * rc * math.sin(th), xkey=xend))
        return out

    def _end_face(self, V, F, base, ring, xend, cfg, sgn, step=0.035):
        """Close an end with a triangulated face that follows the lean/bow surface."""
        from mathutils import Vector as Vec
        n = len(ring)
        yz = ring[:, 1:3]
        lo_, hi_ = yz.min(0), yz.max(0)
        pts = []
        for j, z in enumerate(np.arange(lo_[1] + step * 0.5, hi_[1], step * 0.866)):
            off = step * 0.5 if j % 2 else 0.0
            for y in np.arange(lo_[0] + step * 0.25, hi_[0], step):
                pts.append((y + off, z))
        pts = np.array(pts).reshape(-1, 2)
        if len(pts):
            pts = pts[C.points_in_polygon(pts, yz)]
        if len(pts):
            d = np.min(np.linalg.norm(pts[:, None, :] - yz[None, :, :], axis=2), axis=1)
            pts = pts[d > step * 0.6]
        coords = [Vec((float(a), float(b))) for a, b in yz] + [Vec((float(a), float(b))) for a, b in pts]
        edges = [(i, (i + 1) % n) for i in range(n)]
        vs, es, fs, ov, oe, of = delaunay_2d_cdt(coords, edges, [], 0, 1e-9)
        lean, bow = self.p("lean", xend), self.p("bow", xend)
        xface = xend + sgn * cfg["rc"]
        idx = []
        for k, v in enumerate(vs):
            src = [o for o in ov[k] if o < n]
            if src:
                idx.append(base + src[0])
            else:
                y, z = v.x, v.y
                V.append(np.array([xface + lean * (z - self.lean_z) - bow * (y / self.wref) ** 2, y, z]))
                idx.append(len(V) - 1)
        vs2 = np.array([(v.x, v.y) for v in vs])
        for f in fs:
            if len(f) != 3:
                continue
            c = vs2[list(f)].mean(0)
            if C.points_in_polygon(c[None], yz)[0]:
                F.append(tuple(idx[i] for i in f))
        return V, F


# ---------------------------------------------------------------- greenhouse
class Greenhouse:
    """Cabin above the beltline, lofted along X, open at the bottom.

    Section half-outline: (wb, zb) base -> (wt, zt) roof edge (radius rr) -> (0, zr) roof centre.
    The first/last rows should have zt == zr == zb so the windshield / backlight
    grow out of the body.
    """

    N_EDGE = [24, 40]
    N_CORNER = [12]

    def __init__(self, rows, step=0.015, thickness=0.012):
        self.k = C.Keys(rows)
        self.step = step
        self.thickness = thickness

    def p(self, name, x):
        return float(self.k(name, x))

    def half_section(self, x):
        g = lambda n: self.p(n, x)
        pts = [(g("wb"), g("zb")), (g("wt"), g("zt")), (0, g("zr"))]
        return C.round_polyline(pts, [g("rr")], self.N_EDGE, self.N_CORNER, crown_last=True)

    def ring(self, x):
        h = self.half_section(x)
        full = np.vstack([h, (h[:-1] * [-1, 1])[::-1]])
        return np.stack([np.full(len(full), x), full[:, 0], full[:, 1]], 1)

    def build(self, name, mat):
        lo, hi = self.k.lo, self.k.hi
        n = max(3, int(round((hi - lo) / self.step)))
        rings = [self.ring(x) for x in np.linspace(lo, hi, n + 1)]
        V = np.vstack(rings)
        F = U.grid_faces(len(rings), len(rings[0]))
        obj = U.mesh_object(name, V, F, mat, smooth=True)
        U.cleanup_mesh(obj, merge=2e-5, recalc=False)
        _orient_up(obj)
        obj.data.shade_smooth()
        obj.data.set_sharp_from_angle(angle=math.radians(50))
        if self.thickness:
            from . import materials as M
            obj.data.materials.append(M.leather("headliner", (0.05, 0.05, 0.055)))
            sm = U.solidify(obj, self.thickness, -1.0)
            sm.material_offset = 1
            sm.material_offset_rim = 1
        self.obj = obj
        return obj

    # handy accessors for window layout
    def roof_edge(self, x):
        return self.p("zt", x)

    def top_width(self, x):
        return self.p("wt", x)


def _orient_up(obj):
    """Make sure an open shell's normals point outward (roof normal +Z)."""
    me = obj.data
    top = max(me.polygons, key=lambda p: p.center.z)
    if top.normal.z < 0:
        U.flip_normals(obj)


# ---------------------------------------------------------------- arches / cabin
def cylinder_y(name, x, z, r, y0, y1, seg=72, mat=None):
    t = np.linspace(0, 2 * math.pi, seg, endpoint=False)
    ring = np.stack([x + r * np.cos(t), np.zeros(seg), z + r * np.sin(t)], 1)
    a = ring.copy(); a[:, 1] = y0
    b = ring.copy(); b[:, 1] = y1
    V = np.vstack([a, b, [[x, y0, z], [x, y1, z]]])
    F = []
    for i in range(seg):
        j = (i + 1) % seg
        F.append((i, j, seg + j, seg + i))
        F.append((2 * seg, j, i))
        F.append((2 * seg + 1, seg + i, seg + j))
    obj = U.mesh_object(name, V, F, mat, smooth=False)
    U.cleanup_mesh(obj)
    return obj


def arch_cutters(wheels, y_in, y_out, liner_mat, seg=96):
    """wheels: list of (x, z, radius). Cylinders for both sides."""
    parts = []
    for i, (x, z, r) in enumerate(wheels):
        for s in (1, -1):
            parts.append(cylinder_y(f"arch{i}{s}", x, z, r, s * y_in, s * y_out, seg, liner_mat))
    return parts


def cut_body(body, cutters):
    """Subtract all cutters in a single exact boolean (keeps the input manifold)."""
    n0 = len(body.data.vertices)
    cutter = U.join(cutters, "body_cutter")
    U.ensure_outward(cutter)
    U.boolean(body, cutter, apply=False, hide_cutter=False)
    U.apply_modifiers(body)
    if len(body.data.vertices) < n0 * 0.5:
        raise RuntimeError("boolean collapsed the body mesh")
    bpy.data.objects.remove(cutter, do_unlink=True)
    return body


def cut_wheel_arches(body, wheels, y_in, y_out, liner_mat, seg=96):
    return cut_body(body, arch_cutters(wheels, y_in, y_out, liner_mat, seg))


def box_mesh(name, x0, x1, y0, y1, z0, z1, mat=None):
    V = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
         (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
    F = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    return U.mesh_object(name, V, F, mat, smooth=False)


def cabin_cutter(x0, x1, half_w, z_floor, z_top, mat, round_r=0.08):
    """Box that hollows out the passenger tub so the interior shows through the glass."""
    prof = C.rrect((x0 + x1) / 2, 0, x1 - x0, 2 * half_w, round_r, 6)
    n = len(prof)
    V = [(p[0], p[1], z_floor) for p in prof] + [(p[0], p[1], z_top) for p in prof]
    F = [tuple(range(n))[::-1], tuple(range(n, 2 * n))]
    for i in range(n):
        j = (i + 1) % n
        F.append((i, j, n + j, n + i))
    cutter = U.mesh_object("cabin_cutter", V, F, mat, smooth=False)
    U.cleanup_mesh(cutter)
    return cutter


def cut_cabin(body, x0, x1, half_w, z_floor, z_top, mat, round_r=0.08):
    return cut_body(body, [cabin_cutter(x0, x1, half_w, z_floor, z_top, mat, round_r)])


# ---------------------------------------------------------------- surface projection
VIEWS = {
    # name: (direction of projection, u axis, v axis, ray start offset)
    "side": ((0, -1, 0), (1, 0, 0), (0, 0, 1)),
    "side_l": ((0, 1, 0), (1, 0, 0), (0, 0, 1)),
    "front": ((-1, 0, 0), (0, 1, 0), (0, 0, 1)),
    "rear": ((1, 0, 0), (0, 1, 0), (0, 0, 1)),
    "top": ((0, 0, -1), (1, 0, 0), (0, 1, 0)),
    "bottom": ((0, 0, 1), (1, 0, 0), (0, 1, 0)),
}


def view_frame(view):
    if isinstance(view, str):
        d, u, v = VIEWS[view]
        return Vector(d), Vector(u), Vector(v)
    d = Vector(view).normalized()
    up = Vector((0, 0, 1)) if abs(d.z) < 0.9 else Vector((1, 0, 0))
    u = up.cross(d).normalized()
    v = d.cross(u).normalized()
    if abs(d.z) < 0.9:
        u, v = -u, v
    return d, u, v


class Surface:
    """Ray-cast target made of one or more mesh objects; hits return smooth (interpolated) normals."""

    def __init__(self, *objs):
        dg = bpy.context.evaluated_depsgraph_get()
        self.trees = []
        for o in objs:
            ev = o.evaluated_get(dg)
            me = ev.to_mesh()
            me.calc_loop_triangles()
            mw = o.matrix_world
            nm = mw.to_3x3().inverted().transposed()
            verts = [mw @ v.co for v in me.vertices]
            vnor = [(nm @ v.normal).normalized() for v in me.vertices]
            tris = [tuple(t.vertices) for t in me.loop_triangles]
            self.trees.append((BVHTree.FromPolygons(verts, tris), verts, vnor, tris))
            ev.to_mesh_clear()

    def ray(self, origin, direction, dist=50.0):
        best = None
        for tree, verts, vnor, tris in self.trees:
            loc, nor, idx, d = tree.ray_cast(Vector(origin), Vector(direction), dist)
            if loc is not None and (best is None or d < best[2]):
                a, b, c = tris[idx]
                best = (loc, _interp_normal(loc, verts[a], verts[b], verts[c], vnor[a], vnor[b], vnor[c], nor), d)
        return best

    def hit(self, view, a, b, far=8.0):
        d, u, v = view_frame(view)
        o = u * a + v * b - d * far
        h = self.ray(o, d, 2 * far)
        if h is None:
            return None, None
        return h[0], h[1]


def _interp_normal(p, a, b, c, na, nb, nc, flat):
    v0, v1, v2 = b - a, c - a, p - a
    d00, d01, d11 = v0.dot(v0), v0.dot(v1), v1.dot(v1)
    d20, d21 = v2.dot(v0), v2.dot(v1)
    den = d00 * d11 - d01 * d01
    if abs(den) < 1e-14:
        return flat
    v = (d11 * d20 - d01 * d21) / den
    w = (d00 * d21 - d01 * d20) / den
    u = 1 - v - w
    n = na * u + nb * v + nc * w
    if n.length < 1e-8:
        return flat
    n.normalize()
    if n.dot(flat) < 0.2:      # sharp edge / flipped vertex normal: trust the face
        return flat
    return n


def fill_polygon_2d(loops, step):
    """Triangulate polygon loops (outer + holes, even-odd) with interior points ~step apart."""
    loops = [C.resample(l, step) for l in loops]
    allb = np.vstack(loops)
    lo, hi = allb.min(0), allb.max(0)
    gx = np.arange(lo[0] + step * 0.5, hi[0], step)
    gy = np.arange(lo[1] + step * 0.5, hi[1], step * 0.866)
    pts = []
    for j, y in enumerate(gy):
        off = step * 0.5 if j % 2 else 0.0
        for x in gx:
            pts.append((x + off, y))
    pts = np.array(pts).reshape(-1, 2)
    if len(pts):
        inside = np.zeros(len(pts), int)
        for l in loops:
            inside += C.points_in_polygon(pts, l)
        pts = pts[inside % 2 == 1]
        if len(pts):
            dmin = np.min(np.linalg.norm(pts[:, None, :] - allb[None, :, :], axis=2), axis=1) \
                if len(pts) * len(allb) < 4e6 else _min_dist_chunked(pts, allb)
            pts = pts[dmin > step * 0.45]
    coords = [Vector((float(p[0]), float(p[1]))) for p in allb] + \
             [Vector((float(p[0]), float(p[1]))) for p in pts]
    edges = []
    base = 0
    for l in loops:
        n = len(l)
        edges += [(base + i, base + (i + 1) % n) for i in range(n)]
        base += n
    vs, es, fs, _, _, _ = delaunay_2d_cdt(coords, edges, [], 0, 1e-7)
    vs = np.array([(v.x, v.y) for v in vs])
    tris = [f for f in fs if len(f) == 3]
    if not tris:
        return vs, []
    cent = np.array([vs[list(f)].mean(0) for f in tris])
    inside = np.zeros(len(cent), int)
    for l in loops:
        inside += C.points_in_polygon(cent, l)
    tris = [f for f, k in zip(tris, inside) if k % 2 == 1]
    return vs, tris


def _min_dist_chunked(pts, b, chunk=2000):
    out = np.empty(len(pts))
    for i in range(0, len(pts), chunk):
        p = pts[i:i + chunk]
        out[i:i + chunk] = np.min(np.linalg.norm(p[:, None, :] - b[None, :, :], axis=2), axis=1)
    return out


def decal(surface, view, loops, name, mat, offset=0.0015, step=0.012, thickness=0.0,
          smooth=True, mirror=False, far=8.0, depth_tol=0.25):
    """Project a flat 2D shape (in the view's u/v plane) onto the surface.

    loops: one outline, or [outline, hole, hole...]. Returns the new object or None.
    """
    if isinstance(loops, np.ndarray) and loops.ndim == 2:
        loops = [loops]
    elif loops and np.asarray(loops[0]).ndim == 1:
        loops = [np.asarray(loops)]
    d, u, v = view_frame(view)
    vs, tris = fill_polygon_2d([np.asarray(l, float) for l in loops], step)
    if not tris:
        return None
    pos = [None] * len(vs)
    dist = np.full(len(vs), np.inf)
    hits = [None] * len(vs)
    for i, (a, b) in enumerate(vs):
        o = u * a + v * b - d * far
        h = surface.ray(o, d, 2 * far)
        if h is not None:
            hits[i] = h
            dist[i] = h[2]
    nors = [None] * len(vs)
    if np.isfinite(dist).any():
        # rays that slipped past the intended panel and hit something far behind are dropped
        dmin = np.min(dist)
        for i, h in enumerate(hits):
            if h is not None and dist[i] <= dmin + depth_tol:
                nor = h[1]
                if nor.dot(d) > 0:
                    nor = -nor
                pos[i] = h[0] + nor * offset
                nors[i] = nor
    used = [f for f in tris if all(pos[i] is not None for i in f)]
    if not used:
        return None
    idx = sorted({i for f in used for i in f})
    remap = {o: n for n, o in enumerate(idx)}
    V = [pos[i] for i in idx]
    F = [tuple(remap[i] for i in f) for f in used]
    # orient faces toward the viewer (against the projection direction)
    a0, b0, c0 = (Vector(V[k]) for k in F[0])
    if (b0 - a0).cross(c0 - a0).dot(d) > 0:
        F = [f[::-1] for f in F]
    if thickness:
        # back layer pushed along the smooth surface normals + rim along the open boundary
        n = len(V)
        V = V + [pos[i] - nors[i] * thickness for i in idx]
        back = [tuple(k + n for k in f[::-1]) for f in F]
        count = {}
        for f in F:
            for k in range(3):
                e = (f[k], f[(k + 1) % 3])
                count[(min(e), max(e))] = count.get((min(e), max(e)), 0) + 1
        rim = []
        for f in F:
            for k in range(3):
                a_, b_ = f[k], f[(k + 1) % 3]
                if count[(min(a_, b_), max(a_, b_))] == 1:
                    rim.append((b_, a_, a_ + n, b_ + n))
        F = F + back + rim
    obj = U.mesh_object(name, V, F, mat, smooth=smooth)
    me = obj.data
    if thickness:
        U.cleanup_mesh(obj, merge=0.0, recalc=True)
    if smooth:
        me.shade_smooth()
        # reuse the target surface's smooth normals so reflections don't show the triangulation
        vn = [tuple(nors[i]) for i in idx]
        if thickness:
            vn = vn + [tuple(-nors[i]) for i in idx]
        if len(vn) == len(me.vertices):
            me.normals_split_custom_set_from_vertices(vn)
    if mirror:
        U.mirror_y(obj)
    return obj


def strip(surface, view, line, width, name, mat, offset=0.0012, step=None, **kw):
    """Thin projected line (panel gap, trim, crease highlight)."""
    poly = C.polyline_strip(np.asarray(line, float), width)
    return decal(surface, view, poly, name, mat, offset=offset, step=step or max(width, 0.004), **kw)


def side_profile(surface, xs, z, side=1):
    """Body outer points along the side at height z: returns list of (Vector loc, Vector normal)."""
    out = []
    for x in xs:
        h = surface.ray((x, side * 6.0, z), (0, -side, 0), 12)
        out.append(None if h is None else (h[0], h[1]))
    return out


def plan_contour(surface, z, center, a0, a1, n=80, radius=6.0):
    """Ray-cast toward a vertical axis through `center` (x, y) from angles a0..a1 (deg)."""
    out = []
    cx, cy = center
    for a in np.radians(np.linspace(a0, a1, n)):
        o = Vector((cx + radius * math.cos(a), cy + radius * math.sin(a), z))
        d = (Vector((cx, cy, z)) - o).normalized()
        h = surface.ray(o, d, radius * 2)
        if h is not None:
            nor = Vector((h[1].x, h[1].y, 0))
            if nor.length < 1e-6:
                nor = -d
            out.append((h[0], nor.normalized()))
    return out
