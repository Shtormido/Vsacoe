"""Chevy II Nova 1963 hardtop restomod (blue metallic, carbon hood, black bumpers, deep-dish wheels)."""
from carlib import curves as C, util as U, parts as P, materials as M, body as B
from carlib import details as D, wheels as W, assemble as A

NAME = "Nova63_Restomod"
LENGTH = 4.65

WB = 2.794
FX, RX = WB / 2 + 0.02, -WB / 2 + 0.02
TR = 0.335
TW = 0.255
TRACK_Y = 0.765


def build():
    paint = M.paint("paint_blue", (0.025, 0.075, 0.17), metallic=0.6, rough=0.28)
    black = M.black_gloss()
    satin = M.black_satin()
    chrome = M.chrome()
    carbon = M.carbon()

    rows = [
        dict(x=-2.36, zb=0.36, wb=0.70, zm=0.52, wl=0.84, zs=0.80, ws=0.835, ze=0.835, we=0.80, zt=0.845,
             lean=0.04),
        dict(x=-2.15, zb=0.30, lean=0.0),
        dict(x=-1.80, wl=0.875, zm=0.52),
        dict(x=-1.35, wl=0.885, zm=0.55, ws=0.875),
        dict(x=0.0, zb=0.26, wb=0.78, zm=0.53, wl=0.88, zs=0.825, ws=0.872, ze=0.85, we=0.835, zt=0.858),
        dict(x=1.40, wl=0.885, ws=0.875, zs=0.80, ze=0.83, zt=0.845),
        dict(x=1.95, wl=0.875, lean=0.0),
        dict(x=2.26, zb=0.36, wb=0.72, zm=0.50, wl=0.845, zs=0.77, ws=0.84, ze=0.80, we=0.80, zt=0.815,
             lean=-0.04, bow=0.05),
    ]
    radii = dict(rb=0.05, rm=0.14, rs=0.025, re=0.02)
    body = B.Body(rows, radii, nose=dict(rc=0.05), tail=dict(rc=0.05))
    bo = body.build("body", paint)

    gh = B.Greenhouse([
        dict(x=0.56, zb=0.84, wb=0.80, zt=0.84, wt=0.79, zr=0.84, rr=0.02),
        dict(x=0.26, zt=1.06, wt=0.72, zr=1.07),
        dict(x=-0.05, zt=1.27, wt=0.66, zr=1.30, rr=0.05),
        dict(x=-1.10, zt=1.265, wt=0.66, zr=1.295, rr=0.05),
        dict(x=-1.36, zt=1.07, wt=0.71, zr=1.08),
        dict(x=-1.62, zb=0.845, wb=0.80, zt=0.845, wt=0.79, zr=0.845, rr=0.02),
    ])
    go = gh.build("greenhouse", paint)

    B.cut_body(bo, B.arch_cutters([(FX, TR, 0.365), (RX, TR, 0.365)], 0.63, 1.3, M.black_matte())
               + [B.cabin_cutter(-1.35, 0.30, 0.61, 0.32, 1.3, M.leather())])
    surf = B.Surface(bo)
    gsurf = B.Surface(go)

    glass = (M.glass_tinted(), chrome)
    D.glass_area(gh, gsurf, 0.535, 0.0, 0.05, "windshield", glass, frame_w=0.014)
    D.wipers(gsurf, 0.535, [-0.66, -0.10], 0.52)
    D.glass_area(gh, gsurf, -1.13, -1.60, 0.05, "backlight", glass, frame_w=0.014)
    dlo = A.dlo_polygon(gh, 0.50, -1.50, 0.86, 0.035)
    D.side_windows(gsurf, dlo, [((-0.42, 0.86), (-0.46, 1.3), 0.012)], "side_glass", glass, frame_w=0.012,
                   round_r=0.04)

    # ------------------------------------------------------------ carbon hood + gaps
    hood = C.round_corners([(0.62, -0.74), (2.18, -0.70), (2.18, 0.70), (0.62, 0.74)], 0.05, 4)
    B.decal(surf, "top", hood, "carbon_hood", carbon, 0.0015, 0.02)
    B.decal(surf, "top", C.rrect(1.15, 0.0, 0.55, 0.36, 0.06), "hood_scoop_base", carbon, 0.004, 0.015)
    D.door_cuts(surf, [
        [(0.50, 0.32), (0.52, 0.84)],
        [(-0.62, 0.30), (-0.62, 0.84)],
        [(0.50, 0.32), (-0.62, 0.32)],
    ], "gap")
    B.strip(surf, "top", [(-1.66, -0.001), (-1.66, 0.72), (-2.30, 0.72)], 0.004, "trunk_gap", M.gap(), mirror=True)
    # side spear trim
    side = A.side_path(surf, 2.18, -2.30, 0.72, out=0.002, n=60)
    o = P.sweep("side_trim", C.ellipse(0, 0, 0.005, 0.004, 8), side, chrome, up=(0, 0, 1))
    U.mirror_y(o)
    D.flush_handle(surf, -0.45, 0.79, "handle", chrome, w=0.12, h=0.022)
    D.side_mirror("mirror", (0.46, 0.80, 0.90), (paint, chrome, black), size=(0.12, 0.06, 0.07), yaw=0.04)
    B.decal(surf, "side", C.rrect(1.72, 0.68, 0.16, 0.035, 0.01), "fender_badge", chrome, 0.003, 0.004,
            mirror=True)

    # ------------------------------------------------------------ front
    gr = C.rrect(0.0, 0.62, 1.16, 0.20, 0.025)
    B.decal(surf, "front", C.offset_polygon(gr, 0.012), "grille_frame", chrome, 0.002, 0.01)
    B.decal(surf, "front", gr, "grille", black, 0.004, 0.01)
    for k in range(6):
        z = 0.54 + k * 0.032
        B.strip(surf, "front", [(-0.56, z), (0.56, z)], 0.006, f"grille_bar{k}", satin, offset=0.006)
    B.decal(surf, "front", C.rrect(0.0, 0.62, 0.13, 0.05, 0.012), "grille_emblem", chrome, 0.008, 0.005)
    for s in (1, -1):
        loc, nor = surf.hit("front", s * 0.70, 0.635)
        B.decal(surf, "front", C.ellipse(s * 0.70, 0.635, 0.105, 0.105, 40), f"lamp_bucket{s}", black, 0.002, 0.008)
        D.round_lamp(f"headlamp{s}", loc, (1, 0, 0), 0.085, 0.06, bezel_m=chrome, bezel_w=0.012, recess=-0.004)
    fb = A.contour_path(surf, 0.43, 1.4, -62, 62, out=0.045, n=70)
    P.sweep("front_bumper", C.round_corners([(-0.05, -0.07), (0.035, -0.07), (0.05, -0.05), (0.05, 0.06),
                                               (0.03, 0.075), (-0.05, 0.075)], 0.012, 3), fb, black,
            up=(0, 0, 1))
    loc, _ = surf.hit("front", 0.0, 0.43)
    P.plate("front_plate", (loc.x + 0.10, 0, 0.43), (1, 0, 0), "NOVA 63", mats=(M.plate_white(), black, black),
            size=(0.30, 0.15), text_size=0.05)
    B.decal(surf, "front", C.rrect(0.0, 0.33, 1.25, 0.05, 0.02), "front_valance", satin, 0.002, 0.01)

    # ------------------------------------------------------------ rear
    for s in (1, -1):
        tl = C.rrect(s * 0.73, 0.64, 0.13, 0.13, 0.015)
        B.decal(surf, "rear", C.offset_polygon(tl, 0.008), f"tail_bezel{s}", chrome, 0.002, 0.006)
        B.decal(surf, "rear", tl, f"tail_lens{s}", M.red_off(), 0.004, 0.006)
        B.decal(surf, "rear", C.rrect(s * 0.73, 0.64, 0.09, 0.09, 0.012), f"tail_led{s}", M.led_red(), 0.0055, 0.006)
    B.decal(surf, "rear", C.rrect(0.0, 0.64, 1.18, 0.10, 0.015), "rear_panel", black, 0.002, 0.008)
    B.strip(surf, "rear", [(-0.58, 0.64), (0.58, 0.64)], 0.008, "rear_panel_bar", chrome, offset=0.004)
    rb = A.contour_path(surf, 0.43, -1.5, 118, 242, out=0.045, n=70)
    P.sweep("rear_bumper", C.round_corners([(-0.05, -0.07), (0.035, -0.07), (0.05, -0.05), (0.05, 0.06),
                                              (0.03, 0.075), (-0.05, 0.075)], 0.012, 3), rb, black, up=(0, 0, 1))
    loc, _ = surf.hit("rear", 0.0, 0.53)
    P.plate("rear_plate", (loc.x - 0.008, 0, 0.535), (-1, 0, 0), "NOVA 63", mats=(M.plate_white(), black, black),
            size=(0.30, 0.15), text_size=0.05)
    for s in (1, -1):
        D.exhaust_tip(f"exhaust{s}", (loc.x - 0.06, s * 0.52, 0.28), 0.04, 0.2, chrome)

    # ------------------------------------------------------------ interior
    U.set_collection("Interior", None)
    lth = M.leather("leather_black", (0.03, 0.03, 0.032))
    for s in (1, -1):
        D.seat(f"seat_front{s}", -0.25, s * 0.37, 0.32, (lth, lth), h_back=0.56)
    D.bench("seat_rear", -1.05, 0.34, 0.56, (lth, None), h_back=0.48)
    D.dashboard("dash", 0.52, 0.22, 0.66, 0.88, 0.70, (M.black_satin(), chrome), screens=[(0.0, 0.25, 0.08, 0.2)])
    D.steering_wheel("steer", (0.02, 0.37, 0.82), (M.leather(), chrome), r=0.19)
    D.console("console", -0.60, 0.30, 0.32, 0.54, 0.18, M.black_satin())
    U.set_collection("Car")

    # ------------------------------------------------------------ wheels: deep-dish black multispoke
    spec = W.WheelSpec(R=TR, W=TW, rim_d=0.508, style="multi", n=10, w0=0.022, w1=0.016, t=0.022, concave=0.012,
                       dish=0.035, lip=0.022, rim_mat=M.black_gloss(), lip_mat=M.alu(), face_mat=M.black_gloss(),
                       cap=0.04, chamfer=0.005, caliper=(0.75, 0.04, 0.02))
    W.place_wheels(NAME, spec, [(FX, TRACK_Y, TR), (RX, TRACK_Y, TR), (FX, -TRACK_Y, TR), (RX, -TRACK_Y, TR)])
