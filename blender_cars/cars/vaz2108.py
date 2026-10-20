"""VAZ-2108 "2025" concept (charcoal wedge hatchback, slim LED strips, full-width rear light bar)."""
import math

from carlib import curves as C, util as U, parts as P, materials as M, body as B
from carlib import details as D, wheels as W, assemble as A

NAME = "VAZ2108_2025"
LENGTH = 4.05
DARK_STUDIO = True

WB = 2.46
FX, RX = WB / 2, -WB / 2
TR = 0.325
TW = 0.235
TRACK_Y = 0.755


def build():
    paint = M.paint("paint_charcoal", (0.035, 0.036, 0.04), metallic=0.25, rough=0.4, coat=0.35)
    black = M.black_gloss()
    satin = M.black_satin()
    chrome = M.chrome()

    rows = [
        dict(x=-1.98, zb=0.33, wb=0.68, zm=0.52, wl=0.83, zs=0.86, ws=0.815, ze=0.925, we=0.74, zt=0.935,
             lean=-0.02),
        dict(x=-1.82, zb=0.28, lean=0.0),
        dict(x=-1.64, wl=0.86, zm=0.52),
        dict(x=-1.50, wl=0.885, zm=0.58),
        dict(x=-0.92, wl=0.885, zm=0.58, zs=0.88, ze=0.935, zt=0.94),
        dict(x=-0.78, wl=0.86, zm=0.52),
        dict(x=0.0, zb=0.235, wb=0.76, zs=0.85, ws=0.85, ze=0.895, we=0.79, zt=0.90),
        dict(x=0.68, wl=0.86, zm=0.52, zs=0.81, ze=0.86, zt=0.865),
        dict(x=0.84, wl=0.88, zm=0.56),
        dict(x=1.52, wl=0.88, zm=0.55, zs=0.71, ze=0.76, zt=0.77),
        dict(x=1.66, wl=0.85, zm=0.50, lean=0.0, bow=0.0),
        dict(x=2.00, zb=0.26, wb=0.72, zm=0.44, wl=0.82, zs=0.64, ws=0.81, ze=0.68, we=0.76, zt=0.69,
             lean=-0.15, bow=0.10),
    ]
    radii = dict(rb=0.04, rm=0.10, rs=0.03, re=0.03)
    body = B.Body(rows, radii, nose=dict(rc=0.05), tail=dict(rc=0.05))
    bo = body.build("body", paint)

    gh = B.Greenhouse([
        dict(x=0.88, zb=0.855, wb=0.77, zt=0.855, wt=0.76, zr=0.855, rr=0.02),
        dict(x=0.47, zt=1.10, wt=0.70, zr=1.115),
        dict(x=0.06, zt=1.335, wt=0.64, zr=1.365, rr=0.05),
        dict(x=-1.00, zt=1.325, wt=0.64, zr=1.355, rr=0.05),
        dict(x=-1.30, zt=1.25, wt=0.66, zr=1.275),
        dict(x=-1.62, zt=1.10, wt=0.68, zr=1.115),
        dict(x=-1.90, zb=0.915, wb=0.73, zt=0.915, wt=0.72, zr=0.915, rr=0.02),
    ])
    go = gh.build("greenhouse", paint)

    B.cut_body(bo, B.arch_cutters([(FX, TR, 0.36), (RX, TR, 0.36)], 0.63, 1.3, M.black_matte())
               + [B.cabin_cutter(-1.30, 0.50, 0.61, 0.30, 1.3, M.leather())])
    surf = B.Surface(bo)
    gsurf = B.Surface(go)

    glass = (M.glass_tinted(), black)
    D.glass_area(gh, gsurf, 0.85, 0.10, 0.05, "windshield", glass)
    D.wipers(gsurf, 0.85, [-0.62, -0.08], 0.50)
    D.shark_antenna(gsurf, -0.90, paint)
    D.glass_area(gh, gsurf, -1.06, -1.86, 0.055, "hatch_glass", glass, round_r=0.06)
    dlo = A.dlo_polygon(gh, 0.82, -1.25, 0.885, 0.04)
    dlo = C.clip_halfplane(dlo, (-1.25, 0.88), (-1.05, 1.40))
    D.side_windows(gsurf, dlo, [((-0.62, 0.88), (-0.70, 1.4), 0.10)], "side_glass", glass)

    # ------------------------------------------------------------ gaps, details
    D.door_cuts(surf, [
        [(0.80, 0.30), (0.83, 0.86)],
        [(-0.66, 0.28), (-0.66, 0.89)],
        [(0.80, 0.30), (-0.66, 0.30)],
    ], "gap")
    B.strip(surf, "top", [(0.92, -0.001), (0.92, 0.70), (1.94, 0.66)], 0.004, "hood_gap", M.gap(), mirror=True)
    D.flush_handle(surf, -0.48, 0.83, "handle", black, w=0.13, h=0.02)
    D.side_mirror("mirror", (0.74, 0.78, 0.90), (paint, chrome, black), size=(0.12, 0.06, 0.07), yaw=0.06)
    skirt = A.side_path(surf, 0.86, -0.86, 0.25, out=0.01, n=30)
    o = P.sweep("side_skirt", C.round_corners([(-0.02, -0.03), (0.03, -0.03), (0.03, 0.02), (-0.02, 0.045)], 0.008, 2),
                skirt, satin, up=(0, 0, 1))
    U.mirror_y(o)
    B.strip(surf, "side", [(1.55, 0.55), (-1.55, 0.58)], 0.003, "side_crease", M.gap(), offset=0.0008, mirror=True)

    # ------------------------------------------------------------ front: black band with slim LEDs
    band = C.round_corners([(-0.79, 0.615), (0.79, 0.615), (0.78, 0.68), (-0.78, 0.68)], 0.012, 3)
    B.decal(surf, "front", band, "front_band", black, 0.002, 0.008)
    for s in (1, -1):
        B.strip(surf, "front", [(s * 0.40, 0.655), (s * 0.76, 0.652)], 0.014, f"led_strip{s}", M.led_white(),
                offset=0.004)
        B.strip(surf, "front", [(s * 0.42, 0.633), (s * 0.70, 0.632)], 0.006, f"led_low{s}", M.reflector(),
                offset=0.004)
        B.decal(surf, "front", C.rrect(s * 0.62, 0.38, 0.13, 0.05, 0.008), f"fog{s}", black, 0.002, 0.006)
        B.decal(surf, "front", C.rrect(s * 0.62, 0.38, 0.11, 0.032, 0.006), f"fog_led{s}", M.led_white(),
                0.004, 0.005)
    loc, _ = surf.hit("front", 0.0, 0.648)
    B.decal(surf, "front", C.rrect(0.0, 0.648, 0.07, 0.05, 0.01), "badge", chrome, 0.004, 0.005)
    loc, _ = surf.hit("front", 0.0, 0.45)
    P.plate("front_plate", (loc.x + 0.01, 0, 0.45), (1, 0, 0), "2108", mats=(M.plate_white(), black, black),
            size=(0.40, 0.11), text_size=0.075)
    B.decal(surf, "front", C.round_corners([(-0.60, 0.27), (0.60, 0.27), (0.55, 0.35), (-0.55, 0.35)], 0.015, 3),
            "lower_intake", satin, 0.002, 0.01)
    lip = A.contour_path(surf, 0.255, 1.3, -55, 55, out=0.0, n=60)
    P.sweep("front_lip", C.round_corners([(0.0, -0.01), (0.05, -0.01), (0.06, 0.0), (0.0, 0.012)], 0.004, 2),
            lip, black, up=(0, 0, 1))

    # ------------------------------------------------------------ rear: full-width light bar
    tb = C.rrect(0.0, 0.875, 1.56, 0.075, 0.012)
    B.decal(surf, "rear", tb, "tail_band", black, 0.002, 0.008)
    B.strip(surf, "rear", [(-0.76, 0.875), (-0.18, 0.875)], 0.016, "tail_led_l", M.led_red(), offset=0.004)
    B.strip(surf, "rear", [(0.18, 0.875), (0.76, 0.875)], 0.016, "tail_led_r", M.led_red(), offset=0.004)
    loc, _ = surf.hit("rear", 0.0, 0.875)
    U.text_object("rear_badge", "L A D A", 0.032, (loc.x - 0.008, 0, 0.875), (math.pi / 2, 0, -math.pi / 2),
                  chrome, extrude=0.002)
    loc, _ = surf.hit("rear", 0.0, 0.62)
    P.plate("rear_plate", (loc.x - 0.01, 0, 0.62), (-1, 0, 0), "2108", mats=(M.plate_white(), black, black),
            size=(0.40, 0.11), text_size=0.075)
    B.decal(surf, "rear", C.round_corners([(-0.78, 0.26), (0.78, 0.26), (0.74, 0.42), (-0.74, 0.42)], 0.03, 4),
            "diffuser", satin, 0.002, 0.01)
    for k, y in enumerate((-0.30, -0.47)):
        tip = C.round_corners([(y - 0.07, 0.29), (y + 0.07, 0.29), (y + 0.06, 0.35), (y - 0.06, 0.35)], 0.01, 3)
        B.decal(surf, "rear", tip, f"exhaust{k}", chrome, 0.006, 0.006, thickness=0.01)
        B.decal(surf, "rear", C.offset_polygon(tip, -0.009), f"exhaust_in{k}", M.black_matte(), 0.0085, 0.005)
    # roof spoiler over the hatch glass
    D.wing("roof_spoiler", -1.12, 0.22, 0.64, 1.322, (paint, paint), thickness=0.012, aoa=0.10, plates=False)

    # ------------------------------------------------------------ interior
    U.set_collection("Interior", None)
    lth = M.leather("leather_black", (0.03, 0.03, 0.032))
    for s in (1, -1):
        D.seat(f"seat_front{s}", -0.05, s * 0.36, 0.30, (lth, M.leather("alcantara", (0.12, 0.12, 0.13))))
    D.bench("seat_rear", -0.88, 0.34, 0.55, (lth, None), h_back=0.5)
    D.dashboard("dash", 0.72, 0.42, 0.68, 0.90, 0.68, (M.black_satin(), black), screens=[(0.15, 0.55, 0.11, 0.25)])
    D.steering_wheel("steer", (0.24, 0.36, 0.84), (M.leather(), black), r=0.18)
    D.console("console", -0.40, 0.50, 0.30, 0.54, 0.20, M.black_satin())
    U.set_collection("Car")

    # ------------------------------------------------------------ wheels: chunky 5-spoke
    spec = W.WheelSpec(R=TR, W=TW, rim_d=0.457, style="multi", n=5, w0=0.075, w1=0.062, t=0.03, concave=0.03,
                       rim_mat=M.alu(), face_mat=M.alu(), cap=0.045, chamfer=0.014, caliper=(0.12, 0.12, 0.12))
    W.place_wheels(NAME, spec, [(FX, TRACK_Y, TR), (RX, TRACK_Y, TR), (FX, -TRACK_Y, TR), (RX, -TRACK_Y, TR)])
