"""Рендер иконок инструментов и портретов персонажей для интерфейса (Cycles)."""
import os as _os
import sys as _sys

_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))

import math
import os

import bpy
from mathutils import Vector

import people
import tools
from common import OUT_DIR, hex_lin

PUBLIC = os.path.dirname(OUT_DIR)

TOOL_ICONS = {
    "Tool_Brush": "brush", "Tool_Shower": "shower", "Tool_Dryer": "dryer", "Tool_Clipper": "clipper",
    "Tool_Scissors": "scissors", "Tool_Shampoo": "shampoo", "Tool_NailClipper": "nailclip",
    "Tool_Perfume": "perfume", "Tool_Bow": "bow", "Tool_Treat": "treat", "Tool_FirstAid": "firstaid",
}


def setup(size=256, samples=48):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = samples
    scene.cycles.device = "CPU"
    try:
        scene.cycles.use_denoising = True
    except Exception:  # noqa: BLE001
        pass
    scene.render.resolution_x = size
    scene.render.resolution_y = size
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.view_transform = "Standard"
    world = bpy.data.worlds.new("W")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (*hex_lin("#fff1f6"), 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.9
    scene.world = world
    for name, energy, rot in (("Key", 3.2, (50, 0, -35)), ("Rim", 2.0, (60, 0, 150))):
        d = bpy.data.lights.new(name, "SUN")
        d.energy = energy
        d.angle = math.radians(15)
        o = bpy.data.objects.new(name, d)
        o.rotation_euler = [math.radians(a) for a in rot]
        scene.collection.objects.link(o)
    cam_d = bpy.data.cameras.new("Cam")
    cam = bpy.data.objects.new("Cam", cam_d)
    scene.collection.objects.link(cam)
    scene.camera = cam
    return cam


def bbox(root):
    pts = []
    for o in [root, *root.children_recursive]:
        if o.type == "MESH" and not any(k in o.name for k in ("Hose", "Cord", "Tube")):
            pts += [o.matrix_world @ Vector(c) for c in o.bound_box]
    mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return mn, mx


def frame(cam, center, size, direction, ortho=True, lens=85):
    d = Vector(direction).normalized()
    if ortho:
        cam.data.type = "ORTHO"
        cam.data.ortho_scale = size
        cam.location = center + d * 5
    else:
        cam.data.type = "PERSP"
        cam.data.lens = lens
        dist = size / (2 * math.tan(cam.data.angle / 2))
        cam.location = center + d * dist
    cam.data.clip_end = 100
    cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()


def isolate(roots, keep):
    for r in roots:
        vis = r == keep
        for o in [r, *r.children_recursive]:
            o.hide_render = not vis


def render_icons():
    tools.build()
    cam = setup(256, 48)
    roots = [o for o in bpy.context.scene.objects if o.parent is None and o.name.startswith("Tool_")]
    os.makedirs(os.path.join(PUBLIC, "icons"), exist_ok=True)
    for r in roots:
        isolate(roots, r)
        r.rotation_euler = (math.radians(-18), math.radians(28), math.radians(20))
        bpy.context.view_layer.update()
        mn, mx = bbox(r)
        c = (mn + mx) / 2
        size = max(mx - mn) * 1.18
        frame(cam, c, size, (0.25, -1, 0.2))
        bpy.context.scene.render.filepath = os.path.join(PUBLIC, "icons", TOOL_ICONS[r.name] + ".png")
        bpy.ops.render.render(write_still=True)
        print("icon", r.name)


def render_portraits():
    people.build()
    cam = setup(256, 48)
    roots = [o for o in bpy.context.scene.objects if o.parent is None and o.name.startswith("Person_")]
    os.makedirs(os.path.join(PUBLIC, "portraits"), exist_ok=True)
    for r in roots:
        isolate(roots, r)
        head = next(o for o in r.children_recursive if o.name.startswith("Head"))
        bpy.context.view_layer.update()
        hp = head.matrix_world.translation
        c = hp + Vector((0, 0, 0.19))
        frame(cam, c, 0.62, (0.35, -1, 0.12), ortho=False, lens=85)
        bpy.context.scene.render.filepath = os.path.join(PUBLIC, "portraits", r.name.replace("Person_", "") + ".png")
        bpy.ops.render.render(write_still=True)
        print("portrait", r.name)


if __name__ == "__main__":
    render_icons()
    render_portraits()
