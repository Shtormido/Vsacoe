"""Blender object / mesh helpers shared by every builder."""
import math
import bpy
import bmesh
import numpy as np
from mathutils import Vector, Matrix

_collection = None


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.objects, bpy.data.curves):
        for b in list(block):
            block.remove(b)


def set_collection(name, parent=None):
    """Objects created afterwards are linked into this collection."""
    global _collection
    col = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    par = parent or bpy.context.scene.collection
    if col.name not in par.children:
        par.children.link(col)
    _collection = col
    return col


def link(obj):
    (_collection or bpy.context.scene.collection).objects.link(obj)
    return obj


def mesh_object(name, verts, faces, mat=None, smooth=True, sharp_angle=None, mat_indices=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(map(float, v)) for v in verts], [], [tuple(map(int, f)) for f in faces])
    me.validate(clean_customdata=False)
    me.update()
    obj = bpy.data.objects.new(name, me)
    link(obj)
    if mat is not None:
        mats = mat if isinstance(mat, (list, tuple)) else [mat]
        for m in mats:
            me.materials.append(m)
        if mat_indices is not None:
            me.polygons.foreach_set("material_index", np.asarray(mat_indices, np.int32))
    if smooth:
        me.shade_smooth()
        if sharp_angle is not None:
            me.set_sharp_from_angle(angle=math.radians(sharp_angle))
    return obj


def grid_faces(n_rows, n_cols, closed_cols=False, closed_rows=False):
    """Quad faces for an (n_rows x n_cols) vertex grid stored row-major."""
    faces = []
    cols = n_cols if closed_cols else n_cols - 1
    rows = n_rows if closed_rows else n_rows - 1
    for i in range(rows):
        i2 = (i + 1) % n_rows
        for j in range(cols):
            j2 = (j + 1) % n_cols
            faces.append((i * n_cols + j, i * n_cols + j2, i2 * n_cols + j2, i2 * n_cols + j))
    return faces


def cleanup_mesh(obj, merge=1e-5, recalc=True):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=merge)
    bmesh.ops.dissolve_degenerate(bm, edges=bm.edges, dist=merge)
    if recalc:
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()


def signed_volume(obj):
    me = obj.data
    me.calc_loop_triangles()
    co = np.zeros(len(me.vertices) * 3)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    tri = np.zeros(len(me.loop_triangles) * 3, np.int32)
    me.loop_triangles.foreach_get("vertices", tri)
    tri = tri.reshape(-1, 3)
    a, b, c = co[tri[:, 0]], co[tri[:, 1]], co[tri[:, 2]]
    return float(np.sum(np.einsum("ij,ij->i", a, np.cross(b, c))) / 6.0)


def ensure_outward(obj):
    """Closed meshes: flip all faces if the enclosed volume comes out negative."""
    if signed_volume(obj) < 0:
        flip_normals(obj)


def flip_normals(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.reverse_faces(bm, faces=bm.faces)
    bm.to_mesh(obj.data)
    bm.free()


def add_mod(obj, kind, **kw):
    m = obj.modifiers.new(kind.lower(), kind)
    for k, v in kw.items():
        setattr(m, k, v)
    return m


def mirror_y(obj, merge=False):
    m = add_mod(obj, "MIRROR", use_axis=(False, True, False), use_bisect_axis=(False, False, False))
    m.use_mirror_merge = merge
    return m


def bevel(obj, width=0.004, segments=2, angle=40):
    return add_mod(obj, "BEVEL", width=width, segments=segments, limit_method="ANGLE",
                   angle_limit=math.radians(angle), harden_normals=False)


def solidify(obj, thickness=0.004, offset=-1.0):
    return add_mod(obj, "SOLIDIFY", thickness=thickness, offset=offset, use_even_offset=False)


def apply_modifiers(obj):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=True, depsgraph=dg)
    old = obj.data
    obj.modifiers.clear()
    obj.data = me
    bpy.data.meshes.remove(old)


def boolean(obj, cutter, op="DIFFERENCE", apply=True, hide_cutter=True):
    m = obj.modifiers.new("bool", "BOOLEAN")
    m.operation = op
    m.object = cutter
    m.solver = "EXACT"
    try:
        m.material_mode = "TRANSFER"
    except AttributeError:
        pass
    if apply:
        apply_modifiers(obj)
        bpy.data.objects.remove(cutter, do_unlink=True)
    elif hide_cutter:
        cutter.hide_render = True
        cutter.hide_viewport = True
    return obj


def join(objs, name=None):
    """Join objects into the first one (meshes only, modifiers applied)."""
    objs = [o for o in objs if o is not None]
    for o in objs:
        if o.modifiers:
            apply_modifiers(o)
    base = objs[0]
    bm = bmesh.new()
    mats = []
    for o in objs:
        me = o.data
        remap = []
        for m in me.materials:
            if m not in mats:
                mats.append(m)
            remap.append(mats.index(m))
        tmp = me.copy()
        tmp.transform(o.matrix_world)
        if remap:
            idx = np.zeros(len(tmp.polygons), np.int32)
            tmp.polygons.foreach_get("material_index", idx)
            idx = np.asarray(remap, np.int32)[np.clip(idx, 0, len(remap) - 1)]
            tmp.polygons.foreach_set("material_index", idx)
        bm.from_mesh(tmp)
        bpy.data.meshes.remove(tmp)
    me = bpy.data.meshes.new(name or base.name)
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(m)
    for o in objs:
        bpy.data.objects.remove(o, do_unlink=True)
    obj = bpy.data.objects.new(name or "joined", me)
    link(obj)
    return obj


def look_rotation(direction, up=(0, 0, 1)):
    """Rotation matrix whose local +Z points along `direction`."""
    z = Vector(direction).normalized()
    upv = Vector(up)
    if abs(z.dot(upv)) > 0.99:
        upv = Vector((0, 1, 0)) if abs(z.y) < 0.9 else Vector((1, 0, 0))
    x = upv.cross(z).normalized()
    y = z.cross(x)
    return Matrix((x, y, z)).transposed()


def empty(name, location=(0, 0, 0)):
    e = bpy.data.objects.new(name, None)
    e.location = location
    link(e)
    return e


def text_object(name, body, size, location, rotation, mat, extrude=0.0005, align="CENTER"):
    cu = bpy.data.curves.new(name, "FONT")
    cu.body = body
    cu.size = size
    cu.extrude = extrude
    cu.align_x = align
    cu.align_y = "CENTER"
    obj = bpy.data.objects.new(name, cu)
    obj.location = location
    obj.rotation_euler = rotation
    cu.materials.append(mat)
    link(obj)
    return obj
