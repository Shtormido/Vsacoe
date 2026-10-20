"""ZAZ-968 Coupe, modern classic (beige, round LED lamps, chrome beltline, rear-engine side vents)."""
import math
import numpy as np
from mathutils import Vector, Matrix

from carlib import curves as C, util as U, parts as P, materials as M, body as B
from carlib import details as D, wheels as W, assemble as A

NAME = "ZAZ968_Coupe"
LENGTH = 4.3

WB = 2.60
FX, RX = WB / 2, -WB / 2
TR = 0.335
TW = 0.245
TRACK_Y = 0.775


def build():
    paint = M.paint("paint_beige", (0.56, 0.46, 0.32), metallic=0.25, rough=0.28)
    chrome = M.chrome()
    black = M.black_gloss()
    satin = M.black_satin()

    rows = [
        dict(x=-2.13, zb=0.30, wb=0.66, zm=0.48, wl=0.82, zs=0.70, ws=0.81, ze=0.845, we=0.70, zt=0.86,
             lean=-0.10, bow=0.10),
        dict(x=-1.95, zb=0.25, zt=0.875, ze=0.865),
        dict(x=-1.72, lean=0.0, bow=0.0, wl=0.89, ws=0.875, zs=0.79, we=0.76),
        dict(x=-1.30, zb=0.225, wb=0.76, zm=0.50, wl=0.915, zs=0.80, ws=0.89, ze=0.885, we=0.77, zt=0.89),
        dict(x=-0.55, wl=0.895, ws=0.875),
        dict(x=0.0, wl=0.885, zs=0.80, ws=0.868, ze=0.88, we=0.765, zt=0.888),
        dict(x=0.70, zs=0.79, ze=0.865, zt=0.875),
        dict(x=1.30, wl=0.905, ws=0.875, zs=0.74, ze=0.82, we=0.745, zt=0.835),
        dict(x=1.78, lean=0.0, bow=0.0, zs=0.69, ze=0.775, zt=0.79),
        dict(x=2.14, zb=0.27, wb=0.70, zm=0.44, wl=0.84, zs=0.62, ws=0.83, ze=0.73, we=0.70, zt=0.745,
             lean=-0.14, bow=0.12),
    ]
    radii = dict(rb=0.06, rm=0.16, rs=0.07, re=0.09)
    body = B.Body(rows, radii, nose=dict(rc=0.08), tail=dict(rc=0.07))
    bo = body.build("body", paint)

    gh = B.Greenhouse([
        dict(x=0.80, zb=0.858, wb=0.75, zt=0.858, wt=0.735, zr=0.858, rr=0.03),
        dict(x=0.44, zt=1.085, wt=0.68, zr=1.10),
        dict(x=0.08, zt=1.265, wt=0.62, zr=1.305, rr=0.09),
        dict(x=-0.30, zt=1.28, wt=0.615, zr=1.318),
        dict(x=-0.75, zt=1.215, wt=0.62, zr=1.255),
        dict(x=-1.12, zt=1.105, wt=0.64, zr=1.135),
        dict(x=-1.45, zt=0.985, wt=0.67, zr=1.005),
        dict(x=-1.78, zb=0.872, wb=0.75, zt=0.872, wt=0.735, zr=0.872, rr=0.03),
    ])
    go = gh.build("greenhouse", paint)

    B.cut_body(bo, B.arch_cutters([(FX, TR, 0.37), (RX, TR, 0.37)], 0.64, 1.3, M.black_matte())
               + [B.cabin_cutter(-1.20, 0.45, 0.62, 0.30, 1.3, M.leather())])
    surf = B.Surface(bo)
    gsurf = B.Surface(go)

    # ------------------------------------------------------------ glass with chrome surrounds
    glass = (M.glass_tinted(), black)
    D.glass_area(gh, gsurf, 0.775, 0.13, 0.05, "windshield", glass)
    D.wipers(gsurf, 0.775, [-0.62, -0.08], 0.50)
    D.glass_area(gh, gsurf, -0.78, -1.66, 0.075, "backlight", glass, round_r=0.08)
    dlo = A.dlo_polygon(gh, 0.74, -1.40, 0.895, 0.045)
    D.side_windows(gsurf, dlo, [((-0.50, 0.9), (-0.58, 1.3), 0.025)], "side_glass", (M.glass_tinted(), chrome),
                   frame_w=0.012, round_r=0.05)

    # ------------------------------------------------------------ chrome beltline
    xs = np.linspace(2.06, -2.06, 70)
    zs = np.interp(xs, [-2.06, -1.3, 1.3, 2.06], [0.80, 0.795, 0.70, 0.635])
    path = []
    for x, z in zip(xs, zs):
        h = surf.ray((x, 3, z), (0, -1, 0), 6)
        if h is not None:
            n = Vector((h[1].x, h[1].y, 0)).normalized()
            path.append(tuple(h[0] + n * 0.002))
    o = P.sweep("beltline_chrome", C.ellipse(0, 0, 0.006, 0.0045, 10), path, chrome, up=(0, 0, 1))
    U.mirror_y(o)

    # ------------------------------------------------------------ panel gaps, vents, handles
    D.door_cuts(surf, [
        [(0.70, 0.30), (0.72, 0.87)],
        [(-0.55, 0.30), (-0.55, 0.87)],
        [(0.70, 0.30), (-0.55, 0.30)],
    ], "gap")
    B.strip(surf, "top", [(0.83, -0.001), (0.83, 0.68), (1.95, 0.62)], 0.004, "hood_gap", M.gap(), mirror=True)
    B.strip(surf, "top", [(-1.83, -0.001), (-1.83, 0.66), (-2.06, 0.60)], 0.004, "deck_gap", M.gap(), mirror=True)
    for k in range(6):
        z = 0.53 + k * 0.026
        B.decal(surf, "side", C.rrect(-0.92, z, 0.16, 0.012, 0.005), f"side_vent{k}", black, 0.0015, 0.004,
                mirror=True)
    B.decal(surf, "side", C.rrect(-0.92, 0.595, 0.19, 0.18, 0.02), "side_vent_frame", satin, 0.0008, 0.008,
            mirror=True)
    D.flush_handle(surf, -0.36, 0.835, "handle", chrome, w=0.12, h=0.018)
    D.side_mirror("mirror", (0.64, 0.77, 0.925), (paint, chrome, black), size=(0.12, 0.06, 0.07), yaw=0.06)

    # ------------------------------------------------------------ front
    for s in (1, -1):
        loc, nor = surf.hit("front", s * 0.64, 0.60)
        n = (nor + Vector((1.5, 0, 0))).normalized()
        D.round_lamp(f"headlamp{'R' if s > 0 else 'L'}", loc, n, 0.10, 0.06, bezel_m=chrome, bezel_w=0.012)
        B.strip(surf, "front", [(s * 0.50, 0.405), (s * 0.66, 0.405)], 0.012, f"drl{s}", chrome, offset=0.003)
        B.strip(surf, "front", [(s * 0.505, 0.405), (s * 0.655, 0.405)], 0.005, f"drl_led{s}", M.led_white(),
                offset=0.005)
    B.strip(surf, "front", [(-0.545, 0.60), (0.545, 0.60)], 0.011, "front_chrome_bar", chrome, offset=0.004)
    loc, _ = surf.hit("front", 0.0, 0.60)
    t = U.text_object("front_badge", "ЗАЗ", 0.045, (loc.x + 0.01, 0, 0.60), (math.pi / 2, 0, math.pi / 2), chrome,
                      extrude=0.003)
    t.data.space_character = 1.6
    B.decal(surf, "front", C.rrect(0.0, 0.60, 0.16, 0.05, 0.01), "badge_back", paint, 0.006, 0.006)
    loc, nor = surf.hit("front", 0.0, 0.42)
    P.plate("front_plate", (loc.x + 0.01, 0, 0.42), (1, 0, 0), "968A", mats=(M.plate_white(), black, black),
            size=(0.40, 0.11), text_size=0.07)
    B.decal(surf, "front", C.rrect(0.0, 0.29, 1.30, 0.035, 0.015), "front_lip", satin, 0.002, 0.008)
    B.decal(surf, "front", C.rrect(0.0, 0.335, 0.62, 0.035, 0.015), "front_slot", black, 0.002, 0.006)

    # ------------------------------------------------------------ rear
    for s in (1, -1):
        loc, nor = surf.hit("rear", s * 0.64, 0.665)
        n = (nor + Vector((-1, 0, 0))).normalized()
        mtx = P.oriented(loc + n * 0.004, n)
        P.torus(f"tail_ring{s}", 0.07, 0.011, M.led_red(), matrix=mtx)
        P.disc(f"tail_core{s}", 0.058, 0.006, black, matrix=mtx)
        P.disc(f"tail_dot{s}", 0.02, 0.008, M.red_off(), matrix=mtx)
        P.torus(f"tail_bezel{s}", 0.084, 0.006, chrome, matrix=mtx @ Matrix.Translation((0, 0, -0.002)))
        B.strip(surf, "rear", [(s * 0.50, 0.42), (s * 0.70, 0.42)], 0.012, f"rear_reflector{s}", M.led_red(),
                offset=0.003)
    B.strip(surf, "rear", [(-0.55, 0.665), (0.55, 0.665)], 0.012, "rear_chrome_bar", chrome, offset=0.004)
    B.decal(surf, "rear", C.rrect(0.0, 0.665, 0.17, 0.05, 0.01), "rear_badge_back", paint, 0.006, 0.006)
    loc, _ = surf.hit("rear", 0.0, 0.665)
    t = U.text_object("rear_badge", "ЗАЗ", 0.045, (loc.x - 0.01, 0, 0.665), (math.pi / 2, 0, -math.pi / 2),
                      chrome, extrude=0.003)
    t.data.space_character = 1.6
    loc, _ = surf.hit("rear", 0.0, 0.48)
    P.plate("rear_plate", (loc.x - 0.01, 0, 0.48), (-1, 0, 0), "968A", mats=(M.plate_white(), black, black),
            size=(0.40, 0.11), text_size=0.07)
    B.decal(surf, "rear", C.rrect(0.0, 0.31, 1.30, 0.04, 0.015), "rear_lip", satin, 0.002, 0.008)

    # ------------------------------------------------------------ interior
    U.set_collection("Interior", None)
    lth = M.leather("leather_tan", (0.30, 0.17, 0.08))
    for s in (1, -1):
        D.seat(f"seat_front{s}", -0.15, s * 0.35, 0.30, (lth, lth), h_back=0.58)
    D.bench("seat_rear", -0.95, 0.36, 0.52, (lth, None), h_back=0.42)
    D.dashboard("dash", 0.70, 0.38, 0.68, 0.92, 0.66, (M.black_satin(), chrome),
                screens=[(0.34, 0.20, 0.08, 0.2)])
    D.steering_wheel("steer", (0.17, 0.35, 0.84), (M.leather(), chrome), r=0.18)
    D.console("console", -0.50, 0.45, 0.30, 0.55, 0.18, M.black_satin())
    U.set_collection("Car")

    # ------------------------------------------------------------ wheels: turbine dish
    holes = []
    for i in range(5):
        a = i * 2 * math.pi / 5
        arc_o = [(0.205 * math.cos(a + t), 0.205 * math.sin(a + t)) for t in np.linspace(-0.32, 0.32, 10)]
        arc_i = [(0.175 * math.cos(a + t), 0.175 * math.sin(a + t)) for t in np.linspace(0.30, -0.30, 10)]
        holes.append(C.chaikin(np.array(arc_o + arc_i), 2))

    def ring_extra(name, s, y_face, y_hub, r_out):
        return [P.torus(name + "_ring", 0.13, 0.006, M.gunmetal(), matrix=Matrix.Translation((0, 0, y_hub + 0.022))),
                P.torus(name + "_ring2", r_out - 0.01, 0.004, M.gunmetal(), matrix=Matrix.Translation((0, 0, y_face - 0.004)))]

    spec = W.WheelSpec(R=TR, W=TW, rim_d=0.483, style="disc", holes=holes, concave=0.045, rim_mat=M.alu(),
                       cap=0.06, cap_style="flat", extra=ring_extra, caliper=(0.15, 0.15, 0.16))
    W.place_wheels(NAME, spec, [(FX, TRACK_Y, TR), (RX, TRACK_Y, TR), (FX, -TRACK_Y, TR), (RX, -TRACK_Y, TR)])
