"""Generic mesh generators: revolve, sweep, prisms, superellipsoids, text plates."""
import math
import numpy as np
from mathutils import Vector, Matrix

from . import curves as C
from . import util as U


def revolve(name, prof, seg=64, mat=None, closed=False, smooth=True, sharp=None, matrix=None,
            a0=0.0, a1=2 * math.pi, mat_indices=None):
    """Lathe a (radius, axial) profile around local Z. Full turn unless a0/a1 given."""
    prof = np.asarray(prof, float)
    full = abs((a1 - a0) - 2 * math.pi) < 1e-6
    t = np.linspace(a0, a1, seg, endpoint=not full)
    k = len(prof)
    V = []
    for a in t:
        ca, sa = math.cos(a), math.sin(a)
        for r, z in prof:
            V.append((r * ca, r * sa, z))
    F = U.grid_faces(len(t), k, closed_cols=closed, closed_rows=full)
    obj = U.mesh_object(name, V, F, mat, smooth=smooth)
    U.cleanup_mesh(obj, merge=1e-6, recalc=False)
    if sharp is not None:
        obj.data.set_sharp_from_angle(angle=math.radians(sharp))
    if matrix is not None:
        obj.matrix_world = matrix
    return obj


def frames_along(path, up=None):
    """Tangent/side/up frames along a 3D polyline (rotation-minimising if up is None)."""
    P = np.asarray(path, float)
    T = np.gradient(P, axis=0)
    T /= np.linalg.norm(T, axis=1, keepdims=True) + 1e-12
    frames = []
    if up is not None:
        upv = np.asarray(up, float)
        for t in T:
            s = np.cross(t, upv)
            if np.linalg.norm(s) < 1e-6:
                s = np.cross(t, [1, 0, 0])
            s /= np.linalg.norm(s)
            u = np.cross(s, t)
            frames.append((t, s, u))
        return frames
    t0 = T[0]
    ref = np.array([0, 0, 1.0]) if abs(t0[2]) < 0.9 else np.array([1.0, 0, 0])
    s = np.cross(t0, ref)
    s /= np.linalg.norm(s)
    u = np.cross(s, t0)
    frames.append((t0, s, u))
    for i in range(1, len(T)):
        t = T[i]
        u = u - t * np.dot(u, t)
        u /= np.linalg.norm(u) + 1e-12
        s = np.cross(t, u)
        frames.append((t, s, u))
    return frames


def sweep(name, profile, path, mat=None, up=(0, 0, 1), closed_profile=True, closed_path=False,
          caps=True, smooth=True, sharp=45, scale=None):
    """Sweep a 2D profile (side, up) along a path. scale: optional per-path-point factor."""
    prof = np.asarray(profile, float)
    P = np.asarray(path, float)
    fr = frames_along(P, up)
    V = []
    for i, (p, (t, s, u)) in enumerate(zip(P, fr)):
        k = 1.0 if scale is None else scale[i]
        for a, b in prof:
            V.append(p + s * a * k + u * b * k)
    m, n = len(P), len(prof)
    F = U.grid_faces(m, n, closed_cols=closed_profile, closed_rows=closed_path)
    if caps and not closed_path and closed_profile:
        V.append(P[0]); V.append(P[-1])
        c0, c1 = len(V) - 2, len(V) - 1
        for j in range(n):
            j2 = (j + 1) % n
            F.append((c0, j2, j))
            F.append((c1, (m - 1) * n + j, (m - 1) * n + j2))
    obj = U.mesh_object(name, V, F, mat, smooth=smooth)
    U.cleanup_mesh(obj, merge=1e-6)
    if smooth and sharp:
        obj.data.set_sharp_from_angle(angle=math.radians(sharp))
    return obj


def dedupe_loop(poly, eps=1e-5):
    P = np.asarray(poly, float)
    keep = [P[0]]
    for p in P[1:]:
        if np.linalg.norm(p - keep[-1]) > eps:
            keep.append(p)
    if len(keep) > 2 and np.linalg.norm(keep[0] - keep[-1]) <= eps:
        keep.pop()
    return np.array(keep)


def prism(name, poly, origin, u, v, depth, mat=None, smooth=False, holes=(), center=False):
    """Extrude a 2D polygon (in the plane origin + a*u + b*v) by depth along u x v.

    Without holes the caps are single n-gons, which keeps the solid manifold (safe for booleans).
    """
    poly = dedupe_loop(poly)
    if C.signed_area(poly) < 0:
        poly = poly[::-1]
    o, u, v = Vector(origin), Vector(u), Vector(v)
    w = u.cross(v).normalized()
    d0 = -depth / 2 if center else 0.0
    if not holes:
        n = len(poly)
        V = [o + u * a + v * b + w * d0 for a, b in poly] + [o + u * a + v * b + w * (d0 + depth) for a, b in poly]
        F = [tuple(range(n))[::-1], tuple(range(n, 2 * n))]
        F += [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
        obj = U.mesh_object(name, V, F, mat, smooth=smooth)
        U.ensure_outward(obj)
        return obj
    from .body import fill_polygon_2d
    loops = [poly] + [dedupe_loop(h) for h in holes]
    step = max(np.ptp(poly, 0).max() / 6, 0.002)
    vs, tris = fill_polygon_2d(loops, step)
    V = [o + u * a + v * b + w * d0 for a, b in vs] + [o + u * a + v * b + w * (d0 + depth) for a, b in vs]
    nv = len(vs)
    F = [tuple(f[::-1]) for f in tris] + [tuple(i + nv for i in f) for f in tris]
    for loop in loops:
        L = C.resample(loop, step)
        idx = [int(np.argmin(np.sum((vs - p) ** 2, 1))) for p in L]
        for i in range(len(idx)):
            a, b = idx[i], idx[(i + 1) % len(idx)]
            if a != b:
                F.append((a, b, b + nv, a + nv))
    obj = U.mesh_object(name, V, F, mat, smooth=smooth)
    U.cleanup_mesh(obj, merge=1e-6)
    return obj


def superellipsoid(name, center, size, e=(0.35, 0.35), nu=32, nv=16, mat=None, matrix=None):
    """Rounded-box-like blob. size=(a,b,c) half-extents along x,y,z; e exponents (<1 boxier)."""
    a, b, c = size
    V = []
    us = np.linspace(-math.pi, math.pi, nu, endpoint=False)
    vs = np.linspace(-math.pi / 2, math.pi / 2, nv)
    f = lambda w, m: np.sign(w) * np.abs(w) ** m
    for vv in vs:
        for uu in us:
            x = a * f(math.cos(vv), e[0]) * f(math.cos(uu), e[1])
            y = b * f(math.cos(vv), e[0]) * f(math.sin(uu), e[1])
            z = c * f(math.sin(vv), e[0])
            V.append((x, y, z))
    F = U.grid_faces(nv, nu, closed_cols=True)
    obj = U.mesh_object(name, V, F, mat, smooth=True)
    U.cleanup_mesh(obj, merge=1e-6)
    obj.location = center
    if matrix is not None:
        obj.matrix_world = Matrix.Translation(Vector(center)) @ matrix
    return obj


def rbox(name, center, size, mat=None, bevel_w=0.01, seg=3, rot=(0, 0, 0)):
    """Box with a live bevel modifier. size = full extents."""
    sx, sy, sz = [s / 2 for s in size]
    V = [(-sx, -sy, -sz), (sx, -sy, -sz), (sx, sy, -sz), (-sx, sy, -sz),
         (-sx, -sy, sz), (sx, -sy, sz), (sx, sy, sz), (-sx, sy, sz)]
    F = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    obj = U.mesh_object(name, V, F, mat, smooth=True)
    obj.location = center
    obj.rotation_euler = rot
    if bevel_w:
        m = U.add_mod(obj, "BEVEL", width=bevel_w, segments=seg, limit_method="NONE")
        m.harden_normals = False
    return obj


def tube(name, path, radius, mat=None, n=12, closed_path=False, up=None):
    t = np.linspace(0, 2 * math.pi, n, endpoint=False)
    prof = np.stack([radius * np.cos(t), radius * np.sin(t)], 1)
    return sweep(name, prof, path, mat, up=up, closed_path=closed_path, sharp=None)


def torus(name, R, r, mat=None, matrix=None, seg=64, n=12):
    t = np.linspace(0, 2 * math.pi, n, endpoint=False)
    prof = np.stack([R + r * np.cos(t), r * np.sin(t)], 1)
    return revolve(name, prof, seg, mat, closed=True, matrix=matrix)


def disc(name, r, thickness, mat=None, matrix=None, seg=48, r_in=0.0):
    if r_in > 0:
        prof = [(r_in, 0), (r, 0), (r, thickness), (r_in, thickness)]
        return revolve(name, prof, seg, mat, closed=True, matrix=matrix, sharp=30)
    prof = [(0, 0), (r, 0), (r, thickness), (0, thickness)]
    return revolve(name, prof, seg, mat, closed=False, matrix=matrix, sharp=30)


def oriented(loc, normal, up=(0, 0, 1), spin=0.0):
    m = U.look_rotation(normal, up).to_4x4()
    if spin:
        m = m @ Matrix.Rotation(spin, 4, "Z")
    return Matrix.Translation(Vector(loc)) @ m


def plate(name, center, normal, text, size=(0.52, 0.112), mats=None, text_size=0.075, up=(0, 0, 1)):
    """License plate with raised characters, facing `normal`."""
    plate_m, text_m, frame_m = mats
    mtx = oriented(center, normal, up)
    w, h = size
    pr = C.rrect(0, 0, w, h, 0.008, 4)
    base = prism(name, pr, (0, 0, 0), (1, 0, 0), (0, 1, 0), 0.006, plate_m)
    base.matrix_world = mtx
    fr = prism(name + "_frame", C.rrect(0, 0, w + 0.016, h + 0.016, 0.012, 4), (0, 0, -0.004),
               (1, 0, 0), (0, 1, 0), 0.006, frame_m)
    fr.matrix_world = mtx
    txt = U.text_object(name + "_text", text, text_size, (0, 0, 0), (0, 0, 0), text_m, extrude=0.0012)
    txt.data.font = _mono_font()
    txt.matrix_world = mtx @ Matrix.Translation((0, -0.004, 0.007))
    return [base, fr, txt]


def _mono_font():
    import bpy
    f = bpy.data.fonts.get("Bfont Regular") or (bpy.data.fonts[0] if bpy.data.fonts else None)
    if f is None:
        f = bpy.data.fonts.load("<builtin>")
    return f
