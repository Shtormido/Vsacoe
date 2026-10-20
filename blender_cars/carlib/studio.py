"""White cyclorama studio, cameras and Cycles render helpers."""
import math
import bpy
import numpy as np
from mathutils import Vector

from . import util as U
from . import materials as M


def build_studio(floor_color=(0.82, 0.82, 0.83), world=(0.75, 0.76, 0.78), dark=False):
    if dark:
        floor_color, world = (0.16, 0.16, 0.165), (0.30, 0.30, 0.32)
    U.set_collection("Studio")
    # cyclorama: floor curving up into a back wall behind the car (on -Y side)
    prof = [(-200, 0.0)]
    R = 4.0
    for a in np.linspace(0, math.pi / 2, 16):
        prof.append((14 - R + R * math.sin(a), R - R * math.cos(a)))
    prof.append((14, 80))
    xs = np.linspace(-200, 200, 2)
    V, F = [], []
    for i, (d, z) in enumerate(prof):
        for x in xs:
            V.append((x, -d, z))
    n = len(xs)
    for i in range(len(prof) - 1):
        F.append((i * n, i * n + 1, (i + 1) * n + 1, (i + 1) * n))
    mat = M._principled("studio_floor_dark" if dark else "studio_floor", floor_color, rough=0.5)
    cyc = U.mesh_object("cyclorama", V, F, mat, smooth=True)
    U.flip_normals(cyc)
    if cyc.data.polygons[0].normal.z < 0:
        U.flip_normals(cyc)

    w = bpy.data.worlds.new("studio_world")
    w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (*world, 1)
    bg.inputs["Strength"].default_value = 0.6 if not dark else 0.45
    bpy.context.scene.world = w

    def area(name, loc, size, power, sx=None):
        ld = bpy.data.lights.new(name, "AREA")
        ld.shape = "RECTANGLE"
        ld.size = size
        ld.size_y = sx or size
        ld.energy = power
        ob = bpy.data.objects.new(name, ld)
        ob.location = loc
        ob.visible_camera = False
        U.link(ob)
        d = Vector((0, 0, 0.6)) - Vector(loc)
        ob.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
        return ob

    k = 0.6 if dark else 1.0
    area("key_top", (0.0, 0.0, 6.5), 7.0, 2600 * k, 3.0)
    area("fill_front", (7.0, 4.0, 2.5), 4.0, 900 * k)
    area("fill_rear", (-7.0, 3.0, 2.5), 4.0, 700 * k)
    area("rim_left", (0.0, -7.0, 3.0), 5.0, 500 * k)
    U.set_collection("Studio")


def camera(name, loc, target, lens=55):
    cd = bpy.data.cameras.new(name)
    cd.lens = lens
    cd.clip_start = 0.05
    cd.clip_end = 200
    ob = bpy.data.objects.new(name, cd)
    ob.location = loc
    d = Vector(target) - Vector(loc)
    ob.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    U.link(ob)
    return ob


def standard_cameras(length, height=1.4, cz=0.6):
    """Front 3/4, side, rear 3/4 and top cameras scaled to the car length."""
    s = length / 4.3
    cams = {
        "front34": camera("cam_front34", (6.2 * s, 5.4 * s, 1.55), (0.15, 0, cz), 50),
        "side": camera("cam_side", (0.0, 10.5 * s, 0.85), (0.0, 0, cz), 50),
        "rear34": camera("cam_rear34", (-6.2 * s, 5.4 * s, 1.75), (-0.15, 0, cz), 50),
        "top": camera("cam_top", (0.0, 0.0, 13.0 * s), (0.0, 0.0, 0.0), 50),
        "front": camera("cam_front", (11.0 * s, 0.0, 0.9), (0.0, 0, cz), 50),
        "rear": camera("cam_rear", (-11.0 * s, 0.0, 0.95), (0.0, 0, cz), 50),
    }
    cams["top"].rotation_euler = (0, 0, math.pi / 2)
    return cams


def setup_render(res=(1600, 900), samples=96):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    try:
        sc.cycles.denoiser = "OPENIMAGEDENOISE"
    except TypeError:
        pass
    sc.cycles.max_bounces = 8
    sc.cycles.transmission_bounces = 8
    sc.cycles.glossy_bounces = 4
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = "PNG"
    sc.view_settings.view_transform = "AgX"
    try:
        sc.view_settings.look = "AgX - Medium High Contrast"
    except TypeError:
        pass
    sc.render.film_transparent = False
    sc.view_settings.exposure = -0.9


def render(cam, path, res=None, samples=None):
    sc = bpy.context.scene
    if res:
        sc.render.resolution_x, sc.render.resolution_y = res
    if samples:
        sc.cycles.samples = samples
    sc.camera = cam
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
