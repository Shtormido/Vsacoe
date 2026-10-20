"""ZIL-111 restomod by the STRUKOVART28 render (gloss black, hooded fenders with cyan LED arcs, tail fins)."""
import numpy as np
from mathutils import Vector, Matrix

from carlib import curves as C, util as U, parts as P, materials as M, body as B
from carlib import details as D, wheels as W, assemble as A

NAME = "ZIL111_Restomod"
LENGTH = 5.4

WB = 3.10
FX, RX = WB / 2 + 0.05, -WB / 2 + 0.05
TR = 0.36
TW = 0.255
TRACK_Y = 0.83


def build():
    paint = M.paint("paint_black", (0.006, 0.006, 0.007), metallic=0.2, rough=0.18)
    black = M.black_gloss()
    chrome = M.chrome()
    grey = M._principled("bumper_grey", (0.16, 0.16, 0.17), metallic=0.3, rough=0.35, coat=0.5)

    rows = [
        dict(x=-2.58, zb=0.38, wb=0.80, zm=0.56, wl=0.95, zs=0.90, ws=0.955, ze=1.01, we=0.93, zt=0.90,
             lean=0.05, bow=0.14, re=0.008, rs=0.02),
        dict(x=-2.30, zb=0.32, lean=0.0, ze=0.995),
        dict(x=-1.95, bow=0.0, ze=0.975, we=0.935),
        dict(x=-1.40, wl=0.985, ws=0.975, zs=0.875, ze=0.945, we=0.93, zt=0.925, re=0.02, rs=0.03),
        dict(x=0.0, zb=0.27, wb=0.86, zm=0.55, wl=0.99, zs=0.87, ws=0.978, ze=0.93, we=0.935, zt=0.935),
        dict(x=1.40, wl=0.985, ws=0.975, zs=0.86, ze=0.93, we=0.93, zt=0.92),
        dict(x=2.05, bow=0.0, lean=0.0, ze=0.925, zt=0.905),
        dict(x=2.47, zb=0.36, wb=0.82, zm=0.55, wl=0.95, zs=0.82, ws=0.95, ze=0.905, we=0.90, zt=0.86,
             lean=0.16, bow=-0.20, re=0.03),
    ]
    radii = dict(rb=0.05, rm=0.18, rs=0.035, re=0.03)
    body = B.Body(rows, radii, nose=dict(rc=0.05), tail=dict(rc=0.04))
    bo = body.build("body", paint)

    gh = B.Greenhouse([
        dict(x=0.96, zb=0.925, wb=0.88, zt=0.925, wt=0.87, zr=0.925, rr=0.02),
        dict(x=0.62, zt=1.20, wt=0.79, zr=1.215),
        dict(x=0.30, zt=1.43, wt=0.73, zr=1.465, rr=0.06),
        dict(x=-0.95, zt=1.425, wt=0.73, zr=1.46, rr=0.06),
        dict(x=-1.20, zt=1.19, wt=0.78, zr=1.205),
        dict(x=-1.46, zb=0.925, wb=0.88, zt=0.925, wt=0.87, zr=0.925, rr=0.02),
    ])
    go = gh.build("greenhouse", paint)

    B.cut_body(bo, B.arch_cutters([(FX, TR, 0.39), (RX, TR, 0.39)], 0.69, 1.4, M.black_matte())
               + [B.cabin_cutter(-1.30, 0.70, 0.67, 0.32, 1.4, M.leather())])
    surf = B.Surface(bo)
    gsurf = B.Surface(go)

    glass = (M.glass_tinted(), black)
    D.glass_area(gh, gsurf, 0.93, 0.33, 0.06, "windshield", glass)
    D.wipers(gsurf, 0.93, [-0.72, -0.12], 0.58)
    D.glass_area(gh, gsurf, -0.98, -1.43, 0.065, "backlight", glass)
    dlo = A.dlo_polygon(gh, 0.90, -1.38, 0.945, 0.045)
    dlo = C.clip_halfplane(dlo, (-0.92, 1.5), (-0.98, 0.9))
    D.side_windows(gsurf, dlo, [((-0.24, 0.94), (-0.27, 1.45), 0.075)],
                   "side_glass", glass)

    # ------------------------------------------------------------ chrome side spears
    up = A.side_path(surf, 2.52, -2.56, 0.84, out=0.002, n=80)
    o = P.sweep("spear_upper", C.ellipse(0, 0, 0.006, 0.006, 10), up, chrome, up=(0, 0, 1))
    U.mirror_y(o)
    xs = np.linspace(1.12, -2.55, 60)
    zs = np.interp(xs, [-2.55, -1.2, 0.2, 1.12], [0.60, 0.62, 0.64, 0.70])
    pts = []
    for x, z in zip(xs, zs):
        h = surf.ray((x, 3, z), (0, -1, 0), 6)
        if h is not None and h[0].y > 0.9:
            pts.append(tuple(h[0] + Vector((0, 0.002, 0))))
    o = P.sweep("spear_lower", C.ellipse(0, 0, 0.006, 0.005, 10), pts, chrome, up=(0, 0, 1))
    U.mirror_y(o)
    for k in range(6):
        x = -1.52 - k * 0.035
        B.decal(surf, "side", C.rrect(x, 0.875, 0.012, 0.06, 0.005), f"louver{k}", chrome, 0.002, 0.004,
                mirror=True)
    D.door_cuts(surf, [
        [(0.90, 0.33), (0.92, 0.93)],
        [(-0.25, 0.30), (-0.25, 0.93)],
        [(-0.98, 0.93), (-1.00, 0.80), (-1.10, 0.72), (-1.22, 0.70)],
        [(0.90, 0.33), (-0.95, 0.33), (-0.97, 0.42)],
    ], "gap")
    for i, x in enumerate((0.10, -0.80)):
        D.flush_handle(surf, x, 0.80, f"handle{i}", chrome, w=0.13, h=0.02)
    D.side_mirror("mirror", (0.82, 0.91, 0.99), (paint, chrome, black), size=(0.13, 0.06, 0.07), yaw=0.05)
    skirt = A.side_path(surf, 1.15, -1.15, 0.29, out=0.012, n=30)
    o = P.sweep("side_skirt", C.round_corners([(-0.02, -0.035), (0.035, -0.035), (0.035, 0.02), (-0.02, 0.05)],
                                                0.008, 2), skirt, grey, up=(0, 0, 1))
    U.mirror_y(o)
    B.strip(surf, "top", [(1.02, -0.001), (1.02, 0.80), (2.40, 0.74)], 0.004, "hood_gap", M.gap(), mirror=True)
    B.strip(surf, "top", [(-1.52, -0.001), (-1.52, 0.78), (-2.40, 0.78)], 0.004, "trunk_gap", M.gap(), mirror=True)

    # ------------------------------------------------------------ front
    gr = C.round_corners([(-0.62, 0.42), (0.62, 0.42), (0.64, 0.66), (-0.64, 0.66)], 0.04, 4)
    B.decal(surf, "front", C.offset_polygon(gr, 0.014), "grille_frame", chrome, 0.002, 0.01)
    B.decal(surf, "front", gr, "grille", black, 0.004, 0.01)
    for k in range(7):
        z = 0.44 + k * 0.032
        B.strip(surf, "front", [(-0.60, z), (0.60, z)], 0.007, f"grille_bar{k}", M.gunmetal(), offset=0.006)
    B.decal(surf, "front", C.rrect(0.0, 0.55, 0.05, 0.20, 0.01), "grille_emblem", chrome, 0.008, 0.005)
    for s in (1, -1):
        arc = [(0.79, 0.865), (0.865, 0.83), (0.905, 0.75), (0.90, 0.66), (0.87, 0.59), (0.83, 0.555)]
        line = C.chaikin(np.array(arc), 2, closed=False)
        path = []
        for y, z in line:
            loc, nor = surf.hit("front", s * y, z)
            if loc is not None:
                path.append(tuple(loc + nor * 0.006))
        P.tube(f"cyan_led{s}", path, 0.007, M.led_cyan())
        B.decal(surf, "front", C.rrect(s * 0.82, 0.47, 0.10, 0.03, 0.008), f"amber{s}", M.led_amber(), 0.004, 0.004)
        loc, nor = surf.hit("front", s * 0.72, 0.75)
        D.round_lamp(f"headlamp{s}", loc, (1, 0, 0), 0.05, 0.05, bezel_m=M.gunmetal(), halo=False, bezel_w=0.008)
    fb = A.contour_path(surf, 0.37, 1.8, -62, 62, out=0.045, n=70)
    P.sweep("front_bumper", C.round_corners([(-0.05, -0.07), (0.05, -0.07), (0.06, -0.04), (0.06, 0.05),
                                               (0.03, 0.07), (-0.05, 0.07)], 0.012, 3), fb, grey, up=(0, 0, 1))

    # ------------------------------------------------------------ rear
    for s in (1, -1):
        B.strip(surf, "rear", [(s * 0.91, 0.80), (s * 0.91, 0.985)], 0.035, f"fin_light{s}", M.led_red(), offset=0.004)
        B.decal(surf, "rear", C.rrect(s * 0.62, 0.76, 0.40, 0.04, 0.01), f"tail_strip{s}", M.red_off(), 0.003, 0.006)
    rb = A.contour_path(surf, 0.40, -1.9, 118, 242, out=0.045, n=70)
    P.sweep("rear_bumper", C.round_corners([(-0.05, -0.07), (0.05, -0.07), (0.06, -0.04), (0.06, 0.05),
                                              (0.03, 0.07), (-0.05, 0.07)], 0.012, 3), rb, grey, up=(0, 0, 1))
    loc, _ = surf.hit("rear", 0.0, 0.60)
    P.plate("rear_plate", (loc.x - 0.01, 0, 0.60), (-1, 0, 0), "ЗИЛ 111", mats=(M.plate_white(), black, black),
            size=(0.42, 0.11), text_size=0.065)
    for s in (1, -1):
        D.exhaust_tip(f"exhaust{s}", (loc.x - 0.06, s * 0.55, 0.30), 0.045, 0.25, chrome)

    # ------------------------------------------------------------ interior
    U.set_collection("Interior", None)
    lth = M.leather("leather_red", (0.25, 0.02, 0.02))
    for s in (1, -1):
        D.seat(f"seat_front{s}", 0.05, s * 0.40, 0.32, (lth, lth), w=0.54, sport=False)
    D.bench("seat_rear", -0.85, 0.34, 0.62, (lth, None), h_back=0.55)
    D.dashboard("dash", 0.88, 0.58, 0.72, 0.98, 0.74, (M.black_satin(), chrome), screens=[(0.0, 0.70, 0.11, 0.2)])
    D.steering_wheel("steer", (0.38, 0.40, 0.92), (M.leather(), chrome), r=0.2)
    U.set_collection("Car")

    # ------------------------------------------------------------ wheels: black aero covers with white ring
    def whitewall(name, s, y_face, y_hub, r_out):
        white = M._principled("whitewall", (0.85, 0.85, 0.85), rough=0.5)
        return [P.torus(name + "_white", r_out + 0.025, 0.006, white, matrix=Matrix.Translation((0, 0, s.W / 2 * 0.9))),
                P.torus(name + "_inner", r_out - 0.02, 0.004, M.gunmetal(), matrix=Matrix.Translation((0, 0, y_face)))]

    spec = W.WheelSpec(R=TR, W=TW, rim_d=0.483, style="cover", concave=0.02, rim_mat=M.black_gloss(),
                       face_mat=M.black_gloss(), cap=0.05, cap_style="flat", extra=whitewall,
                       caliper=(0.1, 0.1, 0.1))
    W.place_wheels(NAME, spec, [(FX, TRACK_Y, TR), (RX, TRACK_Y, TR), (FX, -TRACK_Y, TR), (RX, -TRACK_Y, TR)])
