"""
Network Zoo — фигурки животных, ассоциирующихся с сетевыми протоколами,
для 3D-печати. Модели строятся процедурно в Blender.

Запуск (любой из вариантов):
    blender -b -P blender/network_zoo.py -- --out .
    python3 blender/network_zoo.py --out .          # с модулем bpy из pip

Опции:
    --out DIR        куда писать stl/, previews/ и network_zoo.blend
    --only a,b       собрать только перечисленных животных (ключи из ZOO)
    --voxel MM       размер вокселя при сшивке деталей (по умолчанию 0.25 мм)
    --faces N        целевое число треугольников в STL (по умолчанию 90000)
    --render         отрендерить превью (Cycles, CPU)
    --no-blend       не сохранять .blend

Единицы: 1 единица Blender = 1 мм. Модель стоит на подставке, нижняя
грань подставки лежит ровно в z = 0, животное смотрит в -Y.
"""

import argparse
import math
import os
import struct
import sys

import bpy  # bpy первым: в pip-сборке bmesh/mathutils появляются после него
import bmesh
from mathutils import Euler, Matrix, Vector

PLINTH_TOP = 4.0     # высота подставки, мм
TEXT_SIZE = 8.0      # высота букв на подставке, мм
TEXT_RAISE = 1.0     # насколько буквы выступают над подставкой, мм
RELIEF = 1.0         # высота рельефных узоров на подставке (паутина, эхо)


# ---------------------------------------------------------------------------
# Построитель: складывает примитивы в один bmesh, потом всё сшивается вокселями
# ---------------------------------------------------------------------------

def spline(points, n):
    """Catmull-Rom через контрольные точки, n отрезков на участок."""
    pts = [Vector(p) for p in points]
    ext = [pts[0] + (pts[0] - pts[1])] + pts + [pts[-1] + (pts[-1] - pts[-2])]
    out = []
    for i in range(1, len(ext) - 2):
        p0, p1, p2, p3 = ext[i - 1], ext[i], ext[i + 1], ext[i + 2]
        for k in range(n):
            t = k / n
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t
                              + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t
                              + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    out.append(pts[-1])
    return out


def rot_matrix(rot):
    return Euler([math.radians(a) for a in rot]).to_matrix().to_4x4()


class Builder:
    def __init__(self):
        self.bm = bmesh.new()
        self.cutters = []   # bmesh-тела, вычитаются после сшивки (гравировка)
        self.unions = []    # bmesh-тела, добавляются булевой операцией (чёткий текст)

    # --- базовые тела -------------------------------------------------------
    def ellipsoid(self, c, r, rot=(0, 0, 0), segs=40):
        if isinstance(r, (int, float)):
            r = (r, r, r)
        m = Matrix.Translation(c) @ rot_matrix(rot) @ Matrix.Diagonal((*r, 1.0))
        bmesh.ops.create_uvsphere(self.bm, u_segments=segs, v_segments=segs // 2,
                                  radius=1.0, matrix=m)

    def ellipsoid_m(self, matrix, segs=40):
        bmesh.ops.create_uvsphere(self.bm, u_segments=segs, v_segments=segs // 2,
                                  radius=1.0, matrix=matrix)

    def cone(self, p, q, r1, r2, segs=24, bm=None):
        p, q = Vector(p), Vector(q)
        d = q - p
        rot = Vector((0, 0, 1)).rotation_difference(d.normalized()).to_matrix().to_4x4()
        m = Matrix.Translation((p + q) / 2) @ rot
        bmesh.ops.create_cone(bm or self.bm, cap_ends=True, cap_tris=False, segments=segs,
                              radius1=r1, radius2=r2, depth=d.length, matrix=m)

    def capsule(self, p, q, r1, r2=None):
        r2 = r1 if r2 is None else r2
        self.cone(p, q, r1, r2)
        self.ellipsoid(p, r1, segs=24)
        self.ellipsoid(q, r2, segs=24)

    def tube(self, points, r1, r2, n=8, closed=False):
        s = spline(points, n) if not closed else [Vector(p) for p in points] + [Vector(points[0])]
        count = len(s)
        for i in range(count - 1):
            ra = r1 + (r2 - r1) * i / (count - 1)
            rb = r1 + (r2 - r1) * (i + 1) / (count - 1)
            self.cone(s[i], s[i + 1], ra, rb, segs=20)
            self.ellipsoid(s[i], ra, segs=20)
        self.ellipsoid(s[-1], r2, segs=20)

    def box(self, c, size, rot=(0, 0, 0), bm=None):
        m = Matrix.Translation(c) @ rot_matrix(rot) @ Matrix.Diagonal((*size, 1.0))
        bmesh.ops.create_cube(bm or self.bm, size=1.0, matrix=m)

    def plate(self, pts2d, origin, u, v, thickness, bm=None):
        """Плоский многоугольник в плоскости (u, v), выдавленный на thickness."""
        bm = bm or self.bm
        origin, u, v = Vector(origin), Vector(u).normalized(), Vector(v).normalized()
        n = u.cross(v).normalized() * (thickness / 2)
        front = [bm.verts.new(origin + u * x + v * y + n) for x, y in pts2d]
        back = [bm.verts.new(origin + u * x + v * y - n) for x, y in pts2d]
        faces = [bm.faces.new(front), bm.faces.new(list(reversed(back)))]
        k = len(pts2d)
        for i in range(k):
            j = (i + 1) % k
            faces.append(bm.faces.new((front[j], front[i], back[i], back[j])))
        bmesh.ops.recalc_face_normals(bm, faces=faces)
        bmesh.ops.triangulate(bm, faces=faces)

    # --- рельеф на подставке ------------------------------------------------
    def bar(self, a, b, width=1.2, height=RELIEF):
        """Рельефная полоска на верхней грани подставки между точками (x, y)."""
        a, b = Vector((*a, 0)), Vector((*b, 0))
        d = b - a
        ang = math.degrees(math.atan2(d.y, d.x))
        c = (a + b) / 2
        self.box((c.x, c.y, PLINTH_TOP + height / 2 - 0.4),
                 (d.length + width, width, height + 0.4), rot=(0, 0, ang))

    def arc(self, center, radius, a0, a1, width=1.4, height=RELIEF, steps=24):
        """Рельефная дуга на подставке (углы в градусах, 0 = +X)."""
        outer, inner = [], []
        for i in range(steps + 1):
            a = math.radians(a0 + (a1 - a0) * i / steps)
            outer.append((center[0] + (radius + width / 2) * math.cos(a),
                          center[1] + (radius + width / 2) * math.sin(a)))
            inner.append((center[0] + (radius - width / 2) * math.cos(a),
                          center[1] + (radius - width / 2) * math.sin(a)))
        self.plate(outer + list(reversed(inner)), (0, 0, PLINTH_TOP + (height - 0.4) / 2),
                   (1, 0, 0), (0, 1, 0), height + 0.4)

    def plinth(self, width, y_front, y_back, radius=6.0, label=None):
        """Подставка — скруглённый прямоугольник, z от -1 до PLINTH_TOP (низ срезается по z=0)."""
        x0, x1 = -width / 2, width / 2
        corners = [((x1 - radius, y_front + radius), -90),
                   ((x1 - radius, y_back - radius), 0),
                   ((x0 + radius, y_back - radius), 90),
                   ((x0 + radius, y_front + radius), 180)]
        pts = []
        for (cx, cy), start in corners:
            for i in range(9):
                a = math.radians(start + 90 * i / 8)
                pts.append((cx + radius * math.cos(a), cy + radius * math.sin(a)))
        self.plate(pts, (0, 0, (PLINTH_TOP - 1) / 2), (1, 0, 0), (0, 1, 0), PLINTH_TOP + 1)
        if label:
            self.text(label, (0, y_front + TEXT_SIZE / 2 + 3.0))

    def text(self, body, xy, size=TEXT_SIZE):
        curve = bpy.data.curves.new("label", 'FONT')
        curve.body = body
        curve.size = size
        curve.align_x = 'CENTER'
        curve.align_y = 'CENTER'
        curve.extrude = (TEXT_RAISE + 0.8) / 2
        curve.offset = 0.18          # утолщаем штрихи — тонкие буквы плохо печатаются
        curve.resolution_u = 6
        obj = bpy.data.objects.new("label", curve)
        bpy.context.scene.collection.objects.link(obj)
        obj.location = (xy[0], xy[1], PLINTH_TOP + TEXT_RAISE - curve.extrude)
        dg = bpy.context.evaluated_depsgraph_get()
        mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(dg))
        mesh.transform(obj.matrix_world)
        bm = bmesh.new()
        bm.from_mesh(mesh)
        # шрифт даёт крышки и стенки отдельными кусками — сшиваем в замкнутое тело
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
        self.unions.append(bm)
        bpy.data.objects.remove(obj)
        bpy.data.curves.remove(curve)
        bpy.data.meshes.remove(mesh)

    # --- вычитание (гравировка) ---------------------------------------------
    def cut_cylinder(self, p, q, r):
        bm = bmesh.new()
        self.cone(p, q, r, r, segs=32, bm=bm)
        self.cutters.append(bm)

    def cut_box(self, c, size, rot=(0, 0, 0)):
        bm = bmesh.new()
        self.box(c, size, rot, bm=bm)
        self.cutters.append(bm)


# ---------------------------------------------------------------------------
# Животные. T = верх подставки. Морда смотрит в -Y.
# ---------------------------------------------------------------------------

T = PLINTH_TOP


def elephant(b):
    """TCP — слон: всё помнит, доставляет надёжно и по порядку."""
    b.plinth(50, -42, 30, label="TCP")
    b.ellipsoid((0, 6, T + 21), (12.5, 17, 12.5))                 # туловище
    for x in (-7.2, 7.2):
        for y in (-4.5, 16.5):
            b.cone((x, y, T - 0.5), (x, y, T + 19), 4.9, 4.4)    # ноги-колонны
            b.ellipsoid((x, y - 0.8, T + 0.6), (5.3, 5.3, 1.8))  # ступни
    b.ellipsoid((0, -8, T + 26), (8.5, 6.5, 8.5))                  # шея
    b.ellipsoid((0, -14, T + 28.5), (9.5, 9, 9.5))                 # голова
    b.tube([(0, -20.5, T + 27), (0, -25, T + 20), (0, -26.5, T + 12),
            (0, -25, T + 5), (0, -21.5, T + 1.4)], 4.3, 2.7, n=10)  # хобот до земли
    for s in (-1, 1):
        # уши — большие диски сбоку головы, нижний край прижат к шее
        b.ellipsoid((s * 12, -8.5, T + 28), (7.5, 2.0, 9.5), rot=(0, s * 22, s * 18))
        b.ellipsoid((s * 6.2, -20, T + 31), 1.4)                   # глаза
        b.tube([(s * 4.2, -20.5, T + 23.5), (s * 5.5, -25, T + 22.5),
                (s * 6.0, -28, T + 24)], 1.8, 1.0, n=6)            # бивни
    b.tube([(0, 22, T + 26), (0, 23.6, T + 20), (0, 23.2, T + 15)], 1.5, 1.2, n=6)  # хвост
    b.ellipsoid((0, 23.4, T + 14.2), (1.8, 1.6, 2.4))


def rabbit(b):
    """UDP — кролик: быстро, без рукопожатий и подтверждений."""
    b.plinth(46, -29, 26, label="UDP")
    b.ellipsoid((0, 5, T + 11), (10.5, 12, 11.5), rot=(-15, 0, 0))  # туловище
    b.ellipsoid((0, 0, T + 18), (8, 8, 9))                          # грудь
    for s in (-1, 1):
        b.ellipsoid((s * 6.5, 9, T + 7), (5.5, 8, 7.5))             # бёдра
        b.ellipsoid((s * 7, 1, T + 1.6), (3.4, 9, 2.6))             # задние лапы
        b.capsule((s * 3.6, -5, T + 16), (s * 3.6, -8.5, T + 2), 2.5, 2.2)  # передние
        b.ellipsoid((s * 3.6, -10, T + 1.5), (2.4, 3.5, 1.9))
        b.ellipsoid((s * 3.4, -9, T + 24.5), (3.6, 3.6, 3.1))       # щёки
        b.ellipsoid((s * 4.8, -9.6, T + 28.5), 1.25)                # глаза
        b.ellipsoid((s * 3.3, -0.5, T + 40.5), (2.7, 1.8, 10.5), rot=(-10, s * 12, 0))  # уши
    b.ellipsoid((0, -5, T + 26.5), (7, 8, 7))                       # голова
    b.ellipsoid((0, -12.8, T + 26.2), (1.3, 1, 1))                  # нос
    b.ellipsoid((0, 17, T + 7), 4)                                   # хвостик
    # «потерянные» датаграммы — кубики, которые никто не ждёт обратно
    b.box((15.5, -12, T + 1.5), (4.5, 4.5, 4.5), rot=(0, 0, 25))
    b.box((-16, -4, T + 1.3), (4, 4, 4), rot=(0, 0, -15))
    b.box((15, 6, T + 1.2), (3.5, 3.5, 3.5), rot=(0, 0, 50))


def spider(b):
    """HTTP — паук: World Wide Web."""
    b.plinth(68, -46, 32, label="HTTP :80")
    # паутина на подставке
    wc, rings = (0.0, -3.0), (7, 13, 19, 25)
    spokes = [math.radians(22.5 + 45 * i) for i in range(8)]
    for a in spokes:
        b.bar(wc, (wc[0] + 27 * math.cos(a), wc[1] + 27 * math.sin(a)))
    for r in rings:
        for i in range(8):
            a, c = spokes[i], spokes[(i + 1) % 8]
            b.bar((wc[0] + r * math.cos(a), wc[1] + r * math.sin(a)),
                  (wc[0] + r * math.cos(c), wc[1] + r * math.sin(c)), width=1.0)
    # тело лежит на паутине, чтобы не нужны были поддержки
    c = Vector((0, -6, T + 4.5))
    b.ellipsoid(c, (7, 7.5, 5.5))                                   # головогрудь
    b.ellipsoid((0, 9, T + 7.5), (9.5, 11, 8.5), rot=(-15, 0, 0))   # брюшко
    b.capsule((0, -1, T + 5), (0, 2, T + 6), 3.2)
    for s in (-1, 1):
        b.ellipsoid((s * 1.7, -12.6, T + 7.4), 1.15)                # глаза
        b.ellipsoid((s * 3.9, -11.9, T + 7.6), 0.95)
        b.capsule((s * 1.8, -12, T + 3.5), (s * 1.6, -14, T + 1.5), 1.4, 1.1)  # хелицеры
        for ang in (-40, -12, 18, 55):
            a = math.radians(ang)
            d = Vector((s * math.cos(a), math.sin(a), 0))
            b.tube([c + d * 5 + Vector((0, 0, 0.5)),
                    c + d * 14 + Vector((0, 0, 10)),
                    c + d * 22 + Vector((0, 0, 7)),
                    c + d * 27.5 + Vector((0, 0, -3.2))], 2.1, 1.5, n=8)


def turtle(b):
    """SSH — черепаха: Secure SHell, всё под надёжным панцирем."""
    b.plinth(46, -44, 30, label="SSH :22")
    sc, sr = Vector((0, 3, T + 2)), Vector((16, 19, 13))
    b.ellipsoid(sc, sr, segs=64)                                    # панцирь
    b.ellipsoid((0, 3, T + 2.2), (17.5, 20.5, 2.4), segs=64)        # край панциря
    # щитки панциря — шестиугольные пластины по нормали к поверхности
    def on_shell(x, y):
        k = 1 - (x / sr.x) ** 2 - ((y - sc.y) / sr.y) ** 2
        z = sc.z + sr.z * math.sqrt(max(k, 0))
        p = Vector((x, y, z))
        n = Vector(((x - sc.x) / sr.x ** 2, (y - sc.y) / sr.y ** 2, (z - sc.z) / sr.z ** 2)).normalized()
        return p, n
    scutes = [(0, -8.5), (0, 3), (0, 14.5)] + [(s * 9.5, y) for s in (-1, 1) for y in (-6, 3.5, 13)]
    for x, y in scutes:
        p, n = on_shell(x, y)
        m = Matrix.Translation(p - n * 0.2) @ Vector((0, 0, 1)).rotation_difference(n).to_matrix().to_4x4()
        b.ellipsoid_m(m @ Matrix.Diagonal((4.6, 4.6, 1.3, 1.0)))
    # замочная скважина на центральном щитке (гравировка) — ключи SSH
    top = on_shell(0, 3)[0]
    b.cut_cylinder(top + Vector((0, -1.5, -0.6)), top + Vector((0, -1.5, 6)), 2.0)
    b.cut_box(top + Vector((0, 1.2, 2.7)), (1.9, 5.0, 6.6))
    # голова кладёт подбородок на подставку
    b.capsule((0, -14, T + 3.2), (0, -22, T + 3.8), 3.7, 3.9)
    b.ellipsoid((0, -25, T + 4.2), (4.7, 5.6, 4.6))
    for s in (-1, 1):
        b.ellipsoid((s * 3.9, -26.3, T + 6.6), 1.2)                 # глаза
        b.ellipsoid((s * 14.5, -10, T + 1.4), (6.5, 3.6, 2.2), rot=(0, 0, s * 30))  # ласты
        b.ellipsoid((s * 13.5, 15.5, T + 1.4), (5.2, 3.2, 2.1), rot=(0, 0, -s * 35))
    b.cone((0, 21, T + 1.6), (0, 26.5, T + 1.0), 2.2, 0.9)          # хвост


def owl(b):
    """DNS — сова: мудрая, знает имена всех хостов."""
    b.plinth(42, -27, 21, label="DNS :53")
    b.ellipsoid((0, 2, T + 15), (12, 11, 15.5))                     # туловище
    b.ellipsoid((0, 1.5, T + 4.5), (9.5, 9, 5.5))                    # низ туловища — устойчивость
    b.ellipsoid((0, 1, T + 31), (11.5, 10, 9.5))                    # голова
    b.ellipsoid((0, 11, T + 3.5), (5, 3.5, 5))                      # хвост
    for s in (-1, 1):
        b.cone((s * 6.5, 1.5, T + 37), (s * 9.5, 2.5, T + 44.5), 3.2, 1.0)  # перьевые «ушки»
        b.ellipsoid((s * 9.5, 2.5, T + 44.5), 1.0)
        b.ellipsoid((s * 4.6, -7.2, T + 31.5), (5.2, 2.4, 5.6))     # лицевые диски
        b.ellipsoid((s * 4.6, -9.2, T + 32), (2.7, 1.3, 2.7))       # глаза
        b.ellipsoid((s * 4.6, -10.3, T + 32), (1.3, 0.7, 1.3))      # зрачки
        b.capsule((s * 0.6, -9.6, T + 35.6), (s * 8.4, -6.5, T + 37.6), 1.0)  # брови
        b.ellipsoid((s * 10.6, 4, T + 16.5), (3, 8.5, 12.5), rot=(0, s * 8, 0))  # крылья
        for dx in (-1.6, 0, 1.6):                                    # когти
            b.capsule((s * 4 + dx * 0.5, -5, T + 1.4), (s * 4 + dx, -9.8, T + 0.9), 1.25, 1.0)
    b.cone((0, -9.4, T + 30), (0, -11.6, T + 26.8), 1.9, 0.7)       # клюв
    # перья на груди — рельефные «галочки»
    for z, xs in ((T + 21, (-4, 0, 4)), (T + 17, (-6, -2, 2, 6)), (T + 13, (-4, 0, 4))):
        for x0 in xs:
            k = 1 - (x0 / 12) ** 2 - ((z - T - 15) / 15.5) ** 2
            y = 2 - 11 * math.sqrt(max(k, 0)) + 0.3
            b.capsule((x0 - 1.6, y + 0.3, z + 1.1), (x0, y, z), 0.7)
            b.capsule((x0, y, z), (x0 + 1.6, y + 0.3, z + 1.1), 0.7)


def bat(b):
    """ICMP — летучая мышь: эхолокация = echo request / echo reply (ping)."""
    b.plinth(68, -39, 17, label="ICMP")
    # эхо-волны (ping) на подставке
    for r in (13, 18, 23):
        b.arc((0, 0), r, 212, 328, width=1.5)
    b.ellipsoid((0, 2.5, T + 9), (6, 5.5, 9.5))                     # туловище
    b.ellipsoid((0, 1, T + 21), (5.5, 5, 5))                        # голова
    b.ellipsoid((0, -3.6, T + 20), (2.6, 2.2, 2.2))                 # мордочка
    b.ellipsoid((0, -5.6, T + 20.6), (1.2, 0.8, 0.9))               # нос
    for s in (-1, 1):
        b.cone((s * 2.8, 1.5, T + 24.5), (s * 5.2, 2.0, T + 32), 2.5, 0.8)  # уши
        b.ellipsoid((s * 5.2, 2.0, T + 32), 0.8)
        b.ellipsoid((s * 2.3, -3.2, T + 22.5), 0.95)                # глаза
        b.ellipsoid((s * 2.5, -1.5, T + 1.0), (2.0, 3.0, 1.4))      # лапки
        # крыло — вертикальная пластина, слегка заведённая назад
        sweep = math.radians(15)
        u = Vector((s * math.cos(sweep), math.sin(sweep), 0))
        o = Vector((0, 2.5, T))
        tips = [(28, 34), (30, 22), (23, 12.5), (13, -0.6)]
        outline = [(3, 17), (9, 24), (16, 29), (22, 32), tips[0]]
        for (x0, y0), (x1, y1) in zip(tips, tips[1:] + [(4, 5)]):
            mx, my = (x0 + x1) / 2, (y0 + y1) / 2
            ix, iy = 3 - mx, 17 - my
            il = math.hypot(ix, iy)
            cx, cy = mx + ix / il * 1.4, my + iy / il * 1.4          # неглубокие фестоны
            for i in range(1, 9):
                t = i / 8
                outline.append(((1 - t) ** 2 * x0 + 2 * (1 - t) * t * cx + t * t * x1,
                                (1 - t) ** 2 * y0 + 2 * (1 - t) * t * cy + t * t * y1))
        b.plate(outline[:-1], o, u, (0, 0, 1), 2.2)
        # «кости» крыла — рёбра жёсткости
        P = lambda x, z: o + u * x + Vector((0, 0, z))
        b.tube([P(3, 17), P(14, 27), P(21, 30.5)], 1.7, 1.4, n=4)
        for tip in tips[:3]:
            b.capsule(P(21, 30.5), P(*tip), 1.3, 0.9)
        b.capsule(P(14, 27), P(tips[3][0], tips[3][1] + 1), 1.2, 1.0)


def pigeon(b):
    """SMTP — почтовый голубь (и RFC 1149: IP over Avian Carriers)."""
    b.plinth(48, -33, 32, label="SMTP :25")
    E = T + 2.4                                                      # верх конверта
    ang, ec = 6, 10
    b.box((0, ec, T + 1.0), (34, 32, 2.8), rot=(0, 0, ang))          # конверт
    ca, sa = math.cos(math.radians(ang)), math.sin(math.radians(ang))
    R = lambda x, y: (x * ca - (y - ec) * sa, x * sa + (y - ec) * ca + ec)
    for a, c in (((-16, 25), (0, 12)), ((0, 12), (16, 25)), ((-16, -5), (-5, 7)), ((16, -5), (5, 7))):
        pa, pc = Vector((*R(*a), 0)), Vector((*R(*c), 0))
        d = pc - pa
        mid = (pa + pc) / 2
        b.box((mid.x, mid.y, E + 0.2), (d.length, 1.1, 1.4), rot=(0, 0, math.degrees(math.atan2(d.y, d.x))))
    # голубь сидит на конверте
    b.ellipsoid((0, 5, E + 7), (7.5, 14, 7), rot=(-8, 0, 0))         # туловище
    b.ellipsoid((0, -5, E + 10), (6.8, 6.5, 7.5))                   # выпуклая грудка
    b.capsule((0, -6.5, E + 14), (0, -9, E + 19), 4.2, 3.2)          # шея
    b.ellipsoid((0, -9.5, E + 21), (3.7, 4.3, 3.7))                 # голова
    b.cone((0, -13.4, E + 20.8), (0, -16.4, E + 20), 1.15, 0.65)    # клюв
    b.ellipsoid((0, -16.4, E + 20), 0.65)
    b.ellipsoid((0, -13.2, E + 21.6), (1.2, 1.3, 0.9))              # восковица
    b.ellipsoid((0, 21, E + 2.8), (4.2, 8.5, 1.6), rot=(-12, 0, 0))  # хвост
    for s in (-1, 1):
        b.ellipsoid((s * 3.0, -10.6, E + 22), 0.95)                 # глаза
        b.ellipsoid((s * 6, 6, E + 8.5), (2.2, 11.5, 5), rot=(-10, 0, s * 3))   # сложенные крылья
        b.capsule((s * 5.5, 9, E + 10), (s * 1.6, 24, E + 5.5), 1.3, 1.0)       # концы крыльев над хвостом
        b.capsule((s * 7.3, 0, E + 10.5), (s * 6.0, 14, E + 7.5), 0.8)          # край крыла


def gopher(b):
    """Gopher — суслик-гофер, тот самый протокол Gopher (RFC 1436)."""
    b.plinth(46, -30, 24, label="GOPHER :70")
    ring = [(13 * math.cos(math.radians(a)), 2 + 13 * math.sin(math.radians(a)), T + 0.8)
            for a in range(0, 360, 12)]
    b.tube(ring, 4, 4, closed=True)                                  # край норки
    for a, r in ((35, 2.2), (150, 1.8), (250, 2.0), (310, 1.6)):     # комья земли
        b.ellipsoid((17.5 * math.cos(math.radians(a)), 2 + 17.5 * math.sin(math.radians(a)), T + 0.6), r)
    b.ellipsoid((0, 2, T + 14), (11, 10, 14))                        # туловище
    b.ellipsoid((0, -5.5, T + 12), (7, 3.5, 9))                      # животик
    b.ellipsoid((0, 0, T + 29), (9.5, 9, 8.5))                       # голова
    b.ellipsoid((0, -7.3, T + 27), (3.8, 3.2, 3.1))                  # мордочка
    b.ellipsoid((0, -10.2, T + 28.6), (1.7, 1.2, 1.3))               # нос
    for s in (-1, 1):
        b.ellipsoid((s * 5, -5.5, T + 25.5), (4.4, 4, 3.8))           # защёчные мешки
        b.box((s * 1.05, -9.3, T + 23.6), (1.9, 1.5, 3.4))            # зубы
        b.ellipsoid((s * 3.9, -7.1, T + 32), (1.45, 1.0, 1.55))      # глаза
        b.ellipsoid((s * 7.2, 1.5, T + 35.5), (2.6, 1.5, 2.4))       # уши
        b.tube([(s * 8.5, -1.5, T + 20), (s * 7.5, -7.5, T + 16), (s * 3.6, -10, T + 17.5)], 2.6, 2.2, n=6)  # лапы
        b.ellipsoid((s * 3.2, -10.6, T + 18), (2.4, 2.0, 2.0))
        b.ellipsoid((s * 5, -7.5, T + 1.2), (3, 4.5, 2))              # задние лапы


ZOO = {
    "tcp_elephant":   ("Слон",          "TCP",    elephant, (0.55, 0.60, 0.68)),
    "udp_rabbit":     ("Кролик",        "UDP",    rabbit,   (0.85, 0.80, 0.72)),
    "http_spider":    ("Паук",          "HTTP",   spider,   (0.25, 0.22, 0.28)),
    "ssh_turtle":     ("Черепаха",      "SSH",    turtle,   (0.30, 0.55, 0.32)),
    "dns_owl":        ("Сова",          "DNS",    owl,      (0.60, 0.42, 0.25)),
    "icmp_bat":       ("Летучая мышь",  "ICMP",   bat,      (0.35, 0.30, 0.42)),
    "smtp_pigeon":    ("Голубь",        "SMTP",   pigeon,   (0.55, 0.58, 0.66)),
    "gopher_gopher":  ("Суслик-гофер",  "Gopher", gopher,   (0.72, 0.55, 0.35)),
}


# ---------------------------------------------------------------------------
# Сшивка, срез низа, упрощение, проверка, экспорт
# ---------------------------------------------------------------------------

def apply_modifiers(obj):
    dg = bpy.context.evaluated_depsgraph_get()
    mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(dg))
    old = obj.data
    obj.modifiers.clear()
    obj.data = mesh
    bpy.data.meshes.remove(old)


def keep_largest_shell(obj, key):
    """Удаляет замкнутые пустоты внутри модели и случайные «острова»."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    shells, seen = [], set()
    for v in bm.verts:
        if v in seen:
            continue
        group, stack = [], [v]
        seen.add(v)
        while stack:
            cur = stack.pop()
            group.append(cur)
            for e in cur.link_edges:
                o = e.other_vert(cur)
                if o not in seen:
                    seen.add(o)
                    stack.append(o)
        faces = {f for g in group for f in g.link_faces}
        vol = sum(f.calc_center_median().dot(f.normal) * f.calc_area() for f in faces) / 3
        shells.append((vol, group))
    if len(shells) > 1:
        shells.sort(key=lambda s: s[0], reverse=True)
        print(f"[{key}] removed {len(shells) - 1} extra shell(s), volumes mm3: "
              + ", ".join(f"{s[0]:.1f}" for s in shells[1:]), flush=True)
        bmesh.ops.delete(bm, geom=[v for s in shells[1:] for v in s[1]], context='VERTS')
        bm.to_mesh(obj.data)
    bm.free()


def boolean_op(obj, cutter_bm, operation, remesh=0.0):
    me = bpy.data.meshes.new("cutter")
    cutter_bm.to_mesh(me)
    cutter_bm.free()
    cutter = bpy.data.objects.new("cutter", me)
    bpy.context.scene.collection.objects.link(cutter)
    if remesh:
        # мелкий воксель: гарантированно замкнутое тело для решателя Manifold
        mod = cutter.modifiers.new("remesh", 'REMESH')
        mod.mode = 'VOXEL'
        mod.voxel_size = remesh
        apply_modifiers(cutter)
        me = cutter.data
    mod = obj.modifiers.new("cut", 'BOOLEAN')
    mod.operation = operation
    mod.object = cutter
    mod.solver = 'MANIFOLD'
    apply_modifiers(obj)
    bpy.data.objects.remove(cutter)
    bpy.data.meshes.remove(me)


def build(key, voxel, target_faces):
    name_ru, proto, fn, color = ZOO[key]
    b = Builder()
    fn(b)
    me = bpy.data.meshes.new(key)
    b.bm.to_mesh(me)
    b.bm.free()
    obj = bpy.data.objects.new(key, me)
    bpy.context.scene.collection.objects.link(obj)

    # 1) все пересекающиеся детали → одна герметичная оболочка
    mod = obj.modifiers.new("remesh", 'REMESH')
    mod.mode = 'VOXEL'
    mod.voxel_size = voxel
    mod.adaptivity = 0.0
    apply_modifiers(obj)

    keep_largest_shell(obj, key)

    # 2) лёгкое сглаживание ступенек вокселей
    mod = obj.modifiers.new("smooth", 'SMOOTH')
    mod.factor = 0.5
    mod.iterations = 2
    apply_modifiers(obj)

    # 3) чёткий текст и гравировки
    for ubm in b.unions:
        boolean_op(obj, ubm, 'UNION', remesh=0.06)
    for cbm in b.cutters:
        boolean_op(obj, cbm, 'DIFFERENCE')
    # 4) упрощение до разумного размера STL
    tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    if tris > target_faces:
        mod = obj.modifiers.new("decimate", 'DECIMATE')
        mod.decimate_type = 'COLLAPSE'
        mod.ratio = target_faces / tris
        mod.use_collapse_triangulate = True
        apply_modifiers(obj)

    # 5) идеально плоское дно (срез по z = 0)
    bottom = bmesh.new()
    Builder.box(None, (0, 0, -50), (400, 400, 100), bm=bottom)
    boolean_op(obj, bottom, 'DIFFERENCE')

    obj.data.shade_smooth()
    obj.data.set_sharp_from_angle(angle=math.radians(35))
    mat = bpy.data.materials.new(key)
    mat.diffuse_color = (*color, 1.0)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (*color, 1.0)
        bsdf.inputs["Roughness"].default_value = 0.55
    obj.data.materials.clear()     # булевы операции оставляют пустой слот от резака
    obj.data.materials.append(mat)
    return obj


def check(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.normal_update()
    non_manifold = sum(1 for e in bm.edges if not e.is_manifold)
    # число связных оболочек
    seen, shells = set(), 0
    for v in bm.verts:
        if v.index in seen:
            continue
        shells += 1
        stack = [v]
        seen.add(v.index)
        while stack:
            cur = stack.pop()
            for e in cur.link_edges:
                o = e.other_vert(cur)
                if o.index not in seen:
                    seen.add(o.index)
                    stack.append(o)
    overhang = sum(f.calc_area() for f in bm.faces
                   if f.normal.z < -math.cos(math.radians(45)) and f.calc_center_median().z > 0.3)
    xs = [v.co.x for v in bm.verts]
    ys = [v.co.y for v in bm.verts]
    zs = [v.co.z for v in bm.verts]
    info = dict(
        tris=sum(len(f.verts) - 2 for f in bm.faces),
        non_manifold=non_manifold,
        shells=shells,
        volume_cm3=bm.calc_volume(signed=True) / 1000.0,
        size=(max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs)),
        min_z=min(zs),
        overhang_cm2=overhang / 100.0,
    )
    bm.free()
    return info


def write_stl(obj, path):
    mesh = obj.data
    mesh.calc_loop_triangles()
    verts = mesh.vertices
    with open(path, "wb") as f:
        f.write(b"Network Zoo - generated by blender/network_zoo.py".ljust(80, b" "))
        f.write(struct.pack("<I", len(mesh.loop_triangles)))
        for tri in mesh.loop_triangles:
            f.write(struct.pack("<3f", *tri.normal))
            for i in tri.vertices:
                f.write(struct.pack("<3f", *verts[i].co))
            f.write(b"\0\0")


# ---------------------------------------------------------------------------
# Превью
# ---------------------------------------------------------------------------

def setup_render(scene, res):
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 48
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = res
    scene.render.film_transparent = False
    scene.view_settings.view_transform = 'AgX'
    try:
        scene.view_settings.look = 'AgX - Medium High Contrast'
    except TypeError:
        pass
    world = scene.world or bpy.data.worlds.new("World")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.75, 0.80, 0.88, 1)
    bg.inputs["Strength"].default_value = 0.35
    if "Sun" not in bpy.data.objects:
        sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", 'SUN'))
        sun.data.energy = 2.6
        sun.data.angle = math.radians(6)
        sun.rotation_euler = Euler((math.radians(50), 0, math.radians(40)))
        scene.collection.objects.link(sun)
    if "Floor" not in bpy.data.objects:
        fm = bpy.data.meshes.new("Floor")
        fb = bmesh.new()
        bmesh.ops.create_grid(fb, x_segments=1, y_segments=1, size=3000)
        fb.to_mesh(fm)
        fb.free()
        floor = bpy.data.objects.new("Floor", fm)
        mat = bpy.data.materials.new("Floor")
        mat.use_nodes = True
        mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.55, 0.57, 0.6, 1)
        fm.materials.append(mat)
        scene.collection.objects.link(floor)


def render_view(scene, objs, path, res=(800, 800)):
    setup_render(scene, res)
    lo = Vector((min(o.location.x + min(v.co.x for v in o.data.vertices) for o in objs),
                 min(o.location.y + min(v.co.y for v in o.data.vertices) for o in objs), 0))
    hi = Vector((max(o.location.x + max(v.co.x for v in o.data.vertices) for o in objs),
                 max(o.location.y + max(v.co.y for v in o.data.vertices) for o in objs),
                 max(max(v.co.z for v in o.data.vertices) for o in objs)))
    center = (lo + hi) / 2
    radius = (hi - lo).length / 2
    cam_data = bpy.data.cameras.new("Camera")
    cam_data.lens = 70
    cam_data.clip_start, cam_data.clip_end = 1, 10000
    cam = bpy.data.objects.new("Camera", cam_data)
    scene.collection.objects.link(cam)
    direction = Vector((-0.55, -1.0, 0.62)).normalized()
    fov = 2 * math.atan(cam_data.sensor_width / 2 / cam_data.lens)
    aspect = res[0] / res[1]
    fit = fov if aspect >= 1 else 2 * math.atan(math.tan(fov / 2) * aspect)
    dist = radius / math.sin(fit / 2) * (0.92 if aspect > 1.5 else 1.02)
    cam.location = center + direction * dist
    cam.rotation_euler = (-direction).to_track_quat('-Z', 'Y').to_euler()
    scene.camera = cam
    hidden = [o for o in scene.objects if o.type == 'MESH' and o not in objs and o.name != "Floor"]
    for o in hidden:
        o.hide_render = True
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    for o in hidden:
        o.hide_render = False
    bpy.data.objects.remove(cam)
    bpy.data.cameras.remove(cam_data)


# ---------------------------------------------------------------------------

def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=".")
    ap.add_argument("--only", default="")
    ap.add_argument("--voxel", type=float, default=0.25)
    ap.add_argument("--faces", type=int, default=90000)
    ap.add_argument("--render", action="store_true")
    ap.add_argument("--no-blend", action="store_true")
    args = ap.parse_args(argv)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 0.001
    scene.unit_settings.length_unit = 'MILLIMETERS'

    keys = [k for k in ZOO if not args.only or k in args.only.split(",")]
    stl_dir = os.path.join(args.out, "stl")
    prev_dir = os.path.join(args.out, "previews")
    os.makedirs(stl_dir, exist_ok=True)

    objs = []
    for key in keys:
        obj = build(key, args.voxel, args.faces)
        info = check(obj)
        write_stl(obj, os.path.join(stl_dir, key + ".stl"))
        sx, sy, sz = info["size"]
        print(f"[{key}] {info['tris']} tris, size {sx:.1f}x{sy:.1f}x{sz:.1f} mm, "
              f"volume {info['volume_cm3']:.1f} cm3, shells {info['shells']}, "
              f"non-manifold edges {info['non_manifold']}, min z {info['min_z']:.3f}, "
              f"overhang>45deg {info['overhang_cm2']:.2f} cm2", flush=True)
        objs.append(obj)

    if args.render:
        os.makedirs(prev_dir, exist_ok=True)
        for obj in objs:
            render_view(scene, [obj], os.path.join(os.path.abspath(prev_dir), obj.name + ".png"))

    # раскладываем по сетке 4 x 2 для .blend и общего превью
    for i, obj in enumerate(objs):
        obj.location = ((i % 4) * 80 - 120, -(i // 4) * 95 + 45, 0)
    if args.render and len(objs) > 1:
        render_view(scene, objs, os.path.join(os.path.abspath(prev_dir), "lineup.png"), res=(1600, 1000))
    if not args.no_blend:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(os.path.join(args.out, "network_zoo.blend")),
                                    compress=True)


if __name__ == "__main__":
    main()
