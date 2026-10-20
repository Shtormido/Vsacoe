"""High-level helpers shared by the car scripts."""
import os
import bpy
import numpy as np

from . import util as U
from . import body as B
from . import studio as S


def dlo_polygon(gh, x0, x1, z_bot, top_margin=0.035, n=60):
    """Daylight-opening outline (x, z) following the greenhouse roof edge minus a margin."""
    xs = np.linspace(x0, x1, n)
    top = np.array([gh.roof_edge(x) - top_margin for x in xs])
    keep = top > z_bot + 0.015
    xs, top = xs[keep], top[keep]
    poly = [(x, z) for x, z in zip(xs, top)] + [(xs[-1], z_bot), (xs[0], z_bot)]
    return np.array(poly)


def contour_path(surface, z, x_center, a0, a1, out=0.0, n=60, radius=6.0):
    """Plan-view outline at height z (polar ray-cast around x_center), offset outward."""
    hits = B.plan_contour(surface, z, (x_center, 0.0), a0, a1, n, radius)
    return [tuple(h[0] + h[1] * out) for h in hits]


def side_path(surface, x0, x1, z, out=0.0, n=40, side=1):
    pts = []
    for h in B.side_profile(surface, np.linspace(x0, x1, n), z, side):
        if h is not None:
            nor = h[1].copy()
            nor.z = 0
            nor.normalize()
            pts.append(tuple(h[0] + nor * out))
    return pts


def organize(car_name):
    """Parent the whole car (body, parts, wheels, interior) to one root empty and name the collection."""
    root = bpy.data.objects.new(car_name, None)
    col = bpy.data.collections.get("Car")
    col.objects.link(root)
    interior = bpy.data.collections.get("Interior")
    if interior is not None:
        sc = bpy.context.scene.collection
        if interior.name in sc.children:
            sc.children.unlink(interior)
        if interior.name not in col.children:
            col.children.link(interior)
    objs = list(col.objects) + (list(interior.objects) if interior else [])
    for o in objs:
        if o is not root and o.parent is None:
            o.parent = root
    col.name = car_name
    return root


def save_and_render(car_name, out_dir, length, views=("front34", "side", "rear34"), res=(1600, 900),
                    samples=96, render=True, dark=False):
    os.makedirs(out_dir, exist_ok=True)
    U.set_collection("Studio")
    cams = S.standard_cameras(length)
    bpy.context.scene.camera = cams["front34"]
    blend = os.path.join(out_dir, f"{car_name}.blend")
    bpy.ops.wm.save_as_mainfile(filepath=blend, compress=True)
    paths = []
    if render:
        for v in views:
            p = os.path.join(out_dir, "renders", f"{car_name}_{v}.png")
            S.render(cams[v], p, res, samples)
            paths.append(p)
    return blend, paths
