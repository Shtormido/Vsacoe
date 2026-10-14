"""Общие утилиты для процедурного моделирования в Blender (bpy).

Все модели игры строятся кодом: метаболы -> воксельный ремеш -> сглаживание
для органики (животные, люди) и примитивы + фаска/сабдив для мебели и
инструментов. Результат экспортируется в GLB для Three.js.
"""
import math
import os

import bmesh
import bpy
from mathutils import Matrix, Quaternion, Vector

OUT_DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "public", "models"))


# ---------------------------------------------------------------- сцена

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.metaballs):
        for item in list(coll):
            coll.remove(item)


def link(obj, parent=None, loc=(0, 0, 0)):
    bpy.context.scene.collection.objects.link(obj)
    if parent is not None:
        obj.parent = parent
    obj.location = loc
    return obj


def empty(name, parent=None, loc=(0, 0, 0)):
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_size = 0.05
    return link(obj, parent, loc)


# ---------------------------------------------------------------- материалы

def hex_lin(h):
    h = h.lstrip("#")
    srgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb)


def mat(name, color="#ffffff", rough=0.5, metal=0.0, emit=None, emit_strength=1.0,
        alpha=1.0, coat=0.0, transmission=0.0):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*hex_lin(color), 1)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if coat:
        bsdf.inputs["Coat Weight"].default_value = coat
    if transmission:
        bsdf.inputs["Transmission Weight"].default_value = transmission
    if emit:
        bsdf.inputs["Emission Color"].default_value = (*hex_lin(emit), 1)
        bsdf.inputs["Emission Strength"].default_value = emit_strength
    if alpha < 1:
        bsdf.inputs["Alpha"].default_value = alpha
        m.surface_render_method = "BLENDED"
    return m


# ---------------------------------------------------------------- меши

def _finish(obj, smooth=True, sharp_angle=None):
    me = obj.data
    if smooth:
        me.shade_smooth()
        if sharp_angle is not None:
            me.set_sharp_from_angle(angle=math.radians(sharp_angle))
    else:
        me.shade_flat()
    return obj


def apply_modifiers(obj):
    """Применяет стек модификаторов без bpy.ops (работает в фоне)."""
    if not obj.modifiers:
        return obj
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    new_me = bpy.data.meshes.new_from_object(obj.evaluated_get(dg))
    old = obj.data
    obj.modifiers.clear()
    obj.data = new_me
    if old.users == 0:
        bpy.data.meshes.remove(old)
    return obj


def mesh_from_bm(name, bm, material=None, parent=None, loc=(0, 0, 0)):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    link(obj, parent, loc)
    if material:
        me.materials.append(material)
    return obj


def prim(kind, name, size=(1, 1, 1), loc=(0, 0, 0), rot=(0, 0, 0), material=None,
         parent=None, bevel=0.0, bevel_segs=3, subsurf=0, segments=32, rings=16,
         radius2=None, smooth=True, sharp=None, depth=1.0):
    """Примитив с размерами `size`; поворот в градусах (XYZ)."""
    bm = bmesh.new()
    if kind == "cube":
        bmesh.ops.create_cube(bm, size=1.0)
    elif kind == "sphere":
        bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=rings, radius=0.5)
    elif kind == "cyl":
        bmesh.ops.create_cone(bm, cap_ends=True, segments=segments, radius1=0.5,
                              radius2=0.5 if radius2 is None else radius2, depth=1.0)
    elif kind == "cone":
        bmesh.ops.create_cone(bm, cap_ends=True, segments=segments, radius1=0.5,
                              radius2=0.0 if radius2 is None else radius2, depth=1.0)
    elif kind == "torus":
        # size = (R, r) — основной и трубчатый радиус
        R, r = size[0], size[1]
        bm.free()
        return torus(name, R, r, loc, rot, material, parent, segments, rings)
    else:
        raise ValueError(kind)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    obj = mesh_from_bm(name, bm, material, parent, loc)
    obj.rotation_euler = [math.radians(a) for a in rot]
    if bevel:
        b = obj.modifiers.new("bevel", "BEVEL")
        b.width = bevel
        b.segments = bevel_segs
        b.limit_method = "ANGLE"
    if subsurf:
        s = obj.modifiers.new("sub", "SUBSURF")
        s.levels = subsurf
        s.render_levels = subsurf
    apply_modifiers(obj)
    return _finish(obj, smooth, sharp if sharp is not None else (40 if kind in ("cube", "cyl", "cone") else None))


def torus(name, R, r, loc=(0, 0, 0), rot=(0, 0, 0), material=None, parent=None,
          seg=32, rings=12, arc=360.0):
    bm = bmesh.new()
    verts = []
    full = abs(arc - 360) < 1e-3
    nseg = seg if full else seg + 1
    for i in range(nseg):
        a = math.radians(arc) * i / seg
        ring = []
        for j in range(rings):
            b = 2 * math.pi * j / rings
            x = (R + r * math.cos(b)) * math.cos(a)
            y = (R + r * math.cos(b)) * math.sin(a)
            z = r * math.sin(b)
            ring.append(bm.verts.new((x, y, z)))
        verts.append(ring)
    for i in range(seg if full else seg):
        a, b = verts[i], verts[(i + 1) % nseg]
        for j in range(rings):
            bm.faces.new((a[j], b[j], b[(j + 1) % rings], a[(j + 1) % rings]))
    obj = mesh_from_bm(name, bm, material, parent, loc)
    obj.rotation_euler = [math.radians(v) for v in rot]
    return _finish(obj)


def tube(name, points, radius, material=None, parent=None, loc=(0, 0, 0), sides=12,
         radius_end=None, cap=True):
    """Трубка вдоль ломаной (провода, шланги, ручки)."""
    bm = bmesh.new()
    pts = [Vector(p) for p in points]
    rings = []
    n = len(pts)
    prev_side = None
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized()
        if prev_side is None:
            up = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((1, 0, 0))
            side = t.cross(up).normalized()
        else:
            side = (prev_side - t * prev_side.dot(t)).normalized()
        prev_side = side
        up2 = t.cross(side).normalized()
        rr = radius if radius_end is None else radius + (radius_end - radius) * i / (n - 1)
        ring = []
        for j in range(sides):
            a = 2 * math.pi * j / sides
            ring.append(bm.verts.new(p + (side * math.cos(a) + up2 * math.sin(a)) * rr))
        rings.append(ring)
    for i in range(n - 1):
        for j in range(sides):
            bm.faces.new((rings[i][j], rings[i][(j + 1) % sides], rings[i + 1][(j + 1) % sides], rings[i + 1][j]))
    if cap:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
    obj = mesh_from_bm(name, bm, material, parent, loc)
    return _finish(obj)


def lathe(name, profile, material=None, parent=None, loc=(0, 0, 0), segments=40, rot=(0, 0, 0),
          subsurf=0):
    """Тело вращения вокруг Z по профилю [(r, z), ...] — бутылки, горшки, лампы."""
    bm = bmesh.new()
    rings = []
    for r, z in profile:
        ring = []
        for j in range(segments):
            a = 2 * math.pi * j / segments
            ring.append(bm.verts.new((r * math.cos(a), r * math.sin(a), z)))
        rings.append(ring)
    for i in range(len(rings) - 1):
        for j in range(segments):
            bm.faces.new((rings[i][j], rings[i][(j + 1) % segments], rings[i + 1][(j + 1) % segments], rings[i + 1][j]))
    if profile[0][0] > 1e-4:
        bm.faces.new(list(reversed(rings[0])))
    if profile[-1][0] > 1e-4:
        bm.faces.new(rings[-1])
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    obj = mesh_from_bm(name, bm, material, parent, loc)
    obj.rotation_euler = [math.radians(v) for v in rot]
    if subsurf:
        s = obj.modifiers.new("sub", "SUBSURF")
        s.levels = subsurf
        apply_modifiers(obj)
    return _finish(obj)


# ---------------------------------------------------------------- органика

class Blob:
    """Набор элементов метабола. Координаты мировые, затем меш переносится
    так, чтобы origin объекта оказался в `origin`."""

    _uid = 0

    def __init__(self):
        self.items = []

    def ball(self, co, r, stiff=2.0, neg=False):
        self.items.append(("BALL", Vector(co), r, (r, r, r), Quaternion(), stiff, neg))
        return self

    def ellipsoid(self, co, size, rot=None, stiff=2.0, neg=False):
        q = rot if isinstance(rot, Quaternion) else (Quaternion() if rot is None else
                                                   _euler_q(rot))
        self.items.append(("ELLIPSOID", Vector(co), 1.0, tuple(size), q, stiff, neg))
        return self

    def capsule(self, a, b, r, stiff=2.0, neg=False):
        a, b = Vector(a), Vector(b)
        d = b - a
        q = Vector((1, 0, 0)).rotation_difference(d.normalized()) if d.length > 1e-6 else Quaternion()
        self.items.append(("CAPSULE", (a + b) / 2, r, (d.length / 2, 0, 0), q, stiff, neg))
        return self

    def chain(self, pts, radii, stiff=2.0):
        for i in range(len(pts) - 1):
            self.capsule(pts[i], pts[i + 1], (radii[i] + radii[i + 1]) / 2, stiff)
        return self

    def build(self, name, origin=(0, 0, 0), resolution=0.01, voxel=None, smooth_iter=6,
              smooth_factor=0.6, material=None, parent=None, threshold=0.4):
        Blob._uid += 1
        fam = f"MBF{Blob._uid:04d}"
        mb = bpy.data.metaballs.new(fam)
        mb.resolution = resolution
        mb.render_resolution = resolution
        mb.threshold = threshold
        for typ, co, r, size, q, stiff, neg in self.items:
            e = mb.elements.new(type=typ)
            e.co = co
            e.radius = r
            e.stiffness = stiff
            e.use_negative = neg
            if typ == "ELLIPSOID":
                e.size_x, e.size_y, e.size_z = size
                e.radius = 1.0
            elif typ == "CAPSULE":
                e.size_x = size[0]
            e.rotation = q
        mobj = bpy.data.objects.new(fam, mb)
        bpy.context.scene.collection.objects.link(mobj)
        bpy.context.view_layer.update()
        dg = bpy.context.evaluated_depsgraph_get()
        me = bpy.data.meshes.new_from_object(mobj.evaluated_get(dg))
        bpy.data.objects.remove(mobj)
        bpy.data.metaballs.remove(mb)
        me.name = name
        me.transform(Matrix.Translation(-Vector(origin)))
        obj = bpy.data.objects.new(name, me)
        link(obj)
        if voxel:
            rm = obj.modifiers.new("remesh", "REMESH")
            rm.mode = "VOXEL"
            rm.voxel_size = voxel
            rm.adaptivity = 0.0
        if smooth_iter:
            sm = obj.modifiers.new("smooth", "SMOOTH")
            sm.factor = smooth_factor
            sm.iterations = smooth_iter
        apply_modifiers(obj)
        if material:
            obj.data.materials.append(material)
        _finish(obj)
        if parent is not None:
            obj.parent = parent
            obj.location = Vector(origin) - world_pos(parent)
        else:
            obj.location = origin
        return obj


def _euler_q(rot_deg):
    from mathutils import Euler
    return Euler([math.radians(a) for a in rot_deg]).to_quaternion()


def _world_origin(obj):
    loc = Vector((0, 0, 0))
    while obj is not None:
        loc = Matrix.Translation(obj.location) @ obj.rotation_euler.to_matrix().to_4x4() @ loc
        obj = obj.parent
    return loc.to_3d() if hasattr(loc, "to_3d") else loc


def world_pos(obj):
    """Мировая позиция origin объекта (с учётом родителей, без масштаба)."""
    m = Matrix.Identity(4)
    chain = []
    o = obj
    while o is not None:
        chain.append(o)
        o = o.parent
    for o in reversed(chain):
        m = m @ Matrix.Translation(o.location) @ o.rotation_euler.to_matrix().to_4x4()
    return m.translation.copy()


def paint_vertices(obj, fn, name="Color"):
    """Записывает цвет вершин: fn(мировая_позиция, локальная_позиция) -> (r, g, b)."""
    me = obj.data
    attr = me.color_attributes.get(name) or me.color_attributes.new(name, "FLOAT_COLOR", "POINT")
    me.color_attributes.active_color = attr
    me.color_attributes.render_color_index = me.color_attributes.active_color_index
    base = world_pos(obj)
    rot = Matrix.Identity(3)
    o = obj
    chain = []
    while o is not None:
        chain.append(o)
        o = o.parent
    for o in reversed(chain):
        rot = rot @ o.rotation_euler.to_matrix()
    for v in me.vertices:
        wp = base + rot @ v.co
        r, g, b = fn(wp, v.co)
        attr.data[v.index].color = (r, g, b, 1.0)


# ---------------------------------------------------------------- экспорт

def export(filename, render_preview=False):
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, filename)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=False,
        export_apply=True,
        export_extras=True,
        export_yup=True,
        export_vertex_color="ACTIVE",
        export_all_vertex_colors=False,
        export_image_format="NONE",
        export_draco_mesh_compression_enable=False,
    )
    size = os.path.getsize(path) / 1024
    tris = 0
    for o in bpy.context.scene.objects:
        if o.type == "MESH":
            o.data.calc_loop_triangles()
            tris += len(o.data.loop_triangles)
    print(f"  -> {filename}: {size:.0f} KB, {tris} tris")
    return path


def preview(filename, target=(0, 0, 0.3), dist=1.4, elev=18, azim=-35, size=480, samples=24):
    """Рендер превью в Cycles (для README / проверки форм)."""
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = samples
    scene.cycles.device = "CPU"
    scene.render.resolution_x = size
    scene.render.resolution_y = size
    scene.render.film_transparent = False
    world = bpy.data.worlds.new("W")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (*hex_lin("#e9e4f2"), 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.9
    scene.world = world
    cam_data = bpy.data.cameras.new("Cam")
    cam_data.lens = 50
    cam = bpy.data.objects.new("Cam", cam_data)
    scene.collection.objects.link(cam)
    t = Vector(target)
    a, e = math.radians(azim), math.radians(elev)
    cam.location = t + Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e))) * dist
    cam.rotation_euler = (t - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    sun_d = bpy.data.lights.new("Sun", "SUN")
    sun_d.energy = 3.5
    sun_d.angle = math.radians(12)
    sun = bpy.data.objects.new("Sun", sun_d)
    sun.rotation_euler = (math.radians(50), math.radians(10), math.radians(-30))
    scene.collection.objects.link(sun)
    scene.render.filepath = filename
    bpy.ops.render.render(write_still=True)
    for o in (cam, sun):
        bpy.data.objects.remove(o)
