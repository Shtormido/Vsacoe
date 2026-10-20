"""LADA 2107 "new generation" concept (graphite, big grille, L-shaped LED lamps, aero wheels)."""
import math
from mathutils import Matrix

from carlib import curves as C, util as U, parts as P, materials as M, body as B
from carlib import details as D, wheels as W, assemble as A

NAME = "LADA2107_NewGen"
LENGTH = 4.35
DARK_STUDIO = True

WB = 2.52
FX, RX = WB / 2, -WB / 2
TR = 0.34
TW = 0.255
TRACK_Y = 0.775


def grille_material():
    m = M._principled("grille_mesh", (0.02, 0.02, 0.022), rough=0.35)
    nt = m.node_tree
    if "Brick" not in nt.nodes:
        br = nt.nodes.new("ShaderNodeTexBrick")
        br.name = "Brick"
        br.inputs["Scale"].default_value = 60.0
        br.inputs["Mortar Size"].default_value = 0.06
        br.inputs["Color1"].default_value = (0.03, 0.03, 0.033, 1)
        br.inputs["Color2"].default_value = (0.025, 0.025, 0.028, 1)
        br.inputs["Mortar"].default_value = (0.0, 0.0, 0.0, 1)
        tc = nt.nodes.new("ShaderNodeTexCoord")
        mp = nt.nodes.new("ShaderNodeMapping")
        mp.inputs["Rotation"].default_value = (0, math.pi / 2, 0)
        nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
        nt.links.new(mp.outputs["Vector"], br.inputs["Vector"])
        bump = nt.nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.6
        nt.links.new(br.outputs["Fac"], bump.inputs["Height"])
        p = nt.nodes["Principled BSDF"]
        nt.links.new(br.outputs["Color"], p.inputs["Base Color"])
        nt.links.new(bump.outputs["Normal"], p.inputs["Normal"])
    return m


def build():
    paint = M.paint("paint_graphite", (0.06, 0.063, 0.068), metallic=0.5, rough=0.3, coat=0.7)
    black = M.black_gloss()
    satin = M.black_satin()
    chrome = M.chrome()

    rows = [
        dict(x=-2.24, zb=0.31, wb=0.70, zm=0.50, wl=0.85, zs=0.885, ws=0.845, ze=0.905, we=0.82, zt=0.915,
             lean=-0.03),
        dict(x=-2.05, zb=0.27, lean=0.0),
        dict(x=-1.86, wl=0.87, zm=0.50),
        dict(x=-1.70, wl=0.915, zm=0.60),
        dict(x=-0.82, wl=0.915, zm=0.60),
        dict(x=-0.66, wl=0.875, zm=0.50),
        dict(x=0.0, zb=0.235, wb=0.78, zs=0.89, ws=0.868, ze=0.905, we=0.84, zt=0.918),
        dict(x=0.62, wl=0.875, zm=0.50),
        dict(x=0.78, wl=0.915, zm=0.60),
        dict(x=1.72, wl=0.915, zm=0.60),
        dict(x=1.86, wl=0.87, zm=0.50, lean=0.0),
        dict(x=2.07, zb=0.25, wb=0.76, zs=0.86, ws=0.85, ze=0.88, we=0.825, zt=0.905, lean=-0.06, bow=0.03),
    ]
    radii = dict(rb=0.04, rm=0.10, rs=0.018, re=0.022)
    body = B.Body(rows, radii, nose=dict(rc=0.04), tail=dict(rc=0.04))
    bo = body.build("body", paint)

    gh = B.Greenhouse([
        dict(x=0.70, zb=0.895, wb=0.81, zt=0.895, wt=0.80, zr=0.895, rr=0.02),
        dict(x=0.42, zt=1.135, wt=0.74, zr=1.15),
        dict(x=0.14, zt=1.365, wt=0.68, zr=1.40, rr=0.05),
        dict(x=-0.98, zt=1.36, wt=0.68, zr=1.395, rr=0.05),
        dict(x=-1.22, zt=1.15, wt=0.72, zr=1.165),
        dict(x=-1.46, zb=0.895, wb=0.81, zt=0.895, wt=0.80, zr=0.895, rr=0.02),
    ])
    go = gh.build("greenhouse", paint)

    B.cut_body(bo, B.arch_cutters([(FX, TR, 0.372), (RX, TR, 0.372)], 0.64, 1.3, M.black_matte())
               + [B.cabin_cutter(-1.28, 0.42, 0.64, 0.30, 1.3, M.leather())])
    surf = B.Surface(bo)
    gsurf = B.Surface(go)

    glass = (M.glass_tinted(), black)
    D.glass_area(gh, gsurf, 0.675, 0.17, 0.055, "windshield", glass)
    D.wipers(gsurf, 0.675, [-0.66, -0.10], 0.52)
    D.shark_antenna(gsurf, -0.90, paint)
    D.glass_area(gh, gsurf, -1.01, -1.43, 0.06, "backlight", glass)
    dlo = A.dlo_polygon(gh, 0.64, -1.40, 0.915, 0.04)
    dlo = C.clip_halfplane(dlo, (-0.99, 1.45), (-1.04, 0.85))
    D.side_windows(gsurf, dlo, [((-0.34, 0.9), (-0.37, 1.4), 0.075)],
                   "side_glass", glass)
    # blacked-out B pillar
    B.decal(gsurf, "side", C.round_corners([(-0.31, 0.90), (-0.385, 0.90), (-0.41, 1.33), (-0.33, 1.33)], 0.01, 3),
            "b_pillar", black, 0.002, 0.008, mirror=True)

    # ------------------------------------------------------------ gaps, crease, handles
    D.door_cuts(surf, [
        [(0.60, 0.30), (0.62, 0.90)],
        [(-0.355, 0.28), (-0.355, 0.90)],
        [(-1.0, 0.90), (-1.02, 0.74), (-1.10, 0.66), (-1.20, 0.64)],
        [(0.60, 0.30), (-0.88, 0.30), (-0.90, 0.38)],
    ], "gap")
    B.strip(surf, "top", [(0.74, -0.001), (0.74, 0.74), (2.02, 0.73)], 0.004, "hood_gap", M.gap(), mirror=True)
    B.strip(surf, "top", [(-1.52, -0.001), (-1.52, 0.74), (-2.18, 0.74)], 0.004, "trunk_gap", M.gap(), mirror=True)
    for z in (0.47,):
        B.strip(surf, "side", [(1.62, z), (-1.62, z)], 0.003, "side_crease", M.gap(), offset=0.0008, mirror=True)
    for i, x in enumerate((-0.18, -0.90)):
        D.flush_handle(surf, x, 0.815, f"handle{i}", black, w=0.13, h=0.02)
    D.side_mirror("mirror", (0.52, 0.80, 0.95), (paint, chrome, black), size=(0.13, 0.065, 0.08), yaw=0.06)
    skirt = A.side_path(surf, 0.88, -0.88, 0.25, out=0.01, n=30)
    o = P.sweep("side_skirt", C.round_corners([(-0.02, -0.03), (0.03, -0.03), (0.03, 0.02), (-0.02, 0.04)], 0.008, 2),
                skirt, satin, up=(0, 0, 1))
    U.mirror_y(o)

    # ------------------------------------------------------------ front
    gr = C.round_corners([(-0.43, 0.555), (0.43, 0.555), (0.45, 0.80), (-0.45, 0.80)], 0.03, 4)
    B.decal(surf, "front", C.offset_polygon(gr, 0.014), "grille_surround", black, 0.002, 0.01)
    B.decal(surf, "front", gr, "grille", grille_material(), 0.004, 0.01)
    loc, _ = surf.hit("front", 0.0, 0.735)
    t = U.text_object("grille_badge", "LADA", 0.06, (loc.x + 0.012, 0, 0.735), (math.pi / 2, 0, math.pi / 2), chrome,
                      extrude=0.004)
    t.data.space_character = 1.15
    for s in (1, -1):
        hl = C.round_corners([(s * 0.47, 0.64), (s * 0.80, 0.665), (s * 0.80, 0.78), (s * 0.47, 0.785)], 0.015, 3)
        D.lamp_cluster(surf, "front", hl, f"headlamp{s}", black, M.glass_clear(),
                       strips=[[(s * 0.48, 0.773), (s * 0.79, 0.768)], [(s * 0.79, 0.768), (s * 0.79, 0.675)]],
                       strip_w=0.012, mirror=False)
        for k, y in enumerate((0.58, 0.69)):
            loc, nor = surf.hit("front", s * y, 0.715)
            D.round_lamp(f"projector{s}{k}", loc, (1, 0, 0), 0.032, 0.03, bezel_m=M.gunmetal(), halo=False,
                         bezel_w=0.006)
        # vertical L-intakes at bumper corners
        li = C.round_corners([(s * 0.62, 0.30), (s * 0.80, 0.30), (s * 0.80, 0.52), (s * 0.74, 0.52),
                              (s * 0.74, 0.36), (s * 0.62, 0.36)], 0.012, 3)
        B.decal(surf, "front", li, f"corner_intake{s}", grille_material(), 0.002, 0.008)
    lo_int = C.round_corners([(-0.52, 0.30), (0.52, 0.30), (0.46, 0.40), (-0.46, 0.40)], 0.02, 4)
    B.decal(surf, "front", lo_int, "lower_intake", grille_material(), 0.002, 0.01)
    loc, _ = surf.hit("front", 0.0, 0.46)
    P.plate("front_plate", (loc.x + 0.01, 0, 0.46), (1, 0, 0), "2107", mats=(M.plate_white(), black, black),
            size=(0.42, 0.11), text_size=0.075)
    lip_path = A.contour_path(surf, 0.255, 1.3, -55, 55, out=0.0, n=60)
    P.sweep("front_lip", C.round_corners([(0.0, -0.01), (0.06, -0.01), (0.07, 0.0), (0.0, 0.012)], 0.004, 2),
            lip_path, black, up=(0, 0, 1))
    # hood power bulge
    B.decal(surf, "top", C.rrect(1.35, 0.0, 1.05, 0.60, 0.2), "hood_bulge_line", M.gap(), 0.0008, 0.02)
    B.decal(surf, "top", C.rrect(1.35, 0.0, 1.04, 0.592, 0.2), "hood_bulge", paint, 0.0012, 0.02)

    # ------------------------------------------------------------ rear
    for s in (1, -1):
        tl = C.round_corners([(s * 0.50, 0.75), (s * 0.82, 0.745), (s * 0.82, 0.795), (s * 0.50, 0.79)], 0.01, 3)
        B.decal(surf, "rear", tl, f"tail_housing{s}", black, 0.002, 0.006)
        B.strip(surf, "rear", [(s * 0.52, 0.77), (s * 0.80, 0.768)], 0.016, f"tail_led{s}", M.led_red(), offset=0.004)
        B.strip(surf, "rear", [(s * 0.80, 0.70), (s * 0.80, 0.775)], 0.01, f"tail_led_v{s}", M.led_red(), offset=0.004)
    B.decal(surf, "rear", C.rrect(0.0, 0.77, 1.0, 0.05, 0.01), "tail_band", black, 0.002, 0.006)
    loc, _ = surf.hit("rear", 0.0, 0.77)
    t = U.text_object("rear_badge", "L A D A", 0.034, (loc.x - 0.008, 0, 0.77), (math.pi / 2, 0, -math.pi / 2),
                      chrome, extrude=0.002)
    loc, _ = surf.hit("rear", 0.0, 0.55)
    P.plate("rear_plate", (loc.x - 0.01, 0, 0.55), (-1, 0, 0), "2107", mats=(M.plate_white(), black, black),
            size=(0.42, 0.11), text_size=0.075)
    diff = C.round_corners([(-0.80, 0.26), (0.80, 0.26), (0.76, 0.42), (-0.76, 0.42)], 0.03, 4)
    B.decal(surf, "rear", diff, "diffuser", satin, 0.002, 0.01)
    for s in (1, -1):
        tip = C.round_corners([(s * 0.44, 0.29), (s * 0.66, 0.29), (s * 0.64, 0.36), (s * 0.46, 0.36)], 0.012, 3)
        o = B.decal(surf, "rear", tip, f"exhaust{s}", chrome, 0.006, 0.006, thickness=0.01)
        B.decal(surf, "rear", C.offset_polygon(tip, -0.01), f"exhaust_in{s}", M.black_matte(), 0.0085, 0.006)

    # ------------------------------------------------------------ interior
    U.set_collection("Interior", None)
    lth = M.leather("leather_black", (0.03, 0.03, 0.032))
    for s in (1, -1):
        D.seat(f"seat_front{s}", -0.12, s * 0.37, 0.30, (lth, M.leather("alcantara", (0.12, 0.12, 0.13))))
    D.bench("seat_rear", -0.92, 0.33, 0.58, (lth, None), h_back=0.52)
    D.dashboard("dash", 0.66, 0.36, 0.70, 0.95, 0.70, (M.black_satin(), black),
                screens=[(0.0, 0.62, 0.12, 0.2)])
    D.steering_wheel("steer", (0.16, 0.37, 0.88), (M.leather(), black), r=0.18)
    D.console("console", -0.45, 0.42, 0.30, 0.56, 0.20, M.black_satin())
    U.set_collection("Car")

    # ------------------------------------------------------------ wheels: 5-blade aero turbine
    def blade_edges(name, s, y_face, y_hub, r_out):
        return [P.torus(name + "_lipring", r_out - 0.003, 0.004, M.alu(), matrix=Matrix.Translation((0, 0, y_face)))]

    spec = W.WheelSpec(R=TR, W=TW, rim_d=0.508, style="blade", n=5, w0=0.05, w1=0.135, t=0.03, concave=0.05,
                       twist=0.55, rim_mat=M.gunmetal(), face_mat=M.gunmetal(), cap=0.04, chamfer=0.01,
                       extra=blade_edges, caliper=(0.05, 0.05, 0.05))
    W.place_wheels(NAME, spec, [(FX, TRACK_Y, TR), (RX, TRACK_Y, TR), (FX, -TRACK_Y, TR), (RX, -TRACK_Y, TR)])
