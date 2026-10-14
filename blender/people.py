"""Персонажи (владельцы питомцев, наставница, соперник) — people.glb.

Стилизованные «тиби»-пропорции: крупная голова, мягкие формы. Каждый
персонаж — узел верхнего уровня с опорными точками Head, ArmL/ArmR,
LegL/LegR, чтобы игра анимировала ходьбу и жесты.
"""
import os as _os
import sys as _sys

_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))

import math

import bpy  # noqa: F401
from mathutils import Vector

from common import Blob, empty, export, mat, reset, torus, tube
from common import prim as _prim


def prim(*a, **kw):
    kw.setdefault("segments", 18)
    kw.setdefault("rings", 10)
    return _prim(*a, **kw)

SKIN = {"light": "#f6d2bd", "fair": "#efc3a4", "tan": "#d9a47e", "brown": "#a8714f", "dark": "#7a4b33"}

CHARACTERS = {
    # наставница
    "tamara": dict(skin="fair", top="#8c3b4a", bottom="#3f3a4a", shoes="#2b2525", hair="#d9d4cf", hair_style="bun",
                   glasses="#6b4a2f", body="woman", age="old", scarf="#e8b04a"),
    # постоянные клиенты
    "zina": dict(skin="light", top="#8d6ad1", bottom="#5a4e7a", shoes="#5b3b2b", hair="#f2efe9", hair_style="curly",
                 glasses="#c9a227", body="woman", age="old", bag="#c0475d"),
    "timur": dict(skin="tan", top="#3f9b6a", bottom="#3a5a8c", shoes="#f2f2f2", hair="#2b1d16", hair_style="cap",
                  cap="#e0504f", body="man", hood=True),
    "liza": dict(skin="light", top="#ff86b0", bottom="#f7f3f6", shoes="#ffffff", hair="#f4d27a", hair_style="ponytail",
                 body="woman", phone=True),
    "arkady": dict(skin="fair", top="#7a5b3e", bottom="#4a4036", shoes="#3a2a20", hair="#bdbab5", hair_style="bald",
                   beard="#c9c6c0", glasses="#2b2b2b", body="man", age="old", bowtie="#c0392b"),
    "irina": dict(skin="fair", top="#ffcd3c", bottom="#3a4a6a", shoes="#a0522d", hair="#7a4a2a", hair_style="bob",
                  body="woman"),
    # соперник
    "viktor": dict(skin="fair", top="#5b2a86", bottom="#2c1d40", shoes="#111111", hair="#141414", hair_style="slick",
                   glasses="#111111", sunglasses=True, body="man", chain="#f2c14e"),
    # судья чемпионата
    "judge": dict(skin="tan", top="#1f2430", bottom="#1f2430", shoes="#111111", hair="#c8452c", hair_style="bun",
                  glasses="#c9a227", body="woman", scarf="#f2c14e"),
    # случайные посетители
    "walk1": dict(skin="light", top="#3d7bd9", bottom="#2d2d38", shoes="#5b3b2b", hair="#6b4423", hair_style="short",
                  body="man"),
    "walk2": dict(skin="brown", top="#2fa37e", bottom="#c8b48a", shoes="#2b2b2b", hair="#121212", hair_style="long",
                  body="woman"),
    "walk3": dict(skin="tan", top="#ff8a3d", bottom="#4b5563", shoes="#1f2937", hair="#3a2a1a", hair_style="bald",
                  beard="#3a2a1a", body="man"),
    "walk4": dict(skin="fair", top="#21a3b8", bottom="#21a3b8", shoes="#e8e8e8", hair="#b8432f", hair_style="curly",
                  body="woman", dress=True),
    "walk5": dict(skin="dark", top="#e8e2d0", bottom="#6a4c93", shoes="#e0504f", hair="#121212", hair_style="afro",
                  body="woman"),
    "walk6": dict(skin="light", top="#9aa5b1", bottom="#334155", shoes="#111827", hair="#e6c27a", hair_style="short",
                  body="man", glasses="#333333"),
    # сотрудники салона (в фартуках)
    "emp1": dict(skin="fair", top="#ffffff", bottom="#2f3b52", shoes="#2b2b2b", hair="#3a2a1a", hair_style="ponytail",
                 body="woman", apron="#5fd0b5"),
    "emp2": dict(skin="tan", top="#f2e8da", bottom="#3a3a3a", shoes="#111111", hair="#141414", hair_style="short",
                 body="man", apron="#ff8fa3", beard="#141414"),
    "emp3": dict(skin="light", top="#e9f1ff", bottom="#4a3f6b", shoes="#ffffff", hair="#d9a066", hair_style="bob",
                 body="woman", apron="#8a6cf0", glasses="#8a6cf0"),
    "emp4": dict(skin="brown", top="#fff6e0", bottom="#2d2d38", shoes="#e0504f", hair="#121212", hair_style="mohawk",
                 body="man", apron="#ffc23d"),
    "emp5": dict(skin="dark", top="#ffe3ec", bottom="#3d2f3a", shoes="#5b3b2b", hair="#2a1a14", hair_style="afro",
                 body="woman", apron="#4aa3df"),
    "emp6": dict(skin="fair", top="#e8f6f0", bottom="#555b66", shoes="#2b2b2b", hair="#c8452c", hair_style="curly",
                 body="man", apron="#ff9248"),
}


def build_character(cid, c, root_name=None):
    skin = mat(c.get("skin_mat") or f"Skin_{c['skin']}", SKIN[c["skin"]], rough=0.6)
    top = mat(f"Top_{cid}", c["top"], rough=0.8)
    bottom = mat(f"Bottom_{cid}", c["bottom"], rough=0.85)
    shoes = mat(f"Shoes_{cid}", c["shoes"], rough=0.45)
    hair = mat(f"Hair_{cid}", c["hair"], rough=0.7)
    eye = mat("PEye", "#1b1410", rough=0.1, coat=1)
    white = mat("PWhite", "#ffffff", rough=0.2, emit="#ffffff", emit_strength=1.5)
    blush = mat("Blush", "#ff9e9e", rough=0.8, alpha=0.6)
    mouth = mat("Mouth", "#7a3540", rough=0.5)
    woman = c["body"] == "woman"
    old = c.get("age") == "old"

    root = empty(root_name or f"Person_{cid}")
    hip_z = 0.78
    sh_z = 1.28 if not old else 1.24
    sh_w = 0.2 if woman else 0.23
    # туловище
    b = Blob()
    b.ellipsoid((0, 0, sh_z - 0.16), (sh_w * 0.95, 0.13, 0.2), stiff=1.6)
    b.ellipsoid((0, 0, hip_z + 0.12), ((0.19 if woman else 0.17), 0.13, 0.17), stiff=1.6)
    b.capsule((-sh_w + 0.04, 0, sh_z - 0.04), (sh_w - 0.04, 0, sh_z - 0.04), 0.08, stiff=1.5)
    if old:
        b.ellipsoid((0, 0.04, sh_z - 0.05), (0.14, 0.1, 0.1), stiff=1.2)  # сутулость
    if c.get("dress"):
        b.ellipsoid((0, 0, hip_z - 0.06), (0.26, 0.2, 0.22), stiff=1.4)
    b.ellipsoid((0, 0, (sh_z + hip_z) / 2 + 0.02), (sh_w * 0.85, 0.125, 0.2), stiff=1.4)  # талия
    torso = b.build("Torso", resolution=0.03, voxel=0.028, material=top)
    torso.parent = root
    cyl_neck = prim("cyl", "Neck", (0.09, 0.09, 0.1), loc=(0, 0, sh_z + 0.03), material=skin, parent=root, segments=16)
    # голова
    head = empty("Head", root, (0, 0, sh_z + 0.05))
    head.scale = (1.45, 1.45, 1.45)
    hr = 0.15
    hb = Blob()
    hb.ellipsoid((0, 0, hr), (hr * 0.92, hr * 0.9, hr * 1.0), stiff=2)
    hb.ellipsoid((0, -0.03, hr * 0.6), (hr * 0.8, hr * 0.78, hr * 0.7), stiff=1.5)  # щёки/челюсть
    face = hb.build("Face", origin=(0, 0, 0), resolution=0.016, voxel=0.015, material=skin)
    face.parent = head
    face.location = (0, 0, 0)
    for s in (-1, 1):
        nm = "L" if s < 0 else "R"
        ex, ez = s * 0.055, hr * 1.02
        prim("sphere", f"Eye{nm}", (0.034, 0.02, 0.042), loc=(ex, -hr * 0.84, ez), material=eye, parent=head)
        prim("sphere", f"EyeGlint{nm}", (0.011, 0.006, 0.011), loc=(ex - 0.008, -hr * 0.9, ez + 0.01), material=white,
             parent=head)
        prim("sphere", f"Blush{nm}", (0.04, 0.01, 0.022), loc=(s * 0.085, -hr * 0.78, hr * 0.78), material=blush,
             parent=head)
        brow = tube(f"Brow{nm}", [(ex - 0.02, -hr * 0.86, ez + 0.045), (ex, -hr * 0.88, ez + 0.052 + (0.004 if old else 0)),
                                  (ex + 0.02, -hr * 0.86, ez + 0.046)], 0.0055, hair, head, sides=6)
        prim("sphere", f"Ear{nm}", (0.03, 0.05, 0.06), loc=(s * hr * 0.9, 0, hr * 0.95), material=skin, parent=head)
    prim("sphere", "Nose", (0.03, 0.03, 0.03), loc=(0, -hr * 0.93, hr * 0.85), material=skin, parent=head)
    smile = []
    for i in range(9):
        t = (i / 8 - 0.5) * 2.2
        smile.append((math.sin(t) * 0.03, -hr * 0.86 - (1 - math.cos(t)) * 0.004, hr * 0.66 - math.cos(t) * 0.014))
    tube("Smile", smile, 0.0045, mouth, head, sides=6)

    # причёски и аксессуары головы
    make_hair(c["hair_style"], hair, head, hr)
    if c["hair_style"] == "cap" or c.get("cap_on"):
        make_cap(mat(f"Cap_{cid}", c["cap"], rough=0.6), head, hr)
    if c.get("beard"):
        make_beard(mat(f"Beard_{cid}", c["beard"], rough=0.8), head, hr)
    if c.get("glasses"):
        make_glasses(mat(f"Glasses_{cid}", c["glasses"], rough=0.25, metal=0.5), head, hr, c.get("sunglasses"))
    # шея / аксессуары
    if c.get("scarf"):
        torus("Scarf", 0.07, 0.035, (0, 0, sh_z + 0.02), (0, 0, 0), mat(f"Scarf_{cid}", c["scarf"], rough=0.9), root,
              seg=28, rings=10)
    if c.get("bowtie"):
        bt = mat(f"Bow_{cid}", c["bowtie"], rough=0.5)
        for s in (-1, 1):
            prim("cone", f"Bow{s}", (0.05, 0.03, 0.045), loc=(s * 0.022, -0.11, sh_z - 0.01), rot=(0, s * 90, 0),
                 material=bt, parent=root, segments=12)
    if c.get("chain"):
        torus("Chain", 0.1, 0.008, (0, -0.06, sh_z - 0.08), (70, 0, 0), mat("Gold", c["chain"], rough=0.2, metal=1),
              root, seg=32, rings=6)
    if c.get("hood"):
        torus("Hood", 0.11, 0.045, (0, 0.04, sh_z + 0.01), (-15, 0, 0), top, root, seg=28, rings=10)
    if c.get("apron"):
        make_apron(mat(f"Apron_{cid}", c["apron"], rough=0.75), root, sh_z, hip_z, sh_w)

    # руки
    for s in (-1, 1):
        nm = "L" if s < 0 else "R"
        arm = empty(f"Arm{nm}", root, (s * sh_w, 0, sh_z - 0.04))
        tube(f"Sleeve{nm}", [(0, 0, 0), (s * 0.03, 0, -0.18), (s * 0.04, -0.01, -0.36)], 0.055, top, arm, sides=14,
             radius_end=0.045)
        prim("sphere", f"Hand{nm}", (0.085, 0.07, 0.1), loc=(s * 0.045, -0.01, -0.42), material=skin, parent=arm)
        if c.get("phone") and s > 0:
            prim("cube", "Phone", (0.05, 0.012, 0.09), loc=(s * 0.05, -0.05, -0.42), material=mat("PhoneCase", "#222222", 0.3),
                 parent=arm, bevel=0.006)
        if c.get("bag") and s < 0:
            bag = mat(f"Bag_{cid}", c["bag"], rough=0.5)
            prim("cube", "Bag", (0.2, 0.08, 0.16), loc=(s * 0.06, 0, -0.56), material=bag, parent=arm, bevel=0.025)
            torus("BagStrap", 0.06, 0.007, (s * 0.06, 0, -0.47), (90, 0, 90), bag, arm, seg=16, rings=6, arc=180)
    # ноги
    for s in (-1, 1):
        nm = "L" if s < 0 else "R"
        leg = empty(f"Leg{nm}", root, (s * 0.085, 0, hip_z))
        if c.get("dress"):
            tube(f"Pants{nm}", [(0, 0, -0.1), (0, 0, -0.68)], 0.045, skin, leg, sides=14)
        else:
            tube(f"Pants{nm}", [(0, 0, 0.05), (0, 0, -0.35), (0, 0, -0.68)], 0.075, bottom, leg, sides=16, radius_end=0.062)
        shoe = prim("sphere", f"Shoe{nm}", (0.11, 0.2, 0.09), loc=(0, -0.04, -0.72), material=shoes, parent=leg)
        for v in shoe.data.vertices:
            if v.co.z < -0.01:
                v.co.z = -0.01 - (v.co.z + 0.01) * 0.2
        shoe.data.update()
    return root


def make_hair(hs, hair, head, hr, name="Hair"):
    """Причёска как отдельный меш в системе координат головы."""
    hbl = Blob()
    if hs not in ("bald", "none", "cap"):
        hbl.ellipsoid((0, 0.02, hr * 1.25), (hr * 0.98, hr * 0.97, hr * 0.85), stiff=2)
        # открываем лицо отрицательным элементом
        hbl.ellipsoid((0, -hr * 0.9, hr * 0.9), (hr * 0.75, hr * 0.5, hr * 0.5), stiff=3, neg=True)
    if hs == "cap":
        hbl.ellipsoid((0, 0.04, hr * 1.1), (hr * 0.95, hr * 0.9, hr * 0.6), stiff=2)
        hbl.ellipsoid((0, -hr * 0.9, hr * 0.9), (hr * 0.75, hr * 0.5, hr * 0.5), stiff=3, neg=True)
    if hs == "bun":
        hbl.ball((0, hr * 0.55, hr * 1.85), 0.075, stiff=2)
    elif hs == "curly":
        for i in range(14):
            a = i / 14 * 2 * math.pi
            hbl.ball((math.cos(a) * hr * 0.85, math.sin(a) * hr * 0.8 + 0.02, hr * 1.25 + math.sin(a * 3) * 0.02), 0.06, stiff=2)
        hbl.ball((0, 0.02, hr * 1.75), 0.09, stiff=2)
    elif hs == "ponytail":
        hbl.capsule((0, hr * 0.85, hr * 1.5), (0, hr * 1.35, hr * 0.5), 0.05, stiff=2)
        hbl.ball((0, hr * 1.4, hr * 0.35), 0.055, stiff=2)
    elif hs == "bob":
        for s in (-1, 1):
            hbl.ellipsoid((s * hr * 0.82, 0.02, hr * 0.85), (0.06, 0.12, 0.14), stiff=2)
        hbl.ellipsoid((0, hr * 0.5, hr * 0.85), (0.14, 0.08, 0.14), stiff=2)
    elif hs == "long":
        for s in (-1, 1):
            hbl.capsule((s * hr * 0.82, 0.03, hr * 1.2), (s * hr * 0.75, 0.06, -hr * 0.6), 0.06, stiff=2)
        hbl.capsule((0, hr * 0.7, hr * 1.3), (0, hr * 0.75, -hr * 0.7), 0.12, stiff=2)
    elif hs == "slick":
        hbl.ellipsoid((0, -hr * 0.3, hr * 1.85), (hr * 0.8, hr * 0.5, 0.05), stiff=2)  # кок
    elif hs == "afro":
        hbl.ball((0, 0.02, hr * 1.4), hr * 1.35, stiff=2)
        hbl.ellipsoid((0, -hr * 1.1, hr * 0.9), (hr * 0.8, hr * 0.6, hr * 0.62), stiff=3, neg=True)
    elif hs == "short":
        hbl.ellipsoid((0, -hr * 0.5, hr * 1.7), (hr * 0.7, hr * 0.35, 0.05), stiff=2)
    elif hs == "mohawk":
        hbl.items = []
        for i in range(7):
            a = math.pi * (0.15 + 0.7 * i / 6)
            hbl.ellipsoid((0, -math.cos(a) * hr * 0.95, hr + math.sin(a) * hr * 0.95), (0.03, 0.05, 0.07), stiff=2)
    elif hs == "bald":
        # венчик волос вокруг затылка
        for i in range(9):
            a = math.pi * (0.1 + 0.8 * i / 8)
            hbl.ball((math.cos(a) * hr * 0.92, math.sin(a) * hr * 0.6 + 0.04, hr * 1.02), 0.04, stiff=2)
    if not hbl.items:
        return None
    hm = hbl.build(name, origin=(0, 0, 0), resolution=0.018, voxel=0.016, material=hair)
    hm.parent = head
    hm.location = (0, 0, 0)
    return hm


def make_cap(cap, head, hr):
    capm = prim("sphere", "Cap", (hr * 2.0, hr * 2.0, hr * 1.4), loc=(0, 0.0, hr * 1.25), material=cap, parent=head)
    for v in capm.data.vertices:
        if v.co.z < 0:
            v.co.z *= 0.1
    capm.data.update()
    prim("cyl", "Visor", (0.18, 0.14, 0.012), loc=(0, -hr * 0.95, hr * 1.25), rot=(10, 0, 0), material=cap, parent=head)


def make_beard(bm, head, hr):
    bb = Blob()
    bb.ellipsoid((0, -hr * 0.62, hr * 0.42), (hr * 0.72, hr * 0.45, hr * 0.45), stiff=2)
    bb.ellipsoid((0, -hr * 0.85, hr * 0.62), (hr * 0.3, hr * 0.2, hr * 0.15), stiff=2, neg=True)
    be = bb.build("Beard", origin=(0, 0, 0), resolution=0.016, voxel=0.015, material=bm)
    be.parent = head
    be.location = (0, 0, 0)
    return be


def make_glasses(gm, head, hr, sunglasses=False):
    lens = mat("Shades", "#111418", rough=0.05) if sunglasses else None
    for s in (-1, 1):
        torus(f"Rim{s}", 0.04, 0.005, (s * 0.058, -hr * 0.96, hr * 1.03), (90, 0, 0), gm, head, seg=20, rings=6)
        if lens:
            prim("cyl", f"Lens{s}", (0.08, 0.08, 0.005), loc=(s * 0.058, -hr * 0.97, hr * 1.03), rot=(90, 0, 0),
                 material=lens, parent=head)
    tube("Bridge", [(-0.02, -hr * 0.98, hr * 1.04), (0, -hr * 1.0, hr * 1.06), (0.02, -hr * 0.98, hr * 1.04)], 0.004, gm,
         head, sides=6)


def make_apron(am, root, sh_z, hip_z, sh_w):
    """Фартук грумера: нагрудник, юбка, карман и лямки."""
    bib = prim("cube", "ApronBib", (sh_w * 1.2, 0.02, 0.3), loc=(0, -0.135, sh_z - 0.2), material=am, parent=root,
               bevel=0.008)
    for v in bib.data.vertices:  # чуть выгнуть по груди
        v.co.y -= (1 - (v.co.x / (sh_w * 0.6)) ** 2) * 0.02
    bib.data.update()
    skirt = prim("cube", "ApronSkirt", (0.36, 0.02, 0.42), loc=(0, -0.145, hip_z + 0.0), material=am, parent=root,
                 bevel=0.01)
    for v in skirt.data.vertices:
        v.co.x *= 1 + max(0.0, -v.co.z) * 0.6
        v.co.y -= (1 - (v.co.x / 0.25) ** 2) * 0.025
    skirt.data.update()
    prim("cube", "ApronPocket", (0.2, 0.012, 0.09), loc=(0, -0.17, hip_z + 0.02), material=mat("ApronPocket", "#ffffff", 0.7),
         parent=root, bevel=0.006)
    for sgn in (-1, 1):
        tube(f"ApronStrap{sgn}", [(sgn * sh_w * 0.5, -0.13, sh_z - 0.06), (sgn * 0.08, -0.06, sh_z + 0.07), (0, 0.02, sh_z + 0.09)],
             0.012, am, root, sides=6)


def build():
    reset()
    for cid, c in CHARACTERS.items():
        build_character(cid, c)


if __name__ == "__main__":
    import sys
    build()
    export("people.glb")
    if "--preview" in sys.argv:
        from common import preview
        roots = [o for o in bpy.context.scene.objects if o.parent is None]
        for i, o in enumerate(roots):
            o.location = ((i % 7) * 0.75 - 2.25, (i // 7) * 1.2, 0)
        preview(sys.argv[sys.argv.index("--preview") + 1] + "/people.png", target=(0, 0.6, 0.9), dist=7.5, elev=12, azim=0, size=1000, samples=16)
