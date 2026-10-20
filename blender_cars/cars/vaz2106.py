"""VAZ-2106 widebody restomod (ivory, quad round LED headlamps, box flares, rear wing)."""
from carlib import curves as C, util as U, parts as P, materials as M, body as B
from carlib import details as D, wheels as W, assemble as A

NAME = "VAZ2106_Restomod"
LENGTH = 4.25
DARK_STUDIO = False

WB = 2.424
FX, RX = WB / 2, -WB / 2
TR = 0.325            # tyre radius
TW = 0.245            # tyre width
TRACK_Y = 0.785       # wheel centre plane


def build():
    paint = M.paint("paint_ivory", (0.50, 0.44, 0.31), metallic=0.12, rough=0.3)
    black = M.black_gloss()
    satin = M.black_satin()
    trim = M.carbon()

    # ------------------------------------------------------------ lower body
    rows = [
        dict(x=-2.12, zb=0.30, wb=0.66, zm=0.52, wl=0.785, zs=0.845, ws=0.775, ze=0.885, we=0.745, zt=0.895),
        dict(x=-1.98, zb=0.26, wl=0.80, zm=0.50),
        dict(x=-1.80, wl=0.83, zm=0.52),
        dict(x=-1.66, wl=0.935, zm=0.63),
        dict(x=-0.76, wl=0.935, zm=0.63),
        dict(x=-0.62, wl=0.83, zm=0.50),
        dict(x=0.0, zb=0.215, wb=0.74, zs=0.865, ws=0.812, ze=0.888, we=0.787, zt=0.902),
        dict(x=0.60, wl=0.83, zm=0.50),
        dict(x=0.76, wl=0.935, zm=0.63),
        dict(x=1.66, wl=0.935, zm=0.63),
        dict(x=1.80, wl=0.83, zm=0.52),
        dict(x=1.93, zb=0.215, wb=0.72, zs=0.80, ws=0.795, ze=0.828, we=0.765, zt=0.838),
    ]
    radii = dict(rb=0.05, rm=0.09, rs=0.03, re=0.03, lean=0.0, bow=0.0)
    body = B.Body(rows, radii, nose=dict(rc=0.045), tail=dict(rc=0.05))
    bo = body.build("body", paint)

    gh = B.Greenhouse([
        dict(x=0.66, zb=0.872, wb=0.755, zt=0.872, wt=0.745, zr=0.872, rr=0.02),
        dict(x=0.39, zt=1.105, wt=0.69, zr=1.115),
        dict(x=0.13, zt=1.325, wt=0.645, zr=1.355, rr=0.055),
        dict(x=-1.00, zt=1.325, wt=0.645, zr=1.352, rr=0.055),
        dict(x=-1.22, zt=1.115, wt=0.685, zr=1.125),
        dict(x=-1.46, zb=0.872, wb=0.755, zt=0.872, wt=0.745, zr=0.872, rr=0.02),
    ])
    go = gh.build("greenhouse", paint)

    B.cut_body(bo, B.arch_cutters([(FX, TR, 0.362), (RX, TR, 0.362)], 0.64, 1.3, M.black_matte())
               + [B.cabin_cutter(-1.30, 0.38, 0.62, 0.30, 1.3, M.leather())])

    surf = B.Surface(bo)
    gsurf = B.Surface(go)

    # ------------------------------------------------------------ glass
    glass = (M.glass_tinted(), black)
    D.glass_area(gh, gsurf, 0.635, 0.155, 0.055, "windshield", glass)
    D.wipers(gsurf, 0.635, [-0.62, -0.08], 0.50)
    D.glass_area(gh, gsurf, -1.03, -1.43, 0.06, "backlight", glass)
    dlo = A.dlo_polygon(gh, 0.60, -1.36, 0.905, 0.04)
    dlo = C.clip_halfplane(dlo, (-1.03, 1.4), (-1.07, 0.85))
    D.side_windows(gsurf, dlo, [((-0.36, 0.9), (-0.40, 1.3), 0.07)],
                   "side_glass", glass)
    B.decal(gsurf, "top", C.rrect(-0.42, 0, 0.62, 0.86, 0.06), "sunroof_frame", black, 0.0015, 0.02)
    D._top_cutter(C.rrect(-0.42, 0, 0.52, 0.76, 0.05), "sunroof")
    B.decal(gsurf, "top", C.rrect(-0.42, 0, 0.56, 0.80, 0.05), "sunroof", M.glass_smoke(), 0.0065, 0.02,
            thickness=0.004)

    # ------------------------------------------------------------ panel gaps
    D.door_cuts(surf, [
        [(0.575, 0.30), (0.585, 0.88)],
        [(-0.37, 0.27), (-0.37, 0.88)],
        [(-1.03, 0.88), (-1.04, 0.72), (-1.10, 0.66), (-1.16, 0.64)],
        [(0.575, 0.30), (-0.36, 0.30)],
        [(-0.385, 0.30), (-0.86, 0.30), (-0.88, 0.40)],
    ], "gap")
    B.strip(surf, "top", [(0.70, 0.71), (1.88, 0.70)], 0.004, "hood_gap", M.gap(), mirror=True)
    B.strip(surf, "top", [(0.70, -0.001), (0.70, 0.71)], 0.004, "cowl_gap", M.gap(), mirror=True)
    B.strip(surf, "top", [(-1.52, 0.70), (-2.08, 0.70)], 0.004, "trunk_gap", M.gap(), mirror=True)
    B.strip(surf, "top", [(-1.52, -0.001), (-1.52, 0.70)], 0.004, "trunk_gap2", M.gap(), mirror=True)
    for i, y in enumerate((0.20, 0.34)):
        B.decal(surf, "top", C.rrect(1.35, y, 0.30, 0.06, 0.02), f"hood_vent{i}", satin, 0.0015, 0.01,
                mirror=True)
        for k in range(5):
            B.strip(surf, "top", [(1.22 + k * 0.06, y - 0.025), (1.22 + k * 0.06, y + 0.025)], 0.006,
                    f"hood_louver{i}_{k}", black, offset=0.004, mirror=True)
    # fender vents and rear intake
    B.decal(surf, "side", C.rrect(0.73, 0.60, 0.05, 0.22, 0.02), "fender_vent", black, 0.002, 0.008,
            mirror=True)
    intake = C.round_corners([(-0.60, 0.40), (-0.70, 0.40), (-0.74, 0.78), (-0.63, 0.78)], 0.02, 4)
    B.decal(surf, "side", intake, "rear_intake", satin, 0.002, 0.008, mirror=True)
    B.decal(surf, "side", C.rrect(1.80, 0.70, 0.07, 0.025, 0.01), "side_marker", M.led_amber(), 0.003,
            0.005, mirror=True)
    B.decal(surf, "side", C.ellipse(-1.75, 0.78, 0.055, 0.055, 32), "fuel_door", M.gap(), 0.001, 0.006)
    B.decal(surf, "side", C.ellipse(-1.75, 0.78, 0.05, 0.05, 32), "fuel_door_in", paint, 0.0016, 0.006)

    # classic chrome door handles
    for i, x in enumerate((-0.22, -0.92)):
        B.decal(surf, "side", C.rrect(x, 0.815, 0.12, 0.028, 0.012), f"handle{i}", M.chrome(), 0.004, 0.005,
                thickness=0.006, mirror=True)

    # ------------------------------------------------------------ front fascia
    band = C.rrect(0.0, 0.695, 1.50, 0.185, 0.03)
    B.decal(surf, "front", C.offset_polygon(band, 0.012), "front_band_chrome", M.chrome(), 0.0015, 0.01)
    B.decal(surf, "front", band, "front_band", black, 0.003, 0.01)
    for i, y in enumerate((0.615, 0.435)):
        loc, nor = surf.hit("front", y, 0.695)
        for s in (1, -1):
            l2 = loc.copy()
            l2.y *= s
            D.round_lamp(f"headlamp{i}{'R' if s > 0 else 'L'}", l2, (1, 0, 0), 0.068, 0.05, bezel_m=M.chrome())
    for k, z in enumerate((0.735, 0.695, 0.655)):
        B.strip(surf, "front", [(-0.33, z), (0.33, z)], 0.008, f"grille_bar{k}", M.chrome(), offset=0.006)
    loc, nor = surf.hit("front", 0.0, 0.695)
    P.superellipsoid("badge", (loc.x + 0.012, 0, 0.695), (0.006, 0.03, 0.022), (0.5, 0.5), 24, 10, M.chrome())
    intake = C.round_corners([(-0.58, 0.31), (0.58, 0.31), (0.50, 0.50), (-0.50, 0.50)], 0.03, 4)
    B.decal(surf, "front", intake, "front_intake", M.black_matte(), 0.002, 0.01)
    for k in range(6):
        z = 0.335 + k * 0.03
        B.strip(surf, "front", [(-0.54 + k * 0.012, z), (0.54 - k * 0.012, z)], 0.006, f"intake_slat{k}",
                black, offset=0.004)
    for s in (1, -1):
        B.decal(surf, "front", C.round_corners([(s * 0.64, 0.30), (s * 0.76, 0.30), (s * 0.76, 0.46),
                                                (s * 0.66, 0.42)], 0.02, 3), f"side_intake{s}", satin,
                0.002, 0.008)
    B.decal(surf, "front", C.rrect(0.0, 0.24, 1.2, 0.04, 0.015), "lower_lip_dark", satin, 0.002, 0.01)
    A_front = A.contour_path(surf, 0.235, 1.2, -55, 55, out=0.0, n=70)
    lip = C.round_corners([(0.0, -0.012), (0.075, -0.012), (0.09, 0.0), (0.075, 0.008), (0.0, 0.012)], 0.004, 2)
    P.sweep("front_splitter", lip, A_front, trim, up=(0, 0, 1))

    # ------------------------------------------------------------ rear
    tl = C.rrect(0.0, 0.735, 1.46, 0.10, 0.02)
    B.decal(surf, "rear", tl, "tail_panel", black, 0.002, 0.008)
    B.strip(surf, "rear", [(-0.70, 0.735), (0.70, 0.735)], 0.014, "tail_led", M.led_red(), offset=0.004)
    for s in (1, -1):
        B.decal(surf, "rear", C.rrect(s * 0.62, 0.735, 0.20, 0.06, 0.01), f"tail_block{s}", M.red_off(),
                0.0035, 0.006)
        for k in range(4):
            B.strip(surf, "rear", [(s * (0.54 + k * 0.05), 0.715), (s * (0.54 + k * 0.05), 0.755)], 0.012,
                    f"tail_seg{s}{k}", M.led_red(), offset=0.005)
    B.decal(surf, "rear", C.offset_polygon(tl, 0.008), "tail_lens", M.glass_smoke(), 0.007, 0.01,
            thickness=0.002)
    diff = C.round_corners([(-0.70, 0.31), (0.70, 0.31), (0.66, 0.44), (-0.66, 0.44)], 0.03, 4)
    B.decal(surf, "rear", diff, "diffuser_panel", trim, 0.003, 0.01)
    loc, _ = surf.hit("rear", 0.0, 0.33)
    for k in range(-3, 4):
        P.prism(f"diffuser_fin{k}", [(0.0, 0.0), (0.22, 0.0), (0.22, 0.03), (0.0, 0.16)],
                (loc.x - 0.02, k * 0.16, 0.20), (1, 0, 0), (0, 0, 1), 0.008, trim, center=True)
    loc, nor = surf.hit("rear", 0.0, 0.54)
    P.plate("rear_plate", (loc.x - 0.012, 0, 0.54), (-1, 0, 0), "A 106 RS", mats=(M.plate_white(), black, black))
    for s in (1, -1):
        D.exhaust_tip(f"exhaust{s}", (loc.x - 0.03, s * 0.42, 0.27), 0.04, 0.15, M.chrome())
    D.wing("rear_wing", -1.92, 0.24, 0.72, 0.99, (paint, paint), thickness=0.016, aoa=-0.10,
           stands=[(0.42, 0.89)])
    # duck lip on the trunk edge
    rear_edge = A.contour_path(surf, 0.87, -1.6, 145, 215, out=-0.004, n=40)
    P.sweep("trunk_lip", [(0.0, 0.0), (0.03, 0.0), (0.0, 0.03)], rear_edge, paint, up=(0, 0, 1))

    # ------------------------------------------------------------ side skirts, mirrors
    skirt = A.side_path(surf, 0.85, -0.85, 0.24, out=0.012, n=30)
    sk = C.round_corners([(-0.02, -0.03), (0.035, -0.03), (0.035, 0.02), (-0.02, 0.05)], 0.008, 2)
    o = P.sweep("side_skirt", sk, skirt, trim, up=(0, 0, 1))
    U.mirror_y(o)
    D.side_mirror("mirror", (0.50, 0.77, 0.94), (paint, M.chrome(), black), yaw=0.08)

    # ------------------------------------------------------------ interior
    U.set_collection("Interior", None)
    leather = M.leather("leather_grey", (0.18, 0.18, 0.19))
    for s in (1, -1):
        D.seat(f"seat_front{s}", -0.12, s * 0.36, 0.30, (leather, M.black_satin()))
    D.bench("seat_rear", -0.90, 0.33, 0.56, (leather, None), h_back=0.5)
    D.dashboard("dash", 0.62, 0.32, 0.70, 0.93, 0.66, (M.black_satin(), black),
                screens=[(0.36, 0.26, 0.10, 0.25), (0.0, 0.24, 0.14, 0.35)])
    D.steering_wheel("steer", (0.12, 0.36, 0.86), (M.leather(), black), r=0.17, yoke=True)
    D.console("console", -0.45, 0.40, 0.30, 0.55, 0.20, M.black_satin())
    U.set_collection("Car")

    # ------------------------------------------------------------ wheels
    spec = W.WheelSpec(R=TR, W=TW, rim_d=0.483, style="split", n=10, w0=0.04, w1=0.022, t=0.024,
                       concave=0.035, split=0.32, rim_mat=M.alu(), cap=0.035, chamfer=0.006)
    W.place_wheels(NAME, spec, [(FX, TRACK_Y, TR), (RX, TRACK_Y, TR), (FX, -TRACK_Y, TR), (RX, -TRACK_Y, TR)])
