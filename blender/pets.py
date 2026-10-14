"""Питомцы: процедурные собаки и кошки.

Каждая модель — иерархия частей с опорными точками (голова, хвост, лапы,
уши), чтобы игра могла анимировать их без скелета. Меши с префиксом
``Fur_`` получают в игре мех-шейдер (многослойные «оболочки»).

Цвет вершин мешей меха — это маски, а не готовый цвет:
  R — доля вторичного цвета (белые/кремовые отметины),
  G — доля тёмного цвета (чепрак, полоски, маска),
  B — коэффициент роста шерсти (0 — нет шерсти, 1 — максимум).
Так одна модель даёт много окрасов: палитру выбирает игра.
"""
import os as _os
import sys as _sys

_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))

import math

import bpy  # noqa: F401 — mathutils доступен только после bpy

from mathutils import Vector

from common import Blob, empty, export, mat, paint_vertices, prim, reset, world_pos


def smooth(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def lerp(a, b, t):
    return a + (b - a) * t


# ---------------------------------------------------------------- породы

BREEDS = {
    "corgi": dict(
        kind="dog", L=0.30, H=0.17, chest=(0.095, 0.11, 0.10), belly=(0.085, 0.13, 0.085),
        hip=(0.088, 0.10, 0.09), leg_r=0.039, paw_r=0.0391, leg_x=0.058, short_legs=True,
        neck_len=0.072, neck_ang=40, neck_r=0.0713,
        head_r=0.0858, muzzle_len=0.075, muzzle_r=0.036, muzzle_drop=0.012,
        ear="pointy", ear_size=(0.052, 0.085), ear_spread=28,
        tail="stub", tail_len=0.04, tail_r=0.035,
        eye_r=0.0145, tongue=True,
        growth=dict(body=1.0, legs=0.6, head=0.45, muzzle=0.25, ears=0.4, tail=1.0),
        pattern="corgi",
    ),
    "poodle": dict(
        kind="dog", L=0.26, H=0.33, chest=(0.08, 0.10, 0.10), belly=(0.07, 0.10, 0.075),
        hip=(0.075, 0.085, 0.08), leg_r=0.0338, paw_r=0.0322, leg_x=0.05,
        neck_len=0.12, neck_ang=28, neck_r=0.0552,
        head_r=0.077, muzzle_len=0.09, muzzle_r=0.03, muzzle_drop=0.01,
        ear="floppy", ear_size=(0.04, 0.12), ear_spread=0,
        tail="up", tail_len=0.16, tail_r=0.018,
        eye_r=0.0119, tongue=False,
        growth=dict(body=1.0, legs=1.0, head=1.0, muzzle=0.12, ears=1.0, tail=1.0),
        pattern="solid",
    ),
    "husky": dict(
        kind="dog", L=0.36, H=0.36, chest=(0.11, 0.13, 0.13), belly=(0.095, 0.14, 0.095),
        hip=(0.10, 0.11, 0.105), leg_r=0.0468, paw_r=0.046, leg_x=0.068,
        neck_len=0.0975, neck_ang=40, neck_r=0.0862,
        head_r=0.1045, muzzle_len=0.10, muzzle_r=0.042, muzzle_drop=0.012,
        ear="pointy", ear_size=(0.05, 0.08), ear_spread=14,
        tail="sickle", tail_len=0.30, tail_r=0.034,
        eye_r=0.0153, tongue=True,
        growth=dict(body=1.0, legs=0.55, head=0.5, muzzle=0.3, ears=0.45, tail=1.0),
        pattern="husky",
    ),
    "spitz": dict(
        kind="dog", L=0.14, H=0.16, chest=(0.085, 0.085, 0.09), belly=(0.075, 0.08, 0.075),
        hip=(0.075, 0.07, 0.075), leg_r=0.0286, paw_r=0.0287, leg_x=0.045,
        neck_len=0.06, neck_ang=30, neck_r=0.069,
        head_r=0.0748, muzzle_len=0.04, muzzle_r=0.024, muzzle_drop=0.006,
        ear="pointy", ear_size=(0.032, 0.045), ear_spread=12,
        tail="curl", tail_len=0.16, tail_r=0.028,
        eye_r=0.0136, tongue=True,
        growth=dict(body=1.0, legs=0.55, head=0.75, muzzle=0.25, ears=0.6, tail=1.0),
        pattern="spitz",
    ),
    "yorkie": dict(
        kind="dog", L=0.16, H=0.14, chest=(0.06, 0.075, 0.07), belly=(0.055, 0.075, 0.055),
        hip=(0.058, 0.065, 0.06), leg_r=0.0234, paw_r=0.0242, leg_x=0.038,
        neck_len=0.07, neck_ang=32, neck_r=0.046,
        head_r=0.0616, muzzle_len=0.035, muzzle_r=0.02, muzzle_drop=0.004,
        ear="pointy", ear_size=(0.026, 0.042), ear_spread=16,
        tail="up", tail_len=0.08, tail_r=0.014,
        eye_r=0.0119, tongue=False,
        growth=dict(body=1.0, legs=1.0, head=0.8, muzzle=0.7, ears=0.35, tail=0.9),
        pattern="yorkie",
    ),
    "cat": dict(
        kind="cat", L=0.24, H=0.19, chest=(0.075, 0.10, 0.085), belly=(0.08, 0.12, 0.08),
        hip=(0.078, 0.09, 0.085), leg_r=0.0286, paw_r=0.0299, leg_x=0.05,
        neck_len=0.048, neck_ang=45, neck_r=0.0575,
        head_r=0.0792, muzzle_len=0.022, muzzle_r=0.03, muzzle_drop=0.008,
        ear="cat", ear_size=(0.04, 0.05), ear_spread=24,
        tail="cat", tail_len=0.30, tail_r=0.022,
        eye_r=0.017, tongue=False,
        growth=dict(body=1.0, legs=0.7, head=0.7, muzzle=0.35, ears=0.35, tail=1.0),
        pattern="tabby",
    ),
}


# ---------------------------------------------------------------- материалы

def materials():
    return dict(
        fur=mat("Fur", "#c8a27a", rough=0.9),
        eye=mat("Eye", "#120a06", rough=0.04, coat=1.0),
        iris_cat=mat("IrisCat", "#7fb04a", rough=0.15),
        iris_blue=mat("IrisBlue", "#6fb4e6", rough=0.15),
        pupil=mat("Pupil", "#050505", rough=0.1),
        glint=mat("Glint", "#ffffff", rough=0.2, emit="#ffffff", emit_strength=2.0),
        nose=mat("Nose", "#1b1514", rough=0.35, coat=0.4),
        nose_pink=mat("NosePink", "#d9868a", rough=0.4),
        tongue=mat("Tongue", "#e3707a", rough=0.35, coat=0.3),
        inner_ear=mat("InnerEar", "#e6a6a0", rough=0.6),
        nail=mat("Nail", "#2a2522", rough=0.3, coat=0.5),
        whisker=mat("Whisker", "#f4f1ea", rough=0.4),
    )


# ---------------------------------------------------------------- части тела

def build_torso(p, M, root):
    L, H = p["L"], p["H"]
    cx, cy, cz = p["chest"]
    bx, by, bz = p["belly"]
    hx, hy, hz = p["hip"]
    b = Blob()
    chest_y = -L / 2
    hip_y = L / 2
    b.ellipsoid((0, chest_y, H + 0.01), (cx, cy, cz), stiff=1.6)
    b.ellipsoid((0, 0, H + 0.005), (bx, max(by, L * 0.62), bz), stiff=1.4)
    b.ellipsoid((0, hip_y, H + 0.01), (hx, hy, hz), stiff=1.6)
    # грудь чуть вперёд и вниз — «киль»
    b.ellipsoid((0, chest_y - cy * 0.45, H - cz * 0.25), (cx * 0.75, cy * 0.55, cz * 0.7), stiff=1.4)
    # лопатки и бёдра — объём под ноги
    for s in (-1, 1):
        b.ellipsoid((s * p["leg_x"] * 0.9, chest_y + 0.01, H - cz * 0.15),
                    (p["leg_r"] * 1.4, p["leg_r"] * 1.8, cz * 0.75), stiff=1.2)
        b.ellipsoid((s * p["leg_x"] * 0.9, hip_y + 0.005, H - hz * 0.15),
                    (p["leg_r"] * 1.6, hy * 0.8, hz * 0.85), stiff=1.2)
    # шея
    a = math.radians(p["neck_ang"])
    neck_base = Vector((0, chest_y - cy * 0.35, H + cz * 0.45))
    head_joint = neck_base + Vector((0, -math.sin(a), math.cos(a))) * p["neck_len"]
    b.capsule(neck_base, head_joint, p["neck_r"], stiff=1.6)
    b.ball(head_joint + Vector((0, 0.01, -0.01)), p["neck_r"] * 0.95, stiff=1.4)
    size = max(L + cy + hy, H)
    torso = b.build("Fur_Body", origin=(0, 0, 0), resolution=size / 60, voxel=size / 55,
                    material=M["fur"], parent=root)
    return torso, head_joint, neck_base


def build_leg(p, M, root, name, top, front):
    r, pr = p["leg_r"], p["paw_r"]
    leg = empty(name.replace("Fur_", "") + "_Pivot", root, top)
    b = Blob()
    t = Vector(top)
    H = t.z
    if front:
        knee = t + Vector((0, -0.006, -H * 0.5))
        ankle = Vector((t.x, t.y - 0.01, pr * 1.1))
        b.capsule(t + Vector((0, 0, -r)), knee, r * 1.25, stiff=1.5)
        b.capsule(knee, ankle, r, stiff=1.5)
    else:
        thigh = t + Vector((0, 0.012, -H * 0.18))
        hock = Vector((t.x, t.y + H * 0.22, H * 0.32))
        ankle = Vector((t.x, t.y + 0.012, pr * 1.1))
        b.ellipsoid(thigh, (r * 1.45, r * 2.0, H * 0.3), stiff=1.4)
        b.capsule(thigh, hock, r * 1.15, stiff=1.5)
        b.capsule(hock, ankle, r * 0.95, stiff=1.5)
    paw = Vector((t.x, ankle.y - pr * 0.45, pr * 0.62))
    b.ellipsoid(paw, (pr * 1.0, pr * 1.35, pr * 0.7), stiff=1.6)
    if p.get("short_legs"):
        b.ball(ankle + Vector((0, 0, pr * 0.4)), r * 1.15, stiff=1.4)
    size = max(H, 0.12)
    mesh = b.build(name, origin=top, resolution=size / 34, voxel=size / 32, material=M["fur"])
    mesh.parent = leg
    mesh.location = (0, 0, 0)
    # когти — 3 штуки на лапу, отдельные объекты для стрижки
    nails = empty("Nails_" + name[-2:], leg, (paw.x - t.x, paw.y - t.y - pr * 1.15, paw.z - t.z - pr * 0.42))
    for i, dx in enumerate((-0.55, 0.0, 0.55)):
        n = prim("cone", f"Nail_{name[-2:]}_{i}", (pr * 0.32, pr * 0.32, pr * 0.55),
                 loc=(dx * pr * 0.75, 0, 0), rot=(110, 0, 0), material=M["nail"], parent=nails,
                 segments=10)
        n.location = (dx * pr * 0.75, -pr * 0.05, 0)
    return leg, mesh


def ear_mesh(p, M, parent, side, base, kind):
    w, h = p["ear_size"]
    pivot = empty(f"Ear{'L' if side < 0 else 'R'}_Pivot", parent, base)
    spread = math.radians(p["ear_spread"]) * side
    if kind in ("pointy", "cat"):
        segs = 28
        ear = prim("sphere", f"Fur_Ear{'L' if side < 0 else 'R'}", (w, w * 0.35, h),
                   segments=segs, rings=18, material=M["fur"], parent=pivot)
        me = ear.data
        for v in me.vertices:
            z = max(0.0, v.co.z / h + 0.5)            # 0 у основания, 1 у кончика
            taper = max(0.02, 1 - z ** (1.4 if kind == "pointy" else 1.1))
            v.co.x *= taper
            v.co.y *= max(0.25, taper)
            v.co.y -= (v.co.x / w) ** 2 * w * 0.35    # чашечка
            v.co.y += z * z * h * 0.12                # кончик назад
            v.co.z += h * 0.5
        me.update()
        ear.location = (0, 0, 0)
        pivot.rotation_euler = (math.radians(-12), spread * 0.25, -spread)
        inner = prim("sphere", f"EarInner{'L' if side < 0 else 'R'}", (w * 0.72, w * 0.12, h * 0.82),
                     segments=20, rings=12, material=M["inner_ear"], parent=pivot)
        for v in inner.data.vertices:
            z = max(0.0, v.co.z / (h * 0.82) + 0.5)
            taper = max(0.02, 1 - z ** 1.4)
            v.co.x *= taper
            v.co.y -= (v.co.x / w) ** 2 * w * 0.35 + w * 0.06
            v.co.y += z * z * h * 0.1
            v.co.z += h * 0.44
        inner.data.update()
        inner.location = (0, -w * 0.02, h * 0.04)
        return pivot, ear
    # висячее ухо (пудель)
    b = Blob()
    b.ellipsoid((0, 0, -h * 0.45), (w * 0.45, w * 0.8, h * 0.55), stiff=1.5)
    b.ball((0, 0.0, -h * 0.05), w * 0.5, stiff=1.2)
    ear = b.build(f"Fur_Ear{'L' if side < 0 else 'R'}", origin=(0, 0, 0), resolution=h / 22,
                  voxel=h / 20, material=M["fur"])
    ear.parent = pivot
    ear.location = (0, 0, 0)
    pivot.rotation_euler = (0, 0, 0)
    pivot.rotation_euler.y = math.radians(-12) * side
    return pivot, ear


def build_head(p, M, root, joint):
    hr = p["head_r"]
    head = empty("Head", root, joint)
    skull = Vector(joint) + Vector((0, -hr * 0.45, hr * 0.62))
    b = Blob()
    cat = p["kind"] == "cat"
    b.ellipsoid(skull, (hr * (1.02 if cat else 0.92), hr * 0.95, hr * 0.88), stiff=1.8)
    # щёки
    for s in (-1, 1):
        b.ball(skull + Vector((s * hr * 0.42, -hr * 0.42, -hr * 0.3)), hr * (0.5 if cat else 0.42), stiff=1.3)
    # морда
    ml, mr, drop = p["muzzle_len"], p["muzzle_r"], p["muzzle_drop"]
    m0 = skull + Vector((0, -hr * 0.62, -hr * 0.28))
    m1 = m0 + Vector((0, -ml, -drop))
    b.capsule(m0, m1, mr, stiff=1.7)
    b.ellipsoid(m1 + Vector((0, mr * 0.15, -mr * 0.55)), (mr * 0.8, mr * 1.1, mr * 0.55), stiff=1.4)  # подбородок
    if cat:
        for s in (-1, 1):
            b.ball(m1 + Vector((s * mr * 0.55, mr * 0.2, -mr * 0.15)), mr * 0.72, stiff=1.6)  # вибриссовые подушечки
    # надбровья
    for s in (-1, 1):
        b.ball(skull + Vector((s * hr * 0.38, -hr * 0.62, hr * 0.28)), hr * 0.3, stiff=1.0)
    size = hr * 2 + ml
    fur = b.build("Fur_Head", origin=joint, resolution=size / 48, voxel=size / 46,
                  material=M["fur"])
    fur.parent = head
    fur.location = (0, 0, 0)

    # Черты лица ставим на реальную поверхность головы рейкастом из центра черепа:
    # метаболы «усаживаются», и заранее рассчитанные координаты промахиваются.
    J = Vector(joint)
    bpy.context.view_layer.update()

    def surf(origin_w, d):
        d = Vector(d).normalized()
        ok, loc, nrm, _ = fur.ray_cast(origin_w - J, d)
        if not ok:
            return origin_w + d * hr, d
        return loc + J, nrm.normalized()

    def orient(obj, d):
        obj.rotation_mode = "QUATERNION"
        obj.rotation_quaternion = Vector(d).to_track_quat("-Y", "Z")

    # глаза
    er = p["eye_r"]
    eyes = []
    for s in (-1, 1):
        nm = "L" if s < 0 else "R"
        d = Vector((s * (0.62 if cat else 0.5), -1, 0.22 if cat else 0.3)).normalized()
        hit, _ = surf(skull + Vector((0, 0, hr * 0.05)), d)
        ey = hit - d * er * (0.62 if cat else 0.72)
        look = (d + Vector((0, -1.2, 0))).normalized()
        iris = M["iris_cat"] if cat else (M["iris_blue"] if p["pattern"] == "husky" else M["eye"])
        prim("sphere", f"Eye_{nm}", (er * 2, er * 2, er * 2), loc=ey - J, material=iris, parent=head,
             segments=24, rings=16)
        if cat:
            pu = prim("sphere", f"Pupil_{nm}", (er * 0.45, er * 0.3, er * 1.45), loc=ey + look * er * 0.86 - J,
                      material=M["pupil"], parent=head, segments=16, rings=10)
        else:
            pu = prim("sphere", f"Pupil_{nm}", (er * 1.15, er * 0.45, er * 1.15), loc=ey + look * er * 0.8 - J,
                      material=M["pupil"], parent=head, segments=16, rings=10)
        orient(pu, look)
        side = Vector((0, 0, 1)).cross(look).normalized()
        gl = (look + Vector((0, 0, 0.55)) + side * 0.35).normalized()
        prim("sphere", f"Glint_{nm}", (er * 0.4, er * 0.4, er * 0.4), loc=ey + gl * er * 0.98 - J,
             material=M["glint"], parent=head, segments=10, rings=6)
        eyes.append(ey)

    # нос
    nd = Vector((0, -1, 0.3)).normalized()
    nhit, _ = surf(m1 + Vector((0, mr * 0.5, 0)), nd)
    if cat:
        nose_pos = nhit + nd * mr * 0.05
        n = prim("sphere", "Nose", (mr * 0.62, mr * 0.42, mr * 0.4), loc=nose_pos - J,
                 material=M["nose_pink"], parent=head, segments=16, rings=10)
        for v in n.data.vertices:  # треугольный кошачий нос
            v.co.x *= 1.0 - max(0.0, -v.co.z / (mr * 0.2)) * 0.55
        n.data.update()
    else:
        nose_pos = nhit + nd * mr * 0.2
        n = prim("sphere", "Nose", (mr * 1.25, mr * 0.9, mr * 0.85), loc=nose_pos - J, material=M["nose"],
                 parent=head, segments=20, rings=12)
        for v in n.data.vertices:
            v.co.z *= 1.0 + (0.25 if v.co.z > 0 else 0)
            if v.co.z < 0:
                v.co.x *= 0.82
        n.data.update()
        for s in (-1, 1):  # ноздри
            prim("sphere", f"Nostril_{'L' if s < 0 else 'R'}", (mr * 0.24, mr * 0.18, mr * 0.13),
                 loc=nose_pos + Vector((s * mr * 0.26, -mr * 0.4, -mr * 0.04)) - J, material=M["pupil"],
                 parent=head, segments=8, rings=6)
    if p.get("tongue"):
        thit, _ = surf(m1 + Vector((0, mr * 0.3, 0)), (0, -0.55, -1))
        prim("sphere", "Tongue", (mr * 0.95, mr * 1.25, mr * 0.28),
             loc=thit + Vector((0, -mr * 0.1, mr * 0.12)) - J, rot=(-28, 0, 0), material=M["tongue"],
             parent=head, segments=16, rings=10)
    if cat:
        from common import tube
        for s in (-1, 1):
            for k, ang in enumerate((-10, 0, 10)):
                base, _ = surf(m1 + Vector((0, mr * 0.3, 0)), (s * 0.9, -0.6, -0.05 + k * 0.08))
                pts = []
                for i in range(6):
                    tt = i / 5
                    pts.append(base + Vector((s * tt * 0.08, -tt * 0.012, math.radians(ang) * tt * 0.08 - tt * tt * 0.012)))
                tube(f"Whisker_{'L' if s < 0 else 'R'}{k}", [q - J for q in pts], 0.0008,
                     material=M["whisker"], parent=head, sides=4, radius_end=0.0002)
    # уши
    ears = []
    for s in (-1, 1):
        if p["ear"] in ("pointy", "cat"):
            ed = Vector((s * (0.62 if cat else 0.55), 0.12, 1)).normalized()
            hit, _ = surf(skull, ed)
            base = hit - ed * p["ear_size"][0] * 0.35 - J
        else:
            ed = Vector((s, 0.1, 0.35)).normalized()
            hit, _ = surf(skull, ed)
            base = hit - ed * p["ear_size"][0] * 0.3 - J
        pv, e = ear_mesh(p, M, head, s, base, p["ear"])
        ears.append(e)
    return head, fur, ears, dict(eyes=eyes, nose=nose_pos, skull=skull, muzzle=(m0, m1))


def tail_points(p):
    n = 9
    L = p["tail_len"]
    kind = p["tail"]
    pts = []
    for i in range(n):
        t = i / (n - 1)
        if kind == "stub":
            pts.append(Vector((0, t * L, t * L * 0.3)))
        elif kind == "up":
            pts.append(Vector((0, t * L * 0.35, t * L * 0.95)))
        elif kind == "sickle":
            a = t * math.radians(130)
            pts.append(Vector((0, math.sin(a) * L * 0.42 + t * L * 0.15, (1 - math.cos(a)) * L * 0.35 + t * L * 0.2)))
        elif kind == "curl":
            a = t * math.radians(250)
            r = L * 0.42
            pts.append(Vector((math.sin(t * math.pi) * L * 0.08, math.sin(a) * r * 0.9, (1 - math.cos(a)) * r)))
        elif kind == "cat":
            pts.append(Vector((math.sin(t * 2.2) * L * 0.08, t * L * 0.6, math.sin(t * math.pi * 0.85) * L * 0.55 + t * L * 0.1)))
    return pts


def build_tail(p, M, root, base):
    pivot = empty("Tail_Pivot", root, base)
    pts = [Vector(base) + q for q in tail_points(p)]
    n = len(pts)
    r = p["tail_r"]
    radii = [r * (1.0 - 0.55 * i / (n - 1)) for i in range(n)]
    b = Blob()
    if p["tail"] == "stub":
        b.ellipsoid(Vector(base) + Vector((0, p["tail_len"] * 0.4, 0)), (r * 1.1, r * 1.0, r * 0.95))
    else:
        b.chain(pts, radii, stiff=1.6)
        if p["tail"] == "up":  # помпон пуделя
            b.ball(pts[-1], r * 2.6, stiff=1.8)
    size = p["tail_len"] + r * 4
    mesh = b.build("Fur_Tail", origin=base, resolution=size / 40, voxel=size / 38, material=M["fur"])
    mesh.parent = pivot
    mesh.location = (0, 0, 0)
    return pivot, mesh


# ---------------------------------------------------------------- маски

def pattern_fn(p, part, info):
    pat = p["pattern"]
    g = p["growth"]
    H, L = p["H"], p["L"]
    cz = p["chest"][2]
    hr = p["head_r"]
    eyes = info["eyes"]
    nose = info["nose"]
    skull = info["skull"]
    m0, m1 = info["muzzle"]

    def head_growth(w):
        gr = g["head"]
        # морда — коротко
        dm = (w - (m0 + m1) / 2).length
        gr = lerp(g["muzzle"], gr, smooth(p["muzzle_r"] * 1.1, p["muzzle_r"] * 2.2 + hr * 0.2, dm))
        for e in eyes:
            gr *= smooth(p["eye_r"] * 1.05, p["eye_r"] * 2.4, (w - e).length)
        gr *= smooth(p["muzzle_r"] * 0.7, p["muzzle_r"] * 1.6, (w - nose).length)
        return gr

    def fn(w, loc):
        sec = dark = 0.0
        if part == "body":
            gr = g["body"]
            # грива у шеи у шпица
            if pat == "spitz":
                gr = min(1.0, gr * (1.0 + 0.4 * smooth(0, -L * 0.7, w.y)))
            gr *= lerp(0.75, 1.0, smooth(H - cz * 0.9, H - cz * 0.2, w.z))
        elif part == "legs":
            gr = g["legs"] * lerp(0.55, 1.0, smooth(0.0, H * 0.6, w.z))
        elif part == "tail":
            gr = g["tail"]
        elif part == "ears":
            gr = g["ears"]
        else:
            gr = head_growth(w)

        belly = smooth(H - cz * 0.15, H - cz * 0.75, w.z)
        chest_front = smooth(-L / 2 - p["chest"][1] * 0.2, -L / 2 - p["chest"][1] * 0.8, w.y)
        low_leg = smooth(H * 0.45, H * 0.2, w.z)
        if pat == "corgi":
            if part == "body":
                sec = max(belly, chest_front * smooth(H + cz * 0.5, H, w.z))
            elif part == "legs":
                sec = max(low_leg, 0.35 * belly)
            elif part == "head":
                face_low = smooth(skull.z - hr * 0.1, skull.z - hr * 0.5, w.z) * smooth(skull.y - hr * 0.2, skull.y - hr * 0.7, w.y)
                blaze = smooth(hr * 0.12, hr * 0.04, abs(w.x)) * smooth(skull.y - hr * 0.3, skull.y - hr * 0.8, w.y)
                sec = max(face_low, blaze)
            elif part == "tail":
                sec = 0.0
        elif pat == "husky":
            if part == "body":
                sec = max(belly, chest_front * 0.9)
                dark = smooth(H + cz * 0.4, H + cz * 0.95, w.z) * (1 - chest_front)
            elif part == "legs":
                sec = smooth(H * 0.95, H * 0.6, w.z)
            elif part == "head":
                face = smooth(skull.z + hr * 0.15, skull.z - hr * 0.25, w.z)
                brows = 0.0
                for e in eyes:
                    brows = max(brows, smooth(p["eye_r"] * 2.2, p["eye_r"] * 1.2, (w - (e + Vector((0, 0, p["eye_r"] * 1.8)))).length))
                cheeks = smooth(hr * 0.25, hr * 0.6, abs(w.x)) * smooth(skull.z + hr * 0.2, skull.z - hr * 0.1, w.z)
                sec = max(face, brows, cheeks)
                stripe = smooth(hr * 0.07, hr * 0.03, abs(w.x)) * smooth(skull.z - hr * 0.1, skull.z + hr * 0.3, w.z)
                sec *= 1 - stripe
                dark = smooth(skull.z + hr * 0.2, skull.z + hr * 0.8, w.z) * (1 - brows)
            elif part == "ears":
                dark = 0.6
            elif part == "tail":
                sec = smooth(0.0, -0.02, loc.z - (0.0)) * 0.0
                dark = 0.35
        elif pat == "spitz":
            if part == "body":
                sec = 0.6 * max(belly, chest_front)
            elif part == "legs":
                sec = 0.5 * low_leg
            elif part == "head":
                sec = 0.35 * smooth(skull.z, skull.z - hr * 0.6, w.z)
            elif part == "tail":
                sec = 0.3
        elif pat == "yorkie":
            # тело стальное (тёмный), голова и лапы рыжие (основной)
            if part == "body":
                dark = smooth(H - cz * 0.6, H + cz * 0.2, w.z) * (1 - chest_front * 0.7)
            elif part == "legs":
                dark = smooth(H * 0.85, H * 1.05, w.z)
            elif part == "tail":
                dark = 1.0
            elif part == "ears":
                dark = 0.3
        elif pat == "tabby":
            stripes = 0.5 + 0.5 * math.sin(w.y * 120 + math.sin(w.z * 40) * 1.5)
            stripes = smooth(0.55, 0.85, stripes)
            if part == "body":
                sec = belly * 0.9 + chest_front * 0.5
                dark = stripes * (1 - belly)
            elif part == "legs":
                dark = smooth(0.5, 0.9, 0.5 + 0.5 * math.sin(w.z * 140)) * 0.8
                sec = 0.6 * low_leg
            elif part == "tail":
                dark = smooth(0.45, 0.8, 0.5 + 0.5 * math.sin((w - Vector((0, 0, 0))).length * 110))
            elif part == "head":
                m = smooth(skull.z + hr * 0.15, skull.z + hr * 0.6, w.z)
                lines = smooth(0.6, 0.9, 0.5 + 0.5 * math.sin(w.x * 220))
                dark = m * lines
                sec = smooth(skull.z - hr * 0.1, skull.z - hr * 0.5, w.z) * 0.9
        return (min(1, sec), min(1, dark), max(0.0, min(1.0, gr)))

    return fn


# ---------------------------------------------------------------- сборка

def build_pet(breed):
    p = BREEDS[breed]
    reset()
    M = materials()
    root = empty("Pet")
    root["breed"] = breed
    torso, joint, neck_base = build_torso(p, M, root)
    head, head_fur, ears, info = build_head(p, M, root, joint)
    H, L = p["H"], p["L"]
    legs = []
    fy = -L / 2 + 0.01
    by = L / 2 + 0.0
    for nm, x, y, front in (("FL", -p["leg_x"], fy, True), ("FR", p["leg_x"], fy, True),
                            ("BL", -p["leg_x"], by, False), ("BR", p["leg_x"], by, False)):
        pv, mesh = build_leg(p, M, root, f"Fur_Leg{nm}", (x, y, H - p["chest"][2] * 0.1), front)
        legs.append(mesh)
    tail_base = (0, L / 2 + p["hip"][1] * 0.85, H + p["hip"][2] * 0.45)
    tail_pivot, tail = build_tail(p, M, root, tail_base)

    # маски цвета и роста шерсти
    paint_vertices(torso, pattern_fn(p, "body", info))
    paint_vertices(head_fur, pattern_fn(p, "head", info))
    for e in ears:
        paint_vertices(e, pattern_fn(p, "ears", info))
    for lg in legs:
        paint_vertices(lg, pattern_fn(p, "legs", info))
    paint_vertices(tail, pattern_fn(p, "tail", info))

    # передняя поверхность стоячих ушей без шерсти — видно розовое ухо
    if p["ear"] in ("pointy", "cat"):
        for e in ears:
            attr = e.data.color_attributes["Color"]
            for v in e.data.vertices:
                c = attr.data[v.index].color
                f = smooth(-0.1, 0.4, v.normal.y)
                attr.data[v.index].color = (c[0], c[1], c[2] * f, 1)

    root["height"] = max(world_pos(head).z + p["head_r"] * 1.6, H + p["chest"][2])
    print(f"[{breed}] verts: body {len(torso.data.vertices)}, head {len(head_fur.data.vertices)}, "
          f"leg {len(legs[0].data.vertices)}, tail {len(tail.data.vertices)}, ear {len(ears[0].data.vertices)}")
    return root


def build_all(preview_dir=None):
    for breed in BREEDS:
        build_pet(breed)
        export(f"pet_{breed}.glb")
        if preview_dir:
            from common import preview
            p = BREEDS[breed]
            preview(f"{preview_dir}/pet_{breed}.png", target=(0, 0, p["H"]), dist=p["L"] * 3 + 0.6)


if __name__ == "__main__":
    import sys
    build_all(sys.argv[sys.argv.index("--preview") + 1] if "--preview" in sys.argv else None)
