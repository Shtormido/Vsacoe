"""Export the built .blend cars into compact game packs (quantized geometry, gzip).

Usage:
    python export_game.py            # all cars from ./output/*.blend -> ./game/assets/*.bin.gz

Pack layout (little endian):
    uint32 json_length | json (utf-8, padded to 4) | binary blob
The JSON describes materials, parts (body / wheel / caliper) and byte offsets into the blob.
Coordinates are already converted to three.js space: x forward, y up, z right.
"""
import gzip
import json
import math
import os
import sys

import bpy
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
CARS = [
    ("VAZ2106_Restomod", "ВАЗ-2106 Restomod"),
    ("ZAZ968_Coupe", "ЗАЗ-968 Coupe"),
    ("LADA2107_NewGen", "LADA 2107 NG"),
    ("Nova63_Restomod", "Chevy Nova '63"),
    ("VAZ2108_2025", "ВАЗ-2108 «2025»"),
    ("ZIL111_Restomod", "ЗИЛ-111 Restomod"),
]


def to_three(v):
    v = np.asarray(v, float)
    return np.stack([v[..., 0], v[..., 2], -v[..., 1]], -1)


def decimate_ratio(tris, name):
    if "tyre" in name:
        return 0.12
    if name in ("body", "greenhouse"):
        return 0.16
    if tris > 6000:
        return 0.12
    if tris > 2000:
        return 0.3
    if tris > 800:
        return 0.6
    return 1.0


def material_desc(m):
    d = dict(name=m.name, kind="std", color=[0.5, 0.5, 0.5], metal=0.0, rough=0.5, coat=0.0,
             emissive=[0, 0, 0], estr=0.0, opacity=1.0)
    nt = m.node_tree
    p = nt.nodes.get("Principled BSDF") if nt else None
    if p is None:
        if "glass" in m.name and nt:
            tr = next((n for n in nt.nodes if n.type == "BSDF_TRANSPARENT"), None)
            tint = list(tr.inputs["Color"].default_value)[:3] if tr else [0.3, 0.3, 0.3]
            d.update(kind="glass", color=tint, rough=0.03, opacity=0.38 if tint[0] < 0.5 else 0.25)
        return d
    g = lambda k: p.inputs[k].default_value
    d["color"] = list(g("Base Color"))[:3]
    d["metal"] = float(g("Metallic"))
    d["rough"] = float(g("Roughness"))
    d["coat"] = float(g("Coat Weight"))
    es = float(g("Emission Strength"))
    if es > 0:
        d["emissive"] = list(g("Emission Color"))[:3]
        d["estr"] = es
        d["kind"] = "emit"
    if float(g("Transmission Weight")) > 0.5:
        d["kind"] = "glass"
        d["opacity"] = 0.45
    if d["coat"] > 0.5 and d["kind"] == "std":
        d["kind"] = "paint"
    if m.name == "carbon":
        d["kind"] = "carbon"
    return d


class PartBuilder:
    def __init__(self):
        self.P, self.N, self.M = [], [], []   # per-triangle-corner arrays

    def add(self, me, mat_map, xform):
        """me: evaluated mesh in world space; xform(points)->three-space local points."""
        me.calc_loop_triangles()
        nt = len(me.loop_triangles)
        if nt == 0:
            return
        loops = np.zeros(nt * 3, np.int32)
        me.loop_triangles.foreach_get("loops", loops)
        mi = np.zeros(nt, np.int32)
        me.loop_triangles.foreach_get("material_index", mi)
        lv = np.zeros(len(me.loops), np.int32)
        me.loops.foreach_get("vertex_index", lv)
        co = np.zeros(len(me.vertices) * 3)
        me.vertices.foreach_get("co", co)
        co = co.reshape(-1, 3)
        cn = np.zeros(len(me.loops) * 3)
        me.corner_normals.foreach_get("vector", cn)
        cn = cn.reshape(-1, 3)
        pts = xform(co[lv[loops]])
        nrm = to_three(cn[loops])
        mats = np.array([mat_map(i) for i in range(max(1, len(me.materials)))], np.int32)
        self.P.append(pts)
        self.N.append(nrm)
        self.M.append(np.repeat(mats[np.clip(mi, 0, len(mats) - 1)], 3))

    def pack(self, blob):
        if not self.P:
            return None
        P = np.concatenate(self.P)
        N = np.concatenate(self.N)
        Mt = np.concatenate(self.M)
        # sort triangles by material so each material is one draw group
        tri_m = Mt[0::3]
        order = np.argsort(tri_m, kind="stable")
        corner = (order[:, None] * 3 + np.arange(3)[None]).ravel()
        P, N, tri_m = P[corner], N[corner], tri_m[order]
        lo, hi = P.min(0), P.max(0)
        span = np.maximum(hi - lo, 1e-6)
        qp = np.round((P - lo) / span * 65535).astype(np.uint16)
        nn = N / (np.linalg.norm(N, axis=1, keepdims=True) + 1e-12)
        qn = np.round(nn * 127).astype(np.int8)
        key = np.concatenate([qp.view(np.uint8).reshape(-1, 6), qn.view(np.uint8).reshape(-1, 3)], 1)
        uniq, inv = np.unique(key, axis=0, return_inverse=True)
        inv = inv.ravel()
        vp = np.ascontiguousarray(uniq[:, :6]).view(np.uint16).reshape(-1, 3)
        vn = np.ascontiguousarray(uniq[:, 6:]).view(np.int8).reshape(-1, 3)
        idx32 = len(uniq) > 65535
        idx = inv.astype(np.uint32 if idx32 else np.uint16)
        groups = []
        start = 0
        for m in np.unique(tri_m):
            c = int(np.sum(tri_m == m)) * 3
            groups.append([start, c, int(m)])
            start += c
        part = dict(vcount=len(uniq), icount=len(idx), bmin=lo.tolist(), bmax=hi.tolist(), groups=groups,
                    idx32=bool(idx32))
        part["pos"] = _append(blob, vp.tobytes())
        part["nrm"] = _append(blob, vn.tobytes())
        part["idx"] = _append(blob, idx.tobytes())
        return part


def _append(blob, b):
    off = len(blob)
    blob += b
    while len(blob) % 4:
        blob += b"\0"
    return off


def decimated_mesh(obj, dg, ratio):
    ev = obj.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=False, depsgraph=dg)
    me.transform(obj.matrix_world)
    if ratio < 1.0:
        tmp = bpy.data.objects.new("tmp_dec", me)
        bpy.context.scene.collection.objects.link(tmp)
        mod = tmp.modifiers.new("dec", "DECIMATE")
        mod.ratio = ratio
        mod.use_collapse_triangulate = True
        dg.update()
        me2 = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg), depsgraph=dg)
        bpy.data.objects.remove(tmp)
        bpy.data.meshes.remove(me)
        me = me2
    if me.polygons:
        me.shade_smooth()
        if not me.has_custom_normals:
            me.set_sharp_from_angle(angle=math.radians(42))
    return me


def export_car(name, title, out_dir):
    bpy.ops.wm.open_mainfile(filepath=os.path.join(HERE, "output", f"{name}.blend"))
    for o in list(bpy.data.objects):
        if o.type in ("CAMERA", "LIGHT") or any(c.name == "Studio" for c in o.users_collection):
            bpy.data.objects.remove(o)
    dg = bpy.context.evaluated_depsgraph_get()

    materials, mat_index = [], {}

    def mat_id(m):
        if m is None:
            m = bpy.data.materials.get("paint_ivory") or bpy.data.materials[0]
        if m.name not in mat_index:
            mat_index[m.name] = len(materials)
            materials.append(material_desc(m))
        return mat_index[m.name]

    wheel_empties = sorted([o for o in bpy.data.objects if o.type == "EMPTY" and o.name.startswith(f"{name}_wheel_")],
                           key=lambda o: o.name)
    centers = [to_three(np.array(e.matrix_world.translation)) for e in wheel_empties]
    ref = wheel_empties[2]           # front right wheel: local Z points to world -Y == three +Z
    ref_c = np.array(ref.matrix_world.translation)

    def wheel_of(o):
        p = o.parent
        while p is not None:
            if p in wheel_empties:
                return p
            p = p.parent
        return None

    body, wheel, caliper = PartBuilder(), PartBuilder(), PartBuilder()
    tri_total = 0
    for o in list(bpy.data.objects):
        if o.type not in ("MESH", "FONT") or o.hide_render:
            continue
        w = wheel_of(o)
        if w is not None and w is not ref:
            continue
        ev = o.evaluated_get(dg).to_mesh()
        ev.calc_loop_triangles()
        tris = len(ev.loop_triangles)
        o.evaluated_get(dg).to_mesh_clear()
        if tris == 0:
            continue
        key = "body" if o.name == "body" else ("greenhouse" if o.name == "greenhouse" else o.name)
        me = decimated_mesh(o, dg, decimate_ratio(tris, key))
        slots = [s.material for s in o.material_slots] or [None]
        mmap = lambda i, slots=slots: mat_id(slots[min(i, len(slots) - 1)])
        if w is None:
            body.add(me, mmap, to_three)
        else:
            target = caliper if "caliper" in o.name else wheel
            target.add(me, mmap, lambda p: to_three(p - ref_c))
        tri_total += len(me.loop_triangles)
        bpy.data.meshes.remove(me)

    # low-detail whole car (all four wheels in place) for parked / background cars
    lod = PartBuilder()
    import bmesh
    bm = bmesh.new()
    lod_mats = []
    for o in list(bpy.data.objects):
        if o.type not in ("MESH", "FONT") or o.hide_render:
            continue
        ev = o.evaluated_get(dg)
        me = bpy.data.meshes.new_from_object(ev, depsgraph=dg)
        me.transform(o.matrix_world)
        slots = [sl.material for sl in o.material_slots] or [None]
        idx = np.zeros(len(me.polygons), np.int32)
        me.polygons.foreach_get("material_index", idx)
        gid = np.array([mat_id(slots[min(i, len(slots) - 1)]) for i in range(len(slots))], np.int32)
        me.polygons.foreach_set("material_index", gid[np.clip(idx, 0, len(gid) - 1)])
        bm.from_mesh(me)
        bpy.data.meshes.remove(me)
    lme = bpy.data.meshes.new("lod")
    bm.to_mesh(lme)
    bm.free()
    for d in materials:
        lme.materials.append(bpy.data.materials.get(d["name"]))
    lobj = bpy.data.objects.new("lod", lme)
    bpy.context.scene.collection.objects.link(lobj)
    lme.calc_loop_triangles()
    ratio = min(1.0, 4500 / max(1, len(lme.loop_triangles)))
    dec = lobj.modifiers.new("dec", "DECIMATE")
    dec.ratio = ratio
    dg.update()
    lme2 = bpy.data.meshes.new_from_object(lobj.evaluated_get(dg), depsgraph=dg)
    lme2.shade_smooth()
    lme2.set_sharp_from_angle(angle=math.radians(40))
    lod.add(lme2, lambda i: i, to_three)

    blob = bytearray()
    parts = {k: b.pack(blob) for k, b in (("body", body), ("wheel", wheel), ("caliper", caliper), ("lod", lod))}
    bb = parts["body"]
    tyre_r = float(max(abs(parts["wheel"]["bmin"][1]), parts["wheel"]["bmax"][1]))
    head = dict(name=name, title=title, materials=materials, parts=parts,
                wheels=[c.tolist() for c in centers], tyreRadius=tyre_r,
                length=bb["bmax"][0] - bb["bmin"][0], width=bb["bmax"][2] - bb["bmin"][2])
    js = json.dumps(head, ensure_ascii=False, separators=(",", ":")).encode()
    while len(js) % 4:
        js += b" "
    data = len(js).to_bytes(4, "little") + js + bytes(blob)
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f"{name}.bin.gz")
    with open(path, "wb") as f:
        f.write(gzip.compress(data, 9))
    print(f"{name}: {tri_total} tris, raw {len(data) / 1e6:.2f} MB, gz {os.path.getsize(path) / 1e6:.2f} MB")


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    out = os.path.join(HERE, "game", "assets")
    for name, title in CARS:
        if argv and name not in argv and not any(a in name.lower() for a in argv):
            continue
        export_car(name, title, out)
