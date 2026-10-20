"""Lamps, mirrors, handles, interior and other bolt-on details."""
import math
import numpy as np
from mathutils import Matrix, Vector

from . import curves as C
from . import util as U
from . import parts as P
from . import materials as M
from . import body as B


# ---------------------------------------------------------------- lamps
def round_lamp(name, loc, normal, radius, depth=0.05, bezel_m=None, halo=True, projector=True,
               lens_m=None, halo_m=None, bezel_w=0.010, up=(0, 0, 1), recess=0.0):
    """Round headlamp: reflector cup, projector, LED halo ring, bezel and glass lens."""
    mtx = P.oriented(Vector(loc) - Vector(normal).normalized() * recess, normal, up)
    bezel_m = bezel_m or M.chrome()
    objs = []
    cup = [(radius, 0.0), (radius * 0.92, -depth * 0.35), (radius * 0.6, -depth * 0.85), (0, -depth)]
    objs.append(P.revolve(name + "_reflector", cup, 48, M.reflector(), matrix=mtx))
    br = [(radius - 0.002, 0.006), (radius + bezel_w * 0.5, 0.010), (radius + bezel_w, 0.004),
          (radius + bezel_w, -0.004), (radius - 0.002, -0.002)]
    objs.append(P.revolve(name + "_bezel", br, 64, bezel_m, closed=True, matrix=mtx, sharp=60))
    if projector:
        pr = [(radius * 0.42, -depth * 0.6), (radius * 0.42, -0.004), (radius * 0.36, 0.0),
              (radius * 0.2, 0.006), (0, 0.008)]
        objs.append(P.revolve(name + "_projector", pr, 48, M.black_gloss(), matrix=mtx))
        objs.append(P.revolve(name + "_projlens", [(radius * 0.3, 0.0), (radius * 0.18, 0.009), (0, 0.011)],
                              32, M.glass_clear(), matrix=mtx))
    if halo:
        objs.append(P.torus(name + "_halo", radius * 0.74, max(0.0035, radius * 0.06), halo_m or M.led_white(),
                            matrix=mtx @ Matrix.Translation((0, 0, -0.002))))
    lens = [(radius + 0.001, 0.004), (radius * 0.7, 0.010), (0, 0.012)]
    ln = P.revolve(name + "_lens", lens, 64, lens_m or M.glass_clear(), matrix=mtx)
    U.solidify(ln, 0.002, -1)
    objs.append(ln)
    return objs


def lamp_cluster(surface, view, outline, name, housing_m, lens_m=None, strips=(), strip_m=None,
                 strip_w=0.008, mirror=True, housing_offset=0.002, lens_offset=0.008, step=0.008,
                 inner=None, inner_m=None):
    """Flat projected lamp: dark housing, optional inner panel, LED strips and a glass cover."""
    objs = [B.decal(surface, view, outline, name + "_housing", housing_m, housing_offset, step, mirror=mirror)]
    if inner is not None:
        for i, poly in enumerate(inner):
            objs.append(B.decal(surface, view, poly, f"{name}_inner{i}", inner_m or M.reflector(),
                                housing_offset + 0.002, step * 0.7, mirror=mirror))
    for i, line in enumerate(strips):
        objs.append(B.strip(surface, view, line, strip_w, f"{name}_led{i}", strip_m or M.led_white(),
                            offset=housing_offset + 0.003, mirror=mirror))
    if lens_m is not None:
        objs.append(B.decal(surface, view, outline, name + "_lens", lens_m, lens_offset, step,
                            mirror=mirror))
    return [o for o in objs if o]


# ---------------------------------------------------------------- mirrors, handles
def side_mirror(name, base, mats, size=(0.13, 0.065, 0.075), arm=0.06, yaw=0.0, mirror=True):
    """Modern aero mirror: rounded housing on a short stalk. base = attach point on +Y side."""
    body_m, glass_m, arm_m = mats
    bx, by, bz = base
    hx, hy, hz = size
    cx, cy, cz = bx - 0.02, by + arm + hy * 0.5, bz + 0.03
    rot = Matrix.Rotation(yaw, 4, "Z")
    hous = P.superellipsoid(name + "_housing", (cx, cy, cz), (hx * 0.5, hy, hz * 0.5), (0.45, 0.4), 40, 20,
                            body_m, matrix=rot)
    # chop the rear face flat with a mirror glass disc
    gl = P.superellipsoid(name + "_glass", (cx - hx * 0.5 + 0.004, cy, cz), (0.004, hy * 0.92, hz * 0.45),
                          (0.3, 0.35), 32, 8, glass_m, matrix=rot)
    stalk = P.tube(name + "_arm", [(bx + 0.01, by - 0.01, bz), (bx, by + arm * 0.5, bz + 0.015),
                                   (cx + 0.01, cy - hy * 0.4, cz - 0.01)], 0.012, arm_m)
    objs = [hous, gl, stalk]
    if mirror:
        for o in objs:
            U.mirror_y(o)
    return objs


def flush_handle(surface, x, z, name, mat, w=0.13, h=0.022):
    return B.decal(surface, "side", C.rrect(x, z, w, h, h * 0.45, 4), name, mat, 0.003, 0.006,
                   thickness=0.004, mirror=True)


# ---------------------------------------------------------------- body lines
def door_cuts(surface, lines, name, width=0.004, mirror=True):
    """Panel gaps on the +Y side: lines are polylines in (x, z)."""
    objs = []
    for i, ln in enumerate(lines):
        objs.append(B.strip(surface, "side", ln, width, f"{name}{i}", M.gap(), offset=0.0008,
                            mirror=mirror))
    return [o for o in objs if o]


def door_outline(x0, x1, z0, z1, r=0.03, n=5):
    """Closed door shape (as an open polyline loop) in x,z."""
    poly = C.round_corners([(x0, z0), (x1, z0), (x1, z1), (x0, z1)], r, n)
    return np.vstack([poly, poly[:1]])


# ---------------------------------------------------------------- windows
WINDOW_CUTTERS = []   # (kind, polygon) pairs collected while placing glass


def _side_cutter(poly, name):
    WINDOW_CUTTERS.append(("side", np.asarray(poly, float)))


def _top_cutter(poly, name):
    WINDOW_CUTTERS.append(("top", np.asarray(poly, float)))


def cut_window_openings(gh_obj):
    """Delete greenhouse faces behind every glass panel so the cabin shows through.

    Runs on the base mesh (before the solidify modifier), so the openings get clean
    thick edges; the jagged boundary is hidden under the black frit band of the glass.
    """
    import bmesh
    if not WINDOW_CUTTERS:
        return
    bm = bmesh.new()
    bm.from_mesh(gh_obj.data)
    bm.normal_update()
    co = np.array([v.co[:] for v in bm.verts])
    normals = np.array([f.normal[:] for f in bm.faces])
    fverts = [[v.index for v in f.verts] for f in bm.faces]
    kill = np.zeros(len(normals), bool)
    for kind, poly in WINDOW_CUTTERS:
        axes, sel = ([0, 2], np.abs(normals[:, 1]) > 0.25) if kind == "side" else ([0, 1], normals[:, 2] > 0.2)
        inside = C.points_in_polygon(co[:, axes], poly)
        if kind == "side":
            inside &= np.abs(co[:, 1]) > 0.2
        allin = np.array([inside[fv].all() for fv in fverts])
        kill |= sel & allin
    faces = [f for f, k in zip(bm.faces, kill) if k]
    bmesh.ops.delete(bm, geom=faces, context="FACES")
    bm.to_mesh(gh_obj.data)
    bm.free()
    gh_obj.data.update()
    WINDOW_CUTTERS.clear()


def side_windows(gh_surface, dlo, cuts, name, mats, frame_w=0.016, round_r=0.03):
    """Side glass on +Y (mirrored). dlo: closed polygon (x,z) of the whole daylight opening.
    cuts: list of pillar lines ((xb, zb), (xt, zt), width): splits the DLO into panes."""
    glass_m, frame_m = mats
    objs = []
    rd = C.round_corners(dlo, round_r)
    frame = B.decal(gh_surface, "side", [C.offset_polygon(rd, frame_w), C.offset_polygon(rd, -0.004)],
                    name + "_trim", frame_m, 0.0015, 0.008, mirror=True)
    objs.append(frame)
    panes = [np.asarray(dlo, float)]
    for (b, t, w) in cuts:
        b, t = np.asarray(b, float), np.asarray(t, float)
        d = (t - b) / np.linalg.norm(t - b)
        nrm = np.array([d[1], -d[0]]) * w / 2
        new = []
        for p in panes:
            left = C.clip_halfplane(p, b - nrm, t - nrm)      # front of the pillar line? (left side)
            right = C.clip_halfplane(p, t + nrm, b + nrm)
            for q in (left, right):
                if len(q) >= 3 and abs(C.signed_area(q)) > 1e-4:
                    new.append(q)
        panes = new
    for i, p in enumerate(panes):
        pr = C.round_corners(p, round_r * 0.6)
        objs.append(B.decal(gh_surface, "side", pr, f"{name}_pane{i}", glass_m, 0.0065, 0.012, mirror=True))
        objs.append(B.decal(gh_surface, "side", [C.offset_polygon(pr, 0.002), C.offset_polygon(pr, -0.042)],
                            f"{name}_frit{i}", frame_m, 0.0035, 0.008, mirror=True))
        _side_cutter(C.offset_polygon(pr, -0.02), f"{name}_pane{i}")
    return [o for o in objs if o]


def glass_area(gh, surface, x0, x1, margin, name, mats, view="top", frame_w=0.018, n=24, round_r=0.05,
               lower_lift=0.0):
    """Windshield/backlight between x0 and x1 following the greenhouse top width minus margin."""
    glass_m, frame_m = mats
    xs = np.linspace(x0, x1, n)
    right = [(x, gh.top_width(x) - margin) for x in xs]
    left = [(x, -(gh.top_width(x) - margin)) for x in xs[::-1]]
    poly = np.array(right + left)
    poly = C.round_corners(poly, round_r, 5)
    objs = [B.decal(surface, view, [C.offset_polygon(poly, frame_w), C.offset_polygon(poly, -0.004)],
                    name + "_trim", frame_m, 0.0015, 0.01, depth_tol=2.0),
            B.decal(surface, view, poly, name, glass_m, 0.0065, 0.015, depth_tol=2.0),
            B.decal(surface, view, [C.offset_polygon(poly, 0.002), C.offset_polygon(poly, -0.06)], name + "_frit",
                    frame_m, 0.0035, 0.01, depth_tol=2.0)]
    if view == "top":
        _top_cutter(C.offset_polygon(poly, -0.035), name)
    return [o for o in objs if o]


# ---------------------------------------------------------------- interior
def seat(name, x, y, z_floor, mats, w=0.50, h_back=0.60, recline=0.28, sport=True):
    main_m, accent_m = mats
    objs = []
    objs.append(P.rbox(name + "_cushion", (x, y, z_floor + 0.10), (0.50, w, 0.12), main_m, 0.035))
    back_c = (x - 0.24 - math.sin(recline) * h_back * 0.5, y, z_floor + 0.16 + math.cos(recline) * h_back * 0.5)
    objs.append(P.rbox(name + "_back", back_c, (0.12, w, h_back), main_m, 0.04, rot=(0, -recline, 0)))
    if sport:
        for s in (-1, 1):
            objs.append(P.rbox(f"{name}_bolster{s}", (back_c[0] + 0.03, y + s * (w / 2 - 0.03), back_c[2] - 0.04),
                               (0.15, 0.07, h_back * 0.8), accent_m, 0.03, rot=(0, -recline, 0)))
    hr = (x - 0.24 - math.sin(recline) * (h_back + 0.10), y, z_floor + 0.16 + math.cos(recline) * (h_back + 0.09))
    objs.append(P.rbox(name + "_headrest", hr, (0.10, w * 0.55, 0.17), main_m, 0.035, rot=(0, -recline, 0)))
    return objs


def bench(name, x, z_floor, half_w, mats, recline=0.3, h_back=0.55):
    main_m, _ = mats
    objs = [P.rbox(name + "_cushion", (x, 0, z_floor + 0.11), (0.48, half_w * 2, 0.13), main_m, 0.04)]
    objs.append(P.rbox(name + "_back", (x - 0.26 - math.sin(recline) * h_back * 0.5, 0,
                                        z_floor + 0.17 + math.cos(recline) * h_back * 0.5),
                       (0.12, half_w * 2, h_back), main_m, 0.045, rot=(0, -recline, 0)))
    return objs


def steering_wheel(name, center, mats, r=0.18, tilt=math.radians(62), yoke=False):
    rim_m, hub_m = mats
    mtx = Matrix.Translation(center) @ Matrix.Rotation(-tilt, 4, "Y") @ Matrix.Rotation(math.pi / 2, 4, "Y")
    objs = []
    if yoke:
        t = np.linspace(-0.85, 0.85, 30)
        path = [mtx @ Vector((r * math.sin(a) * 1.15, r * math.cos(a) * 0.7 + 0.02, 0)) for a in t]
        path = [mtx @ Vector((-r * 0.95, -0.05, 0))] + path + [mtx @ Vector((r * 0.95, -0.05, 0))]
        objs.append(P.tube(name + "_rim", [tuple(p) for p in path], 0.018, rim_m))
    else:
        objs.append(P.torus(name + "_rim", r, 0.016, rim_m, matrix=mtx, seg=48, n=10))
    objs.append(P.disc(name + "_hub", 0.06, 0.03, hub_m, matrix=mtx @ Matrix.Translation((0, 0, -0.01))))
    for a in (0, math.pi, -math.pi / 2):
        p0 = mtx @ Vector((0.05 * math.cos(a), 0.05 * math.sin(a), 0))
        p1 = mtx @ Vector((r * math.cos(a), r * math.sin(a), 0))
        objs.append(P.tube(f"{name}_spoke{a:.1f}", [tuple(p0), tuple(p1)], 0.012, hub_m))
    col = mtx @ Vector((0, 0, -0.25))
    objs.append(P.tube(name + "_column", [tuple(mtx @ Vector((0, 0, -0.02))), tuple(col)], 0.03, hub_m))
    return objs


def dashboard(name, x_front, x_back, z_low, z_top, half_w, mats, screens=()):
    dash_m, trim_m = mats
    prof = C.round_corners([(0.0, 0.0), (x_back - x_front, 0.04), (x_back - x_front + 0.02, z_top - z_low - 0.02),
                            (0.0, z_top - z_low)], 0.03, 4)
    # profile in (x, z) swept across y
    path = [(x_front, -half_w, z_low), (x_front, half_w, z_low)]
    prof2 = [(p[0], p[1]) for p in prof]
    obj = P.sweep(name, prof2, path, dash_m, up=(0, 0, 1))
    objs = [obj]
    for i, (yc, w, h, tilt) in enumerate(screens):
        objs.append(P.rbox(f"{name}_screen{i}", (x_back + 0.01, yc, z_top + h * 0.35), (0.012, w, h), M.screen(),
                           0.004, rot=(0, -tilt, 0)))
        objs.append(P.rbox(f"{name}_screenframe{i}", (x_back + 0.016, yc, z_top + h * 0.35),
                           (0.012, w + 0.012, h + 0.012), trim_m, 0.005, rot=(0, -tilt, 0)))
    return objs


def console(name, x0, x1, z_floor, z_top, w, mat):
    return [P.rbox(name, ((x0 + x1) / 2, 0, (z_floor + z_top) / 2), (x1 - x0, w, z_top - z_floor), mat, 0.03)]


# ---------------------------------------------------------------- aero
def wing(name, x_le, chord, span_half, z, mats, thickness=0.014, aoa=-0.08, plates=True, stands=None):
    """Rear wing: cambered airfoil swept across the width, optional endplates and stands."""
    wing_m, plate_m = mats
    t = np.linspace(0, math.pi, 14)
    xs = chord * (1 - np.cos(t)) / 2
    upper = [(x, thickness * 1.2 * math.sin(math.pi * x / chord) ** 0.7 + 0.012 * (x / chord)) for x in xs]
    lower = [(x, -thickness * 0.4 * math.sin(math.pi * x / chord) + 0.012 * (x / chord)) for x in xs[::-1]]
    prof = np.array(upper + lower[1:-1])
    ca, sa = math.cos(aoa), math.sin(aoa)
    prof = np.stack([prof[:, 0] * ca - prof[:, 1] * sa, prof[:, 0] * sa + prof[:, 1] * ca], 1)
    path = [(x_le, -span_half, z), (x_le, span_half, z)]
    # sweep path along +Y: frame side = t x up = (0,1,0)x(0,0,1) = (1,0,0) -> profile x maps to world +x
    prof_w = [(-p[0], p[1]) for p in prof]
    objs = [P.sweep(name, prof_w, path, wing_m, up=(0, 0, 1), sharp=50)]
    if plates:
        for s in (-1, 1):
            pl = C.round_corners([(x_le + 0.03, z - 0.06), (x_le - chord - 0.04, z - 0.06),
                                  (x_le - chord - 0.04, z + 0.07), (x_le - 0.02, z + 0.03)], 0.02, 4)
            objs.append(P.prism(f"{name}_plate{s}", pl, (0, s * span_half, 0), (1, 0, 0), (0, 0, 1), 0.008,
                                plate_m, center=True))
    for i, (y, z0) in enumerate(stands or []):
        for s in (-1, 1):
            pl = C.round_corners([(x_le - chord * 0.2, z0), (x_le - chord * 0.75, z0),
                                  (x_le - chord * 0.6, z), (x_le - chord * 0.35, z)], 0.01, 3)
            objs.append(P.prism(f"{name}_stand{i}{s}", pl, (0, s * y, 0), (1, 0, 0), (0, 0, 1), 0.012,
                                plate_m, center=True))
    return objs


def exhaust_tip(name, loc, r, length=0.12, mat=None, direction=(-1, 0, 0)):
    mtx = P.oriented(loc, direction)
    prof = [(r - 0.004, -length), (r - 0.004, 0.002), (r, 0.004), (r + 0.003, 0.0), (r + 0.003, -length)]
    o = P.revolve(name, prof, 40, mat or M.chrome(), matrix=mtx, sharp=60)
    inner = P.disc(name + "_soot", r - 0.004, 0.004, M.black_matte(), matrix=mtx @ Matrix.Translation((0, 0, -0.05)))
    return [o, inner]


def wipers(surface, x_base, pivots, length=0.48, angle=0.12, mat=None, lift=0.012):
    """Parked wiper arms lying along the bottom of the windshield (top-view ray-cast)."""
    mat = mat or M.black_satin()
    objs = []
    for i, yp in enumerate(pivots):
        pts = []
        for t in np.linspace(0, 1, 12):
            x = x_base - 0.02 - t * length * math.sin(angle)
            y = yp + t * length * math.cos(angle)
            h = surface.ray((x, y, 5.0), (0, 0, -1), 10)
            if h is not None:
                pts.append(tuple(h[0] + h[1] * lift))
        if len(pts) > 2:
            objs.append(P.tube(f"wiper_arm{i}", pts, 0.0055, mat, n=8))
            objs.append(P.tube(f"wiper_blade{i}", [tuple(Vector(p) + Vector((0.008, 0, -0.004))) for p in pts[2:]],
                               0.004, M.rubber(), n=6))
    return objs


def shark_antenna(surface, x, mat, length=0.16, height=0.055):
    h = surface.ray((x, 0, 5.0), (0, 0, -1), 10)
    if h is None:
        return []
    z = h[0].z
    return [P.superellipsoid("antenna", (x, 0, z), (length / 2, 0.025, height), (0.6, 0.8), 32, 12, mat)]
