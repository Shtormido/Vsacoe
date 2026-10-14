"""Инструменты грумера — tools.glb.

Соглашение: рабочий кончик инструмента в начале координат, сам инструмент
уходит вверх по +Z (в игре это направление нормали поверхности питомца).
"""
import os as _os
import sys as _sys

_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))

import math

import bpy  # noqa: F401

from common import empty, export, lathe, mat, prim, reset, torus, tube
from salon import bone, box, cyl, scissors_model


def M():
    return dict(
        steel=mat("Steel", "#cfd4dc", rough=0.2, metal=1.0),
        chrome=mat("Chrome", "#f0f2f6", rough=0.07, metal=1.0),
        dark=mat("DarkMetal", "#2c2f36", rough=0.45, metal=0.5),
        rubber=mat("Rubber", "#2b2c31", rough=0.85),
        pink=mat("ToolPink", "#ff7a9c", rough=0.35, coat=0.5),
        mint=mat("ToolMint", "#5fd0b5", rough=0.35, coat=0.5),
        violet=mat("ToolViolet", "#8f7cf0", rough=0.35, coat=0.5),
        yellow=mat("ToolYellow", "#ffc93c", rough=0.35, coat=0.5),
        orange=mat("ToolOrange", "#ff9248", rough=0.4, coat=0.4),
        white=mat("WhitePlastic", "#f6f4f0", rough=0.3),
        wood=mat("Wood", "#d2a06c", rough=0.5),
        glass=mat("PerfumeGlass", "#f7b6d2", rough=0.02, alpha=0.55, transmission=0.8),
        gold=mat("Gold", "#f2c14e", rough=0.18, metal=1.0),
        ribbon=mat("Ribbon", "#ff4f81", rough=0.45, coat=0.3),
        biscuit=mat("Biscuit", "#d99a4e", rough=0.8),
        led=mat("Led", "#7dffb0", rough=0.3, emit="#5dff9c", emit_strength=4),
    )


def brush(m):
    root = empty("Tool_Brush")
    pad = box("Pad", (0.07, 0.05, 0.012), (0, 0, 0.022), m["pink"], root, bevel=0.005)
    box("PadRubber", (0.064, 0.044, 0.006), (0, 0, 0.014), m["rubber"], root, bevel=0.002)
    for i in range(9):
        for j in range(6):
            x = -0.03 + i * 0.0075
            y = -0.019 + j * 0.0076
            prim("cyl", f"Pin{i}_{j}", (0.0012, 0.0012, 0.012), loc=(x, y, 0.006), rot=(0, 12, 0),
                 material=m["steel"], parent=root, segments=5, smooth=False)
    tube("Neck", [(0, 0.0, 0.028), (0, 0.0, 0.05), (0, 0.02, 0.08)], 0.008, m["pink"], root, sides=10)
    tube("Handle", [(0, 0.02, 0.08), (0, 0.05, 0.13), (0, 0.07, 0.18)], 0.013, m["white"], root, sides=14,
         radius_end=0.011)
    prim("sphere", "Cap", (0.022, 0.022, 0.022), loc=(0, 0.07, 0.18), material=m["pink"], parent=root)
    return root


def shower(m):
    root = empty("Tool_Shower")
    lathe("Head", [(0.0, 0.0), (0.035, 0.0), (0.04, 0.008), (0.036, 0.022), (0.016, 0.04), (0.0, 0.04)],
          m["white"], root, segments=32)
    cyl("Face", 0.032, 0.004, (0, 0, 0.0), m["chrome"], root, segments=32)
    for k in range(3):
        n = 1 if k == 0 else 6 * k
        for i in range(n):
            a = i / n * 2 * math.pi
            r = 0.01 * k
            cyl(f"Hole{k}_{i}", 0.0018, 0.003, (math.cos(a) * r, math.sin(a) * r, -0.0015), m["dark"], root, segments=6)
    tube("Handle", [(0, 0, 0.035), (0, 0.02, 0.07), (0, 0.05, 0.17)], 0.012, m["white"], root, sides=12)
    tube("Hose", [(0, 0.05, 0.17), (0, 0.06, 0.2), (0.02, 0.1, 0.3), (0.05, 0.2, 0.4)], 0.008, m["chrome"], root, sides=8)
    cyl("Grip", 0.0135, 0.04, (0, 0.035, 0.12), m["mint"], root, rot=(-17, 0, 0), segments=14)
    return root


def dryer(m):
    root = empty("Tool_Dryer")
    lathe("Nozzle", [(0.0, 0.0), (0.016, 0.0), (0.02, 0.03), (0.03, 0.06), (0.0, 0.06)], m["dark"], root, segments=24)
    lathe("Body", [(0.0, 0.055), (0.035, 0.055), (0.042, 0.08), (0.044, 0.16), (0.04, 0.18), (0.0, 0.18)], m["violet"],
          root, segments=32)
    for i in range(3):
        torus(f"Vent{i}", 0.03 - i * 0.008, 0.003, (0, 0, 0.181), (0, 0, 0), m["dark"], root, seg=24, rings=6)
    tube("Handle", [(0, 0.03, 0.13), (0, 0.08, 0.12), (0, 0.15, 0.1)], 0.016, m["violet"], root, sides=14)
    cyl("Button", 0.005, 0.008, (0, 0.075, 0.135), m["yellow"], root, segments=10)
    tube("Cord", [(0, 0.15, 0.1), (0, 0.18, 0.09), (0.02, 0.24, 0.05), (0.05, 0.3, -0.02)], 0.004, m["dark"], root, sides=6)
    return root


def clipper(m):
    root = empty("Tool_Clipper")
    box("Blade", (0.04, 0.008, 0.016), (0, 0, 0.008), m["chrome"], root, bevel=0.002)
    for i in range(10):
        box(f"Tooth{i}", (0.0025, 0.007, 0.006), (-0.018 + i * 0.004, -0.002, 0.0), m["steel"], root, bevel=0.0)
    box("BladeBase", (0.042, 0.02, 0.012), (0, 0.004, 0.02), m["dark"], root, bevel=0.003)
    lathe("Body", [(0.0, 0.0), (0.022, 0.0), (0.025, 0.02), (0.022, 0.13), (0.018, 0.15), (0.0, 0.152)], m["mint"], root,
          loc=(0, 0.005, 0.024), segments=28).scale = (1.05, 0.8, 1.0)
    cyl("Switch", 0.006, 0.012, (0, -0.016, 0.08), m["white"], root, rot=(90, 0, 0), segments=12)
    prim("sphere", "Led", (0.006, 0.006, 0.006), loc=(0, -0.017, 0.11), material=m["led"], parent=root)
    tube("Cord", [(0, 0.005, 0.175), (0, 0.01, 0.2), (0.03, 0.04, 0.25), (0.06, 0.08, 0.28)], 0.004, m["dark"], root, sides=6)
    return root


def scissors(m):
    root = empty("Tool_Scissors")
    sc = scissors_model(m, "Sc", m["chrome"], m["pink"])
    sc.parent = root
    sc.rotation_euler = (math.radians(-90), 0, 0)
    sc.location = (0, 0, 0.11)
    return root


def shampoo(m):
    root = empty("Tool_Shampoo")
    g = empty("Bottle", root, (0, 0, 0.0))
    lathe("Body", [(0.0, 0.03), (0.012, 0.03), (0.03, 0.05), (0.033, 0.07), (0.033, 0.17), (0.028, 0.18), (0.0, 0.18)],
          m["pink"], g, segments=28)
    lathe("Label", [(0.0335, 0.09), (0.0335, 0.15)], m["white"], g, segments=28)
    lathe("Cap", [(0.0, 0.0), (0.004, 0.0), (0.006, 0.015), (0.012, 0.03), (0.0, 0.03)], m["white"], g, segments=16)
    return root


def nail_clipper(m):
    root = empty("Tool_NailClipper")
    for s in (-1, 1):
        part = empty(f"Half{s}", root)
        part.rotation_euler = (0, math.radians(s * 6), 0)
        box(f"Jaw{s}", (0.006, 0.014, 0.03), (s * 0.006, 0, 0.018), m["chrome"], part, bevel=0.002)
        tube(f"Handle{s}", [(s * 0.006, 0, 0.035), (s * 0.015, 0, 0.07), (s * 0.03, 0, 0.13)], 0.007, m["orange"], part, sides=10)
        prim("sphere", f"End{s}", (0.016, 0.016, 0.016), loc=(s * 0.03, 0, 0.13), material=m["orange"], parent=part)
    cyl("Pivot", 0.005, 0.02, (0, 0, 0.034), m["dark"], root, rot=(90, 0, 0), segments=12)
    tube("Spring", [(-0.01, 0, 0.05), (0, 0, 0.065), (0.01, 0, 0.05)], 0.002, m["steel"], root, sides=6)
    return root


def perfume(m):
    root = empty("Tool_Perfume")
    lathe("Bottle", [(0.0, 0.02), (0.028, 0.02), (0.034, 0.04), (0.034, 0.09), (0.02, 0.11), (0.008, 0.115), (0.0, 0.115)],
          m["glass"], root, segments=8)
    lathe("Liquid", [(0.0, 0.025), (0.026, 0.025), (0.03, 0.04), (0.03, 0.075), (0.0, 0.075)], m["pink"], root, segments=8)
    cyl("Neck", 0.009, 0.02, (0, 0, 0.122), m["gold"], root, segments=16)
    box("Atomizer", (0.016, 0.016, 0.012), (0, 0, 0.138), m["gold"], root, bevel=0.003)
    cyl("Nozzle", 0.003, 0.012, (0, -0.012, 0.138), m["gold"], root, rot=(90, 0, 0), segments=8)
    tube("Tube", [(0.008, 0, 0.14), (0.03, 0.01, 0.15), (0.05, 0.03, 0.14)], 0.003, m["gold"], root, sides=6)
    prim("sphere", "Bulb", (0.03, 0.03, 0.036), loc=(0.06, 0.04, 0.135), material=m["pink"], parent=root)
    return root


def bow(m):
    root = empty("Tool_Bow")
    for s in (-1, 1):
        loop = prim("sphere", f"Loop{s}", (0.05, 0.02, 0.034), loc=(s * 0.026, 0, 0.0), material=m["ribbon"],
                    parent=root, segments=24, rings=14)
        for v in loop.data.vertices:
            t = (v.co.x * s) / 0.025 + 0.5   # 0 у узла, 1 у края
            v.co.z *= 0.45 + 0.7 * t
            v.co.y *= 0.6 + 0.4 * t
        loop.data.update()
        tail = prim("cube", f"Tail{s}", (0.012, 0.004, 0.04), loc=(s * 0.01, 0.002, -0.022), rot=(0, s * 25, 0),
                    material=m["ribbon"], parent=root, bevel=0.002)
    prim("sphere", "Knot", (0.018, 0.018, 0.02), loc=(0, -0.004, 0), material=m["ribbon"], parent=root)
    return root


def treat(m):
    root = empty("Tool_Treat")
    bone("Bone", (0, 0, 0.02), m["biscuit"], root, 1.0, rot=(0, 0, 0))
    return root


def build():
    reset()
    m = M()
    for fn in (brush, shower, dryer, clipper, scissors, shampoo, nail_clipper, perfume, bow, treat):
        fn(m)


if __name__ == "__main__":
    import sys
    build()
    export("tools.glb")
    if "--preview" in sys.argv:
        from common import preview
        roots = [o for o in bpy.context.scene.objects if o.parent is None]
        for i, o in enumerate(roots):
            o.location = ((i % 5) * 0.25 - 0.5, (i // 5) * 0.3, 0)
        preview(sys.argv[sys.argv.index("--preview") + 1] + "/tools.png", target=(0, 0.15, 0.08), dist=1.3, elev=30, azim=0, size=800, samples=16)
