"""Wheel assemblies: tyre, rim barrel, spokes / discs, hub, brakes.

A wheel is built around local Z (Z+ = outer face) at the origin, parented to an
empty that is then rotated so local Z points along world +Y (right side) or -Y (left).
"""
import math
import numpy as np
from mathutils import Matrix, Vector

from . import curves as C
from . import util as U
from . import parts as P
from . import materials as M
from .body import fill_polygon_2d


def tyre(name, R, rr, W, mat, grooves=4, seg=96):
    h = W / 2
    pts = [
        (rr - 0.004, -h * 0.80), (rr + 0.012, -h * 0.93), (R - 0.040, -h - 0.004),
        (R - 0.004, -h + 0.020), (R, -h + 0.045),
    ]
    # tread with circumferential grooves
    tread = []
    ys = np.linspace(-h + 0.045, h - 0.045, grooves + 2)[1:-1]
    for y in ys:
        tread += [(R, y - 0.0075), (R - 0.008, y - 0.006), (R - 0.008, y + 0.006), (R, y + 0.0075)]
    pts += tread
    pts += [(R, h - 0.045), (R - 0.004, h - 0.020), (R - 0.040, h + 0.004),
            (rr + 0.012, h * 0.93), (rr - 0.004, h * 0.80)]
    radii = [0.004, 0.02, 0.02, 0.012, 0.004] + [0.002] * len(tread) + [0.004, 0.012, 0.02, 0.02, 0.004]
    prof = C.round_polyline(pts, radii, 2, 4, closed=True)
    return P.revolve(name, prof, seg, mat, closed=True, sharp=70)


def barrel(name, rr, W, mat, lip=0.018, dish=0.0, mat_lip=None, seg=96):
    """Rim barrel with outer lip. dish: how far the spoke face sits behind the lip."""
    yo, yi = W / 2 * 0.86, -W / 2 * 0.86
    t = 0.006
    pts = [
        (rr + 0.014, yo), (rr - lip, yo), (rr - lip, yo - 0.006), (rr - 0.016, yo - 0.008 - dish),
        (rr - 0.016, yi + 0.006), (rr + 0.014, yi), (rr + 0.014, yi + t), (rr - 0.004, yi + 0.012),
        (rr - 0.004, yo - 0.014), (rr + 0.014, yo - t),
    ]
    prof = C.round_polyline(pts, [0.003] * len(pts), 2, 3, closed=True)
    return P.revolve(name, prof, seg, mat_lip or mat, closed=True, sharp=50)


def _spoke_section(c, e_t, e_a, w, t, chamfer):
    hw = w / 2
    ch = min(chamfer, hw * 0.45)
    return [c - e_t * hw - e_a * t, c + e_t * hw - e_a * t, c + e_t * hw - e_a * ch,
            c + e_t * (hw - ch), c - e_t * (hw - ch), c - e_t * hw - e_a * ch]


def spokes(name, n, r0, r1, w0, w1, t, y_of_u, mat, twist=0.0, split=0.0, angle0=0.0,
           chamfer=0.006, steps=14, w_curve=None):
    """Radial spokes from hub radius r0 to rim radius r1.

    y_of_u(u): axial position of the spoke face, u in [0,1] hub->rim.
    split: if > 0 spokes come in pairs whose angular gap grows to `split` at the rim.
    """
    V, F = [], []
    base_angles = []
    if split > 0:
        for i in range(n // 2):
            a = angle0 + i * 2 * math.pi / (n // 2)
            base_angles += [(a, -1), (a, 1)]
    else:
        base_angles = [(angle0 + i * 2 * math.pi / n, 0) for i in range(n)]
    for a, sgn in base_angles:
        start = len(V)
        for k in range(steps + 1):
            u = k / steps
            r = r0 + (r1 - r0) * u
            th = a + twist * u + sgn * split * 0.5 * u ** 0.8
            w = w0 + (w1 - w0) * (u if w_curve is None else w_curve(u))
            c = Vector((r * math.cos(th), r * math.sin(th), y_of_u(u)))
            e_t = Vector((-math.sin(th), math.cos(th), 0))
            e_a = Vector((0, 0, 1))
            V += _spoke_section(c, e_t, e_a, w, t, chamfer)
        m = 6
        for k in range(steps):
            for j in range(m):
                j2 = (j + 1) % m
                F.append((start + k * m + j, start + k * m + j2, start + (k + 1) * m + j2, start + (k + 1) * m + j))
        F.append(tuple(start + j for j in range(m))[::-1])
        F.append(tuple(start + steps * m + j for j in range(m)))
    obj = U.mesh_object(name, V, F, mat, smooth=True)
    U.cleanup_mesh(obj)
    obj.data.set_sharp_from_angle(angle=math.radians(35))
    U.add_mod(obj, "BEVEL", width=0.0025, segments=2, limit_method="ANGLE", angle_limit=math.radians(30))
    return obj


def face_disc(name, r_out, r_in, holes, y_of_r, thickness, mat, step=0.01):
    """Solid wheel face (disc/turbine/cover) with cut-outs; y_of_r gives the dish shape."""
    outer = C.ellipse(0, 0, r_out, r_out, 120)
    loops = [outer] + list(holes)
    if r_in > 0:
        loops.append(C.ellipse(0, 0, r_in, r_in, 48))
    vs, tris = fill_polygon_2d(loops, step)
    V = [(x, y, y_of_r(math.hypot(x, y))) for x, y in vs]
    obj = U.mesh_object(name, V, tris, mat, smooth=True)
    U.cleanup_mesh(obj, recalc=False)
    if obj.data.polygons and obj.data.polygons[0].normal.z < 0:
        U.flip_normals(obj)
    U.solidify(obj, thickness, -1.0)
    obj.data.set_sharp_from_angle(angle=math.radians(40))
    return obj


def hub(name, r_cap, y, mats, lugs=5, lug_r=0.058, cap_style="dome"):
    metal, cap_m, nut_m = mats
    objs = []
    prof = [(0, y + 0.012), (r_cap * 0.7, y + 0.010), (r_cap, y + 0.002), (r_cap * 1.04, y - 0.01), (0, y - 0.01)]
    if cap_style == "flat":
        prof = [(0, y + 0.004), (r_cap, y + 0.004), (r_cap * 1.02, y - 0.01), (0, y - 0.01)]
    objs.append(P.revolve(name + "_cap", prof, 48, cap_m, closed=True, sharp=40))
    for i in range(lugs):
        a = i * 2 * math.pi / lugs + math.pi / 2
        mtx = Matrix.Translation((lug_r * math.cos(a), lug_r * math.sin(a), y - 0.012))
        hexp = [(0.0095, 0), (0.0095, 0.012), (0.0075, 0.016), (0, 0.017)]
        objs.append(P.revolve(f"{name}_lug{i}", hexp, 6, nut_m, smooth=False, matrix=mtx))
    return objs


def brakes(name, r_disc, y, mats, caliper_angle=math.radians(20)):
    disc_m, cal_m = mats
    objs = [P.disc(name + "_disc", r_disc, 0.028, disc_m, Matrix.Translation((0, 0, y - 0.028)), 64, r_in=0.075)]
    a0, a1 = caliper_angle - 0.45, caliper_angle + 0.45
    arc = [(r_disc - 0.035) * np.array([math.cos(a), math.sin(a), 0]) + [0, 0, y - 0.014]
           for a in np.linspace(a0, a1, 10)]
    prof = C.rrect(0, 0, 0.07, 0.058, 0.012, 4)
    cal = P.sweep(name + "_caliper", prof, arc, cal_m, up=(0, 0, 1))
    objs.append(cal)
    return objs


class WheelSpec:
    def __init__(self, R=0.32, W=0.235, rim_d=0.457, style="multi", rim_mat=None, lip_mat=None,
                 n=10, w0=0.03, w1=0.02, t=0.022, concave=0.03, twist=0.0, split=0.0, dish=0.0,
                 lip=0.018, holes=None, cap=0.04, caliper=(0.6, 0.02, 0.02), disc_face=False,
                 cap_style="dome", face_mat=None, chamfer=0.006, angle0=0.0, extra=None):
        self.__dict__.update(locals())
        del self.__dict__["self"]


def build_wheel(name, s: WheelSpec):
    """Return list of objects of one wheel in local coords (Z+ outward)."""
    rr = s.rim_d / 2
    rim_m = s.rim_mat or M.alu()
    objs = [tyre(name + "_tyre", s.R, rr, s.W, M.rubber())]
    objs.append(barrel(name + "_barrel", rr, s.W, rim_m, lip=s.lip, dish=s.dish, mat_lip=s.lip_mat))
    y_face = s.W / 2 * 0.86 - 0.010 - s.dish
    r_out = rr - 0.014
    r_hub = 0.085
    y_hub = y_face - s.concave
    yfun = lambda u: y_hub + (y_face - y_hub) * (1 - (1 - u) ** 2)
    if s.style in ("multi", "split", "blade"):
        objs.append(spokes(name + "_spokes", s.n, r_hub * 0.9, r_out + 0.004, s.w0, s.w1, s.t, yfun,
                           s.face_mat or rim_m, twist=s.twist, split=s.split, angle0=s.angle0,
                           chamfer=s.chamfer))
        objs.append(P.revolve(name + "_center", [(0, y_hub + 0.004), (r_hub, y_hub + 0.004),
                                                 (r_hub + 0.006, y_hub - 0.02), (0, y_hub - 0.02)],
                              48, s.face_mat or rim_m, closed=True, sharp=40))
    if s.style in ("disc", "turbine", "cover"):
        holes = s.holes or []
        ydisc = lambda r: y_hub + (y_face - y_hub) * min(1.0, max(0.0, (r - r_hub) / (r_out - r_hub))) ** 0.6
        objs.append(face_disc(name + "_face", r_out + 0.004, 0.0, holes, ydisc, 0.01, s.face_mat or rim_m))
    if s.extra:
        objs += s.extra(name, s, y_face, y_hub, r_out)
    objs += hub(name + "_hub", s.cap, y_hub + (0.006 if s.style in ("disc", "turbine", "cover") else 0),
                (rim_m, s.face_mat or rim_m, M.chrome()), cap_style=s.cap_style)
    objs += brakes(name + "_brake", rr - 0.045, y_hub - 0.035, (M.brake_disc(), M.caliper(s.caliper)))
    return objs


def place_wheels(car, spec, positions):
    """positions: list of (x, y, z) wheel centres; |y| at the wheel's outer face centre plane."""
    proto = build_wheel(car + "_wheel", spec)
    out = []
    for i, (x, y, z) in enumerate(positions):
        e = U.empty(f"{car}_wheel_{i}", (x, y, z))
        side = 1 if y > 0 else -1
        # local Z -> world +-Y, keep local X along world X
        e.rotation_euler = (-side * math.pi / 2, 0, 0)
        for o in proto:
            if i == 0:
                c = o
            else:
                c = o.copy()
                U.link(c)
            c.parent = e
            out.append(c)
    return out
