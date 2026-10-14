"""Мебель и реквизит салона — все в одном файле salon_props.glb.

Каждый предмет — пустышка верхнего уровня (имя = id предмета) с мешами
внутри; игра клонирует нужные узлы. Материалы с префиксом ``Accent``
перекрашиваются в фирменный цвет салона, ``Wood`` — в цвет дерева салона.
"""
import os as _os
import sys as _sys

_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))

import math
import random

import bpy  # noqa: F401
from mathutils import Vector

from common import apply_modifiers, empty, export, lathe, mat, prim, reset, torus, tube

R = random.Random(7)


def M():
    return dict(
        steel=mat("Steel", "#c9ced6", rough=0.22, metal=1.0),
        chrome=mat("Chrome", "#eef1f5", rough=0.08, metal=1.0),
        dark=mat("DarkMetal", "#2c2f36", rough=0.45, metal=0.6),
        rubber=mat("Rubber", "#2a2b30", rough=0.85),
        mat_blue=mat("AccentMat", "#5aa9c7", rough=0.7),
        accent=mat("Accent", "#ff8fa3", rough=0.45),
        accent2=mat("AccentSoft", "#ffc4cf", rough=0.9),
        wood=mat("Wood", "#c08a5b", rough=0.55),
        wood_dark=mat("WoodDark", "#7a5236", rough=0.5),
        white=mat("WhitePlastic", "#f4f2ee", rough=0.35),
        ceramic=mat("Ceramic", "#f7f5f1", rough=0.15, coat=0.6),
        glass=mat("Glass", "#cfe9f5", rough=0.03, alpha=0.25, transmission=1.0),
        fabric=mat("AccentFabric", "#7fb7a8", rough=0.95),
        cushion=mat("Cushion", "#f1e4cf", rough=0.95),
        leaf=mat("Leaf", "#3f8f4e", rough=0.55),
        leaf2=mat("Leaf2", "#5fb35f", rough=0.55),
        soil=mat("Soil", "#3b2a20", rough=1.0),
        pot=mat("PotTerracotta", "#c8734f", rough=0.75),
        gold=mat("Gold", "#f2c14e", rough=0.18, metal=1.0),
        black=mat("Black", "#18191c", rough=0.4),
        screen=mat("Screen", "#7fd3ff", rough=0.2, emit="#8ad8ff", emit_strength=1.4),
        bulb=mat("Bulb", "#fff3d6", rough=0.3, emit="#ffe2a8", emit_strength=6.0),
        neon=mat("Neon", "#ff6fb1", rough=0.3, emit="#ff4fa3", emit_strength=8.0),
        towel_a=mat("TowelA", "#f7c7d4", rough=1.0),
        towel_b=mat("TowelB", "#b9e2f0", rough=1.0),
        towel_c=mat("TowelC", "#fff1c9", rough=1.0),
        canvas=mat("Canvas", "#f6efe2", rough=0.9),
        paper=mat("Paper", "#fafafa", rough=0.9),
        red=mat("Red", "#e0504f", rough=0.4),
        mint=mat("Mint", "#8fd8c0", rough=0.4),
        yellow=mat("Yellow", "#ffd166", rough=0.4),
        purple=mat("Purple", "#9b7fe6", rough=0.4),
        concrete=mat("Concrete", "#9a9a98", rough=0.95),
        stage=mat("StageFloor", "#3a2c4f", rough=0.35, coat=0.4),
        carpet=mat("RedCarpet", "#b32d43", rough=1.0),
    )


def box(name, size, loc, material, parent, bevel=0.01, rot=(0, 0, 0), segs=3):
    return prim("cube", name, size, loc=loc, rot=rot, material=material, parent=parent,
                bevel=bevel, bevel_segs=segs)


def cyl(name, r, h, loc, material, parent, rot=(0, 0, 0), segments=32, bevel=0.0, r2=None):
    return prim("cyl", name, (r * 2, r * 2, h), loc=loc, rot=rot, material=material, parent=parent,
                segments=segments, bevel=bevel, radius2=None if r2 is None else 0.5 * r2 / r)


def boolean_cut(obj, cutter, op="DIFFERENCE"):
    m = obj.modifiers.new("bool", "BOOLEAN")
    m.object = cutter
    m.operation = op
    m.solver = "EXACT"
    apply_modifiers(obj)
    bpy.data.objects.remove(cutter)
    obj.data.shade_smooth()
    obj.data.set_sharp_from_angle(angle=math.radians(35))
    return obj


# ---------------------------------------------------------------- предметы

def groom_table(m):
    root = empty("GroomTable")
    box("Top", (1.0, 0.6, 0.04), (0, 0, 0.84), m["steel"], root, bevel=0.012)
    box("MatTop", (0.94, 0.54, 0.012), (0, 0, 0.866), m["rubber"], root, bevel=0.005)
    cyl("Column", 0.055, 0.7, (0, 0, 0.47), m["chrome"], root)
    cyl("ColumnSleeve", 0.075, 0.28, (0, 0, 0.26), m["dark"], root, bevel=0.01)
    cyl("Base", 0.3, 0.05, (0, 0, 0.03), m["dark"], root, bevel=0.015, segments=48)
    box("Pedal", (0.12, 0.06, 0.03), (0.22, -0.2, 0.05), m["rubber"], root, rot=(0, 0, 30))
    # штанга-фиксатор
    cyl("ArmPole", 0.016, 1.0, (0.44, 0.24, 1.36), m["chrome"], root)
    box("ArmClamp", (0.06, 0.05, 0.06), (0.44, 0.24, 0.86), m["dark"], root)
    tube("ArmTop", [(0.44, 0.24, 1.85), (0.44, 0.22, 1.89), (0.42, 0.2, 1.9), (0.3, 0.16, 1.9)], 0.016,
         m["chrome"], root)
    # петля-фиксатор висит у задней кромки, чтобы не закрывать питомца
    tube("Leash", [(0.3, 0.16, 1.9), (0.3, 0.16, 1.75), (0.3, 0.16, 1.62)], 0.006, m["accent"], root)
    torus("Loop", 0.06, 0.008, (0.3, 0.16, 1.56), (90, 0, 0), m["accent"], root, seg=24, rings=8)
    return root


def bathtub(m):
    root = empty("Bathtub")
    outer = box("Tub", (1.2, 0.65, 0.5), (0, 0, 0.75), m["steel"], root, bevel=0.06, segs=5)
    cutter = prim("cube", "cut", (1.1, 0.55, 0.5), loc=(0, 0, 0.98), bevel=0.05, bevel_segs=4)
    boolean_cut(outer, cutter)
    rim = box("Rim", (1.22, 0.67, 0.02), (0, 0, 1.0), m["chrome"], root, bevel=0.008)
    boolean_cut(rim, prim("cube", "cut2", (1.1, 0.55, 0.1), loc=(0, 0, 1.0), bevel=0.02))
    for x in (-0.5, 0.5):
        for y in (-0.25, 0.25):
            cyl(f"Leg{x}{y}", 0.025, 0.5, (x, y, 0.25), m["chrome"], root)
            cyl(f"Foot{x}{y}", 0.035, 0.02, (x, y, 0.01), m["rubber"], root)
    box("Grate", (1.0, 0.45, 0.01), (0, 0, 0.535), m["rubber"], root, bevel=0.004)
    for i in range(9):
        box(f"Slat{i}", (0.02, 0.45, 0.012), (-0.44 + i * 0.11, 0, 0.545), m["mat_blue"], root, bevel=0.004)
    # смеситель
    cyl("FaucetBase", 0.03, 0.08, (0.0, 0.3, 1.04), m["chrome"], root)
    tube("Faucet", [(0, 0.3, 1.07), (0, 0.3, 1.22), (0, 0.26, 1.28), (0, 0.17, 1.27), (0, 0.15, 1.2)], 0.014,
         m["chrome"], root)
    for s in (-1, 1):
        cyl(f"Knob{s}", 0.022, 0.03, (s * 0.09, 0.3, 1.04), m["chrome"], root)
        cyl(f"KnobCap{s}", 0.012, 0.012, (s * 0.09, 0.3, 1.06), m["red"] if s < 0 else m["mint"], root)
    # шланг с лейкой на держателе
    hose = []
    for i in range(16):
        t = i / 15
        hose.append((0.35 + 0.08 * math.sin(t * 3), 0.31 - 0.02 * t, 1.05 - 0.35 * math.sin(t * math.pi) + 0.25 * t))
    tube("Hose", hose, 0.01, m["chrome"], root, sides=8)
    cyl("Holder", 0.02, 0.05, (0.43, 0.33, 1.33), m["dark"], root)
    lathe("ShowerHead", [(0.0, 0), (0.035, 0.0), (0.04, 0.01), (0.03, 0.03), (0.012, 0.05), (0.012, 0.13), (0.0, 0.13)],
          m["white"], root, loc=(0.43, 0.33, 1.3), segments=24)
    return root


def dryer_stand(m):
    root = empty("DryerStand")
    for i in range(5):
        a = i / 5 * 2 * math.pi
        tube(f"Spoke{i}", [(0, 0, 0.08), (math.cos(a) * 0.28, math.sin(a) * 0.28, 0.05)], 0.018, m["dark"], root,
             sides=8)
        prim("sphere", f"Wheel{i}", (0.05, 0.05, 0.05), loc=(math.cos(a) * 0.28, math.sin(a) * 0.28, 0.025),
             material=m["rubber"], parent=root, segments=16, rings=10)
    cyl("Hub", 0.05, 0.08, (0, 0, 0.08), m["dark"], root)
    cyl("Pole", 0.02, 1.1, (0, 0, 0.62), m["chrome"], root)
    box("Housing", (0.32, 0.2, 0.22), (0, 0, 1.2), m["accent"], root, bevel=0.06, segs=5)
    cyl("Vent", 0.07, 0.03, (0, 0.105, 1.2), m["dark"], root, rot=(90, 0, 0))
    for i in range(4):
        torus(f"VentRing{i}", 0.02 + i * 0.015, 0.004, (0, 0.12, 1.2), (90, 0, 0), m["chrome"], root, seg=24, rings=6)
    box("Panel", (0.14, 0.01, 0.06), (0, -0.102, 1.24), m["black"], root, bevel=0.004)
    for i, c in enumerate((m["mint"], m["yellow"], m["red"])):
        cyl(f"Btn{i}", 0.01, 0.01, (-0.04 + i * 0.04, -0.11, 1.225), c, root, rot=(90, 0, 0))
    pts = []
    for i in range(40):
        t = i / 39
        pts.append((-0.16 - 0.25 * t, -0.05 * math.sin(t * 3), 1.18 + 0.2 * math.sin(t * math.pi) - 0.1 * t))
    tube("Hose", pts, 0.035, m["dark"], root, sides=12)
    for i in range(0, 40, 2):
        x, y, z = pts[i]
        torus(f"Rib{i}", 0.037, 0.005, (x, y, z), (0, 90 - 30 * math.cos(i / 39 * math.pi), 0), m["rubber"], root,
              seg=16, rings=5)
    lathe("Nozzle", [(0, 0), (0.04, 0), (0.04, 0.05), (0.025, 0.14), (0.012, 0.16), (0.0, 0.16)], m["white"], root,
          loc=pts[-1], rot=(0, -100, 0), segments=20)
    return root


def reception_desk(m):
    root = empty("ReceptionDesk")
    box("Front", (1.6, 0.08, 1.05), (0, -0.28, 0.525), m["accent"], root, bevel=0.03)
    box("SideL", (0.08, 0.6, 1.05), (-0.76, 0.0, 0.525), m["accent"], root, bevel=0.03)
    box("SideR", (0.08, 0.6, 1.05), (0.76, 0.0, 0.525), m["accent"], root, bevel=0.03)
    box("Top", (1.75, 0.72, 0.05), (0, 0.0, 1.075), m["wood"], root, bevel=0.015)
    box("Work", (1.5, 0.5, 0.04), (0, 0.06, 0.74), m["wood"], root, bevel=0.01)
    box("Stripe", (1.62, 0.09, 0.05), (0, -0.33, 0.85), m["wood_dark"], root, bevel=0.012)
    # логотип-лапка
    cyl("LogoPad", 0.11, 0.02, (0, -0.33, 0.55), m["white"], root, rot=(90, 0, 0), segments=40)
    for i, (x, z) in enumerate(((-0.06, 0.62), (-0.02, 0.645), (0.02, 0.645), (0.06, 0.62))):
        prim("sphere", f"Toe{i}", (0.035, 0.02, 0.04), loc=(x, -0.345, z), material=m["accent"], parent=root)
    prim("sphere", "PawPad", (0.1, 0.02, 0.075), loc=(0, -0.345, 0.54), material=m["accent"], parent=root)
    # монитор, клавиатура, терминал
    box("MonitorStand", (0.04, 0.04, 0.2), (0.35, 0.18, 1.2), m["dark"], root, bevel=0.005)
    box("MonitorBase", (0.18, 0.14, 0.015), (0.35, 0.18, 1.105), m["dark"], root, bevel=0.005)
    box("Monitor", (0.5, 0.03, 0.3), (0.35, 0.17, 1.37), m["black"], root, bevel=0.01, rot=(0, 0, 10))
    box("Screen", (0.46, 0.005, 0.26), (0.347, 0.152, 1.37), m["screen"], root, bevel=0.002, rot=(0, 0, 10))
    box("Keyboard", (0.38, 0.13, 0.015), (0.32, -0.05, 1.108), m["white"], root, bevel=0.004)
    box("Terminal", (0.09, 0.16, 0.05), (-0.4, -0.1, 1.125), m["dark"], root, bevel=0.012, rot=(0, 0, -10))
    box("TermScreen", (0.06, 0.05, 0.005), (-0.4, -0.06, 1.15), m["screen"], root, bevel=0.002, rot=(0, 0, -10))
    # подставка с визитками и баночка с лакомствами
    lathe("Jar", [(0, 0), (0.06, 0), (0.065, 0.01), (0.065, 0.14), (0.05, 0.16), (0.05, 0.17), (0, 0.17)], m["glass"],
          root, loc=(-0.65, -0.12, 1.1))
    lathe("JarLid", [(0, 0), (0.055, 0), (0.055, 0.02), (0.02, 0.03), (0.02, 0.05), (0, 0.05)], m["accent"], root,
          loc=(-0.65, -0.12, 1.27))
    for i in range(6):
        bone(f"JarBone{i}", (-0.65 + R.uniform(-0.03, 0.03), -0.12 + R.uniform(-0.03, 0.03), 1.13 + i * 0.02),
             m["yellow"], root, 0.5, rot=(R.uniform(0, 90), R.uniform(0, 90), R.uniform(0, 180)))
    lathe("Bell", [(0, 0), (0.05, 0), (0.05, 0.008), (0.045, 0.03), (0.01, 0.05), (0.012, 0.065), (0, 0.068)],
          m["gold"], root, loc=(-0.15, -0.2, 1.1))
    return root


def bone(name, loc, material, parent, s=1.0, rot=(0, 0, 0)):
    g = empty(name, parent, loc)
    g.rotation_euler = [math.radians(a) for a in rot]
    cyl(name + "Shaft", 0.012 * s, 0.07 * s, (0, 0, 0), material, g, rot=(0, 90, 0), segments=12)
    for x in (-1, 1):
        for y in (-1, 1):
            prim("sphere", f"{name}K{x}{y}", (0.026 * s, 0.026 * s, 0.026 * s), loc=(x * 0.037 * s, y * 0.012 * s, 0),
                 material=material, parent=g, segments=12, rings=8)
    return g


def sofa(m):
    root = empty("Sofa")
    box("Base", (1.6, 0.75, 0.25), (0, 0, 0.22), m["fabric"], root, bevel=0.05, segs=4)
    box("Back", (1.6, 0.2, 0.55), (0, 0.3, 0.6), m["fabric"], root, bevel=0.07, segs=5)
    for s in (-1, 1):
        box(f"Arm{s}", (0.18, 0.75, 0.42), (s * 0.79, 0, 0.42), m["fabric"], root, bevel=0.07, segs=5)
        box(f"Seat{s}", (0.68, 0.6, 0.14), (s * 0.35, -0.05, 0.41), m["fabric"], root, bevel=0.06, segs=5)
        box(f"Pillow{s}", (0.4, 0.14, 0.36), (s * 0.4, 0.17, 0.66), m["cushion"], root, bevel=0.07, segs=5,
            rot=(-12, 0, s * 8))
    for x in (-0.7, 0.7):
        for y in (-0.28, 0.28):
            cyl(f"Leg{x}{y}", 0.025, 0.1, (x, y, 0.05), m["wood_dark"], root, r2=0.016)
    return root


def chair(m, name="Chair"):
    root = empty(name)
    box("Seat", (0.46, 0.46, 0.07), (0, 0, 0.46), m["fabric"], root, bevel=0.03, segs=4)
    box("Back", (0.46, 0.06, 0.42), (0, 0.22, 0.74), m["fabric"], root, bevel=0.03, segs=4, rot=(-8, 0, 0))
    for x in (-0.19, 0.19):
        for y in (-0.19, 0.19):
            prim("cyl", f"Leg{x}{y}", (0.035, 0.035, 0.44), loc=(x, y, 0.22), rot=(-6 if y < 0 else 6, 6 if x > 0 else -6, 0),
                 material=m["wood"], parent=root, segments=12)
    return root


def stool(m):
    root = empty("Stool")
    cyl("Seat", 0.2, 0.07, (0, 0, 0.6), m["accent"], root, bevel=0.03, segments=40)
    cyl("Gas", 0.025, 0.5, (0, 0, 0.32), m["chrome"], root)
    for i in range(5):
        a = i / 5 * 2 * math.pi
        tube(f"S{i}", [(0, 0, 0.08), (math.cos(a) * 0.25, math.sin(a) * 0.25, 0.05)], 0.016, m["dark"], root, sides=8)
        prim("sphere", f"W{i}", (0.045, 0.045, 0.045), loc=(math.cos(a) * 0.25, math.sin(a) * 0.25, 0.024),
             material=m["rubber"], parent=root, segments=12, rings=8)
    torus("Ring", 0.17, 0.01, (0, 0, 0.3), (0, 0, 0), m["chrome"], root, seg=32, rings=8)
    return root


def plant(m, name="PlantBig", scale=1.0):
    root = empty(name)
    s = scale
    lathe("Pot", [(0, 0), (0.15 * s, 0), (0.17 * s, 0.02 * s), (0.21 * s, 0.4 * s), (0.22 * s, 0.42 * s),
                  (0.2 * s, 0.42 * s), (0.0, 0.42 * s)], m["pot"], root, segments=36)
    cyl("Soil", 0.195 * s, 0.01, (0, 0, 0.405 * s), m["soil"], root)
    n = 11 if s > 0.7 else 7
    for i in range(n):
        a = i / n * 2 * math.pi + R.uniform(-0.2, 0.2)
        h = R.uniform(0.55, 1.0) * s
        tilt = R.uniform(0.25, 0.55)
        base = Vector((0, 0, 0.4 * s))
        top = base + Vector((math.cos(a) * tilt * h * 0.6, math.sin(a) * tilt * h * 0.6, h * 0.8))
        mid = (base + top) / 2 + Vector((0, 0, 0.05))
        tube(f"Stem{i}", [base, mid, top], 0.008 * s, m["leaf"], root, sides=6)
        leaf = prim("sphere", f"Leaf{i}", (0.24 * s, 0.03 * s, 0.34 * s), loc=top, material=m["leaf2"] if i % 2 else m["leaf"],
                    parent=root, segments=20, rings=14)
        for v in leaf.data.vertices:  # форма листа: сердцевидный, с изгибом
            zz = v.co.z / (0.17 * s)
            v.co.x *= 1.0 - 0.35 * max(0.0, zz) ** 2
            v.co.y += (v.co.x / (0.12 * s)) ** 2 * 0.02 * s - zz * 0.02 * s
        leaf.data.update()
        leaf.rotation_euler = (math.radians(R.uniform(20, 50)), 0, a + math.pi / 2)
    return root


def shelf(m):
    root = empty("Shelf")
    for s in (-1, 1):
        box(f"Side{s}", (0.03, 0.32, 1.7), (s * 0.5, 0, 0.85), m["wood"], root, bevel=0.006)
    box("BackPanel", (1.0, 0.015, 1.7), (0, 0.155, 0.85), m["wood_dark"], root, bevel=0.003)
    colors = [m["accent"], m["mint"], m["yellow"], m["purple"], m["white"], m["red"]]
    for k, z in enumerate((0.05, 0.45, 0.85, 1.25, 1.66)):
        box(f"Board{k}", (1.0, 0.32, 0.03), (0, 0, z), m["wood"], root, bevel=0.006)
        if k == 0 or k == 4:
            continue
        x = -0.43
        while x < 0.42:
            kind = R.choice(("bottle", "bottle", "jar", "towels") if k != 1 else ("towels",))
            if kind == "towels":
                for t in range(3):
                    cyl(f"Towel{k}{x:.2f}{t}", 0.05, 0.22, (x + 0.05, -0.02, z + 0.065 + t * 0.1),
                        R.choice((m["towel_a"], m["towel_b"], m["towel_c"])), root, rot=(90, 0, 0), segments=18)
                x += 0.13
            elif kind == "bottle":
                h = R.uniform(0.18, 0.28)
                r = R.uniform(0.03, 0.045)
                lathe(f"Bottle{k}{x:.2f}", [(0, 0), (r, 0), (r + 0.003, 0.01), (r + 0.003, h * 0.75), (r * 0.5, h * 0.88),
                                             (r * 0.32, h * 0.92), (r * 0.32, h), (0, h)],
                      R.choice(colors), root, loc=(x + r, 0, z + 0.015), segments=20)
                cyl(f"Cap{k}{x:.2f}", r * 0.38, 0.03, (x + r, 0, z + 0.015 + h), m["white"], root, segments=12)
                if R.random() < 0.5:
                    tube(f"Pump{k}{x:.2f}", [(x + r, 0, z + 0.03 + h), (x + r, 0, z + 0.06 + h), (x + r, -0.04, z + 0.06 + h)],
                         0.005, m["white"], root, sides=6)
                x += r * 2 + 0.03
            else:
                lathe(f"Jar{k}{x:.2f}", [(0, 0), (0.05, 0), (0.055, 0.01), (0.055, 0.12), (0.045, 0.13), (0, 0.13)],
                      R.choice(colors), root, loc=(x + 0.055, 0, z + 0.015), segments=20)
                x += 0.13
    return root


def pendant_lamp(m):
    root = empty("PendantLamp")
    cyl("Cord", 0.004, 0.9, (0, 0, -0.45), m["black"], root, segments=8)
    lathe("Shade", [(0.02, 0), (0.05, -0.01), (0.2, -0.18), (0.21, -0.2), (0.205, -0.2), (0.195, -0.185),
                    (0.045, -0.02), (0.015, -0.01)], m["accent"], root, loc=(0, 0, -0.9), segments=40)
    prim("sphere", "Bulb", (0.08, 0.08, 0.08), loc=(0, 0, -1.04), material=m["bulb"], parent=root)
    cyl("Canopy", 0.06, 0.02, (0, 0, -0.01), m["black"], root)
    return root


def window(m):
    root = empty("Window")
    W, H = 1.4, 1.5
    for s in (-1, 1):
        box(f"FrameV{s}", (0.07, 0.12, H), (s * W / 2, 0, 0), m["white"], root, bevel=0.008)
        box(f"FrameH{s}", (W + 0.07, 0.12, 0.07), (0, 0, s * H / 2), m["white"], root, bevel=0.008)
    box("Mullion", (0.045, 0.08, H), (0, 0, 0), m["white"], root, bevel=0.006)
    box("Transom", (W, 0.08, 0.045), (0, 0, H * 0.18), m["white"], root, bevel=0.006)
    box("Glass", (W, 0.01, H), (0, 0, 0), m["glass"], root, bevel=0)
    box("Sill", (W + 0.25, 0.25, 0.04), (0, -0.1, -H / 2 - 0.05), m["white"], root, bevel=0.01)
    return root


def door(m):
    root = empty("Door")
    frame = box("Frame", (1.1, 0.14, 2.25), (0, 0, 1.125), m["white"], root, bevel=0.01)
    boolean_cut(frame, prim("cube", "c", (0.96, 0.4, 2.15), loc=(0, 0, 1.06)))
    box("Leaf", (0.94, 0.05, 2.12), (0, 0, 1.06), m["accent"], root, bevel=0.012)
    box("DoorGlass", (0.6, 0.06, 1.0), (0, 0, 1.4), m["glass"], root, bevel=0.01)
    box("Kick", (0.94, 0.06, 0.15), (0, 0, 0.1), m["chrome"], root, bevel=0.01)
    for y in (-0.06, 0.06):
        cyl(f"Handle{y}", 0.014, 0.4, (0.36, y, 1.05), m["chrome"], root)
    # колокольчик над дверью
    lathe("DoorBell", [(0, 0), (0.04, 0), (0.035, 0.025), (0.01, 0.05), (0, 0.05)], m["gold"], root,
          loc=(0.35, -0.12, 2.0))
    return root


def dog_bed(m):
    root = empty("DogBed")
    torus("Rim", 0.36, 0.11, (0, 0, 0.11), (0, 0, 0), m["accent"], root, seg=48, rings=18)
    cyl("Bottom", 0.4, 0.06, (0, 0, 0.03), m["accent"], root, bevel=0.02, segments=48)
    prim("sphere", "Pillow", (0.6, 0.6, 0.14), loc=(0, 0, 0.1), material=m["cushion"], parent=root, segments=40, rings=14)
    bone("Toy", (0.22, -0.18, 0.18), m["mint"], root, 1.4, rot=(0, 0, 40))
    return root


def kennel(m):
    root = empty("Kennel")
    W, D, H = 0.9, 0.6, 0.65
    box("Tray", (W, D, 0.04), (0, 0, 0.02), m["dark"], root, bevel=0.01)
    bars = m["chrome"]
    for i in range(10):
        x = -W / 2 + i * W / 9
        cyl(f"BF{i}", 0.005, H, (x, -D / 2, H / 2 + 0.02), bars, root, segments=8)
        cyl(f"BB{i}", 0.005, H, (x, D / 2, H / 2 + 0.02), bars, root, segments=8)
    for i in range(7):
        y = -D / 2 + i * D / 6
        for s in (-1, 1):
            cyl(f"BS{i}{s}", 0.005, H, (s * W / 2, y, H / 2 + 0.02), bars, root, segments=8)
        cyl(f"BT{i}", 0.005, W, (0, y, H + 0.02), bars, root, rot=(0, 90, 0), segments=8)
    for z in (0.04, H / 2, H + 0.02):
        for s in (-1, 1):
            cyl(f"RX{z}{s}", 0.006, W, (0, s * D / 2, z), bars, root, rot=(0, 90, 0), segments=8)
            cyl(f"RY{z}{s}", 0.006, D, (s * W / 2, 0, z), bars, root, rot=(90, 0, 0), segments=8)
    box("Blanket", (W * 0.85, D * 0.8, 0.05), (0, 0, 0.06), m["towel_b"], root, bevel=0.02)
    return root


def coffee_machine(m):
    root = empty("CoffeeMachine")
    box("Counter", (0.8, 0.5, 0.9), (0, 0, 0.45), m["wood"], root, bevel=0.015)
    box("CounterTop", (0.84, 0.54, 0.04), (0, 0, 0.92), m["white"], root, bevel=0.01)
    box("Body", (0.32, 0.36, 0.42), (-0.12, 0.05, 1.15), m["chrome"], root, bevel=0.03)
    box("Front", (0.26, 0.02, 0.12), (-0.12, -0.135, 1.27), m["black"], root, bevel=0.01)
    box("Spout", (0.08, 0.06, 0.04), (-0.12, -0.12, 1.12), m["dark"], root, bevel=0.01)
    box("Drip", (0.2, 0.12, 0.02), (-0.12, -0.08, 0.955), m["dark"], root, bevel=0.005)
    for i, x in enumerate((0.18, 0.28)):
        lathe(f"Cup{i}", [(0, 0), (0.03, 0), (0.04, 0.07), (0.035, 0.07), (0.0, 0.005)], m["ceramic"], root,
              loc=(x, -0.1, 0.94))
    return root


def trophy(m):
    root = empty("Trophy")
    box("Plinth", (0.2, 0.2, 0.08), (0, 0, 0.04), m["wood_dark"], root, bevel=0.01)
    lathe("Cup", [(0, 0.08), (0.06, 0.08), (0.06, 0.09), (0.015, 0.12), (0.015, 0.18), (0.03, 0.2), (0.11, 0.3),
                  (0.12, 0.38), (0.11, 0.38), (0.1, 0.31), (0.02, 0.215), (0, 0.215)], m["gold"], root, segments=40)
    for s in (-1, 1):
        h = torus(f"Handle{s}", 0.05, 0.01, (s * 0.12, 0, 0.31), (90, 0, 0), m["gold"], root, seg=24, rings=8, arc=200)
        h.rotation_euler = (math.radians(90), 0, math.radians(-90 if s > 0 else 90))
    # золотые ножницы сверху
    sc = scissors_model(m, "TrophyScissors", m["gold"], m["gold"])
    sc.parent = root
    sc.location = (0, 0, 0.42)
    sc.rotation_euler = (math.radians(90), 0, 0)
    sc.scale = (1.4, 1.4, 1.4)
    return root


def scissors_model(m, name, blade, ring):
    g = empty(name)
    for s in (-1, 1):
        part = empty(f"{name}_Half{s}", g)
        part.rotation_euler = (0, 0, math.radians(s * 9))
        bl = prim("cube", f"{name}_Blade{s}", (0.012, 0.11, 0.004), loc=(s * 0.002, 0.055, 0), material=blade,
                  parent=part, bevel=0.002)
        for v in bl.data.vertices:
            t = (v.co.y + 0.055) / 0.11
            v.co.x *= 1.0 - 0.75 * t
            v.co.x += s * 0.003 * t
        bl.data.update()
        tube(f"{name}_Shank{s}", [(0, -0.0, 0), (s * 0.012, -0.03, 0), (s * 0.025, -0.05, 0)], 0.004, ring, part, sides=8)
        torus(f"{name}_Ring{s}", 0.017, 0.004, (s * 0.032, -0.065, 0), (0, 0, 0), ring, part, seg=24, rings=8)
    cyl(f"{name}_Pivot", 0.005, 0.012, (0, 0, 0), m["dark"], g, segments=12)
    return g


def neon_paw(m):
    root = empty("NeonPaw")
    box("Board", (0.9, 0.03, 0.7), (0, 0.02, 0), m["black"], root, bevel=0.01)
    torus("Pad", 0.16, 0.012, (0, -0.01, -0.08), (90, 0, 0), m["neon"], root, seg=40, rings=8)
    for i, (x, z, r) in enumerate(((-0.24, 0.1, 0.06), (-0.09, 0.2, 0.065), (0.09, 0.2, 0.065), (0.24, 0.1, 0.06))):
        torus(f"Toe{i}", r, 0.011, (x, -0.01, z), (90, 0, 0), m["neon"], root, seg=28, rings=8)
    return root


def picture(m, name="Picture", w=0.6, h=0.45):
    root = empty(name)
    box("Frame", (w, 0.03, h), (0, 0, 0), m["wood_dark"], root, bevel=0.008)
    box("Art", (w - 0.08, 0.035, h - 0.08), (0, -0.002, 0), m["canvas"], root, bevel=0.0)
    # стилизованный силуэт собаки на картине
    prim("sphere", "ArtDog", (w * 0.3, 0.01, h * 0.3), loc=(0, -0.02, -h * 0.08), material=m["accent"], parent=root)
    prim("sphere", "ArtHead", (w * 0.18, 0.01, h * 0.24), loc=(w * 0.14, -0.022, h * 0.1), material=m["accent"], parent=root)
    prim("sphere", "ArtSun", (w * 0.12, 0.01, w * 0.12), loc=(-w * 0.25, -0.022, h * 0.22), material=m["yellow"], parent=root)
    return root


def wall_clock(m):
    root = empty("WallClock")
    cyl("Body", 0.18, 0.04, (0, 0, 0), m["accent"], root, rot=(90, 0, 0), segments=48, bevel=0.01)
    cyl("Face", 0.155, 0.045, (0, -0.002, 0), m["white"], root, rot=(90, 0, 0), segments=48)
    for i in range(12):
        a = i / 12 * 2 * math.pi
        box(f"Tick{i}", (0.008, 0.01, 0.025), (math.sin(a) * 0.13, -0.026, math.cos(a) * 0.13), m["black"], root,
            bevel=0.0, rot=(0, math.degrees(a), 0))
    box("HandH", (0.012, 0.01, 0.08), (0.0, -0.03, 0.035), m["black"], root, bevel=0.0)
    box("HandM", (0.008, 0.01, 0.12), (0.045, -0.032, 0.0), m["black"], root, bevel=0.0, rot=(0, 75, 0))
    return root


def sink_cabinet(m):
    root = empty("SinkCabinet")
    box("Cabinet", (1.2, 0.55, 0.85), (0, 0, 0.425), m["white"], root, bevel=0.012)
    for i, x in enumerate((-0.3, 0.3)):
        box(f"Door{i}", (0.57, 0.02, 0.7), (x, -0.28, 0.42), m["accent"], root, bevel=0.008)
        box(f"Pull{i}", (0.12, 0.02, 0.015), (x, -0.3, 0.72), m["chrome"], root, bevel=0.005)
    top = box("Top", (1.24, 0.58, 0.04), (0, 0, 0.87), m["wood"], root, bevel=0.01)
    cut = prim("cube", "c", (0.42, 0.34, 0.2), loc=(0.25, 0, 0.88), bevel=0.04)
    boolean_cut(top, cut)
    basin = lathe("Basin", [(0.0, -0.12), (0.12, -0.12), (0.17, -0.06), (0.19, 0.0), (0.18, 0.0), (0.16, -0.055),
                            (0.11, -0.11), (0, -0.11)], m["steel"], root, loc=(0.25, 0, 0.89))
    basin.scale = (1.1, 0.85, 1.0)
    tube("Tap", [(0.25, 0.22, 0.89), (0.25, 0.22, 1.05), (0.25, 0.14, 1.08), (0.25, 0.08, 1.03)], 0.013, m["chrome"], root)
    for i in range(3):
        lathe(f"Bot{i}", [(0, 0), (0.035, 0), (0.035, 0.16), (0.012, 0.2), (0.012, 0.23), (0, 0.23)],
              (m["mint"], m["accent"], m["purple"])[i], root, loc=(-0.45 + i * 0.1, 0.12, 0.89))
    return root


def towel_stack(m):
    root = empty("TowelStack")
    cols = (m["towel_a"], m["towel_b"], m["towel_c"], m["towel_a"])
    for i, c in enumerate(cols):
        box(f"T{i}", (0.42, 0.3, 0.06), (R.uniform(-0.01, 0.01), R.uniform(-0.01, 0.01), 0.03 + i * 0.062), c, root,
            bevel=0.025, segs=4, rot=(0, 0, R.uniform(-4, 4)))
    return root


def bench(m):
    root = empty("Bench")
    box("Seat", (1.4, 0.4, 0.06), (0, 0, 0.45), m["wood"], root, bevel=0.012)
    for x in (-0.6, 0.6):
        tube(f"Leg{x}", [(x, -0.15, 0), (x, -0.15, 0.42), (x, 0.15, 0.42), (x, 0.15, 0)], 0.018, m["dark"], root, sides=10)
    return root


def stage(m):
    root = empty("Stage")
    cyl("Platform", 2.6, 0.35, (0, 0, 0.175), m["stage"], root, segments=72, bevel=0.03)
    torus("Edge", 2.6, 0.03, (0, 0, 0.35), (0, 0, 0), m["gold"], root, seg=96, rings=8)
    box("Carpet", (1.2, 5.0, 0.02), (0, -3.6, 0.01), m["carpet"], root, bevel=0.0)
    for i in range(3):
        box(f"Step{i}", (1.2, 0.3, 0.12 * (i + 1)), (0, -2.75 + i * 0.3 - 0.0, 0.06 * (i + 1)), m["stage"], root, bevel=0.01)
    return root


def spotlight(m):
    root = empty("Spotlight")
    cyl("Stand", 0.02, 2.4, (0, 0, 1.2), m["dark"], root)
    for i in range(3):
        a = i / 3 * 2 * math.pi
        tube(f"Tri{i}", [(0, 0, 0.6), (math.cos(a) * 0.45, math.sin(a) * 0.45, 0.0)], 0.015, m["dark"], root, sides=8)
    g = empty("Head", root, (0, 0, 2.45))
    g.rotation_euler = (math.radians(-35), 0, 0)
    lathe("Can", [(0, -0.2), (0.12, -0.2), (0.14, 0.1), (0.15, 0.2), (0.13, 0.2), (0.0, 0.1)], m["black"], g,
          rot=(-90, 0, 0))
    cyl("Lens", 0.125, 0.01, (0, -0.2, 0), m["bulb"], g, rot=(90, 0, 0))
    return root


def judges_table(m):
    root = empty("JudgesTable")
    box("Top", (2.2, 0.7, 0.05), (0, 0, 0.76), m["white"], root, bevel=0.01)
    box("Cloth", (2.24, 0.04, 0.6), (0, -0.35, 0.47), m["accent"], root, bevel=0.01)
    for x in (-1.0, 1.0):
        box(f"Leg{x}", (0.06, 0.6, 0.74), (x, 0, 0.37), m["dark"], root, bevel=0.01)
    for i in range(3):
        box(f"Card{i}", (0.2, 0.02, 0.12), (-0.7 + i * 0.7, -0.2, 0.84), m["paper"], root, bevel=0.003, rot=(-15, 0, 0))
    return root


def signboard(m):
    root = empty("Signboard")
    box("Board", (1.6, 0.06, 0.45), (0, 0, 0), m["accent"], root, bevel=0.03)
    box("Inner", (1.5, 0.065, 0.35), (0, 0, 0), m["white"], root, bevel=0.02)
    for s in (-1, 1):
        cyl(f"Rod{s}", 0.008, 0.3, (s * 0.6, 0, 0.37), m["dark"], root)
    return root


def rug(m):
    root = empty("Rug")
    cyl("Rug", 1.0, 0.012, (0, 0, 0.006), m["accent2"], root, segments=64, bevel=0.004)
    torus("RugEdge", 0.92, 0.012, (0, 0, 0.012), (0, 0, 0), m["accent"], root, seg=64, rings=6)
    return root


def scale_device(m):
    root = empty("PetScale")
    box("Plate", (0.6, 0.45, 0.05), (0, 0, 0.025), m["white"], root, bevel=0.015)
    box("Pad", (0.54, 0.39, 0.01), (0, 0, 0.053), m["rubber"], root, bevel=0.004)
    box("Display", (0.14, 0.02, 0.06), (0, -0.23, 0.05), m["screen"], root, bevel=0.005)
    return root


ITEMS = [groom_table, bathtub, dryer_stand, reception_desk, sofa, chair, stool, plant, shelf, pendant_lamp,
         window, door, dog_bed, kennel, coffee_machine, trophy, neon_paw, picture, wall_clock, sink_cabinet,
         towel_stack, bench, stage, spotlight, judges_table, signboard, rug, scale_device]


def build():
    reset()
    m = M()
    for fn in ITEMS:
        fn(m)
    plant(m, "PlantSmall", 0.55)
    picture(m, "PictureWide", 0.9, 0.5)


if __name__ == "__main__":
    import sys
    build()
    export("salon_props.glb")
    if "--preview" in sys.argv:
        from common import preview
        # раскладываем предметы сеткой для превью
        roots = [o for o in bpy.context.scene.objects if o.parent is None]
        for i, o in enumerate(roots):
            o.location = ((i % 6) * 2.4 - 6, (i // 6) * 2.4, 0)
        preview(sys.argv[sys.argv.index("--preview") + 1] + "/salon_props.png", target=(0, 4.5, 0.6), dist=19, elev=35, azim=0, size=900, samples=16)
