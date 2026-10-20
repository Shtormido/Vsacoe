"""Build the procedural car models.

Usage (either works):
    python build.py [car ...] [--no-render] [--samples N] [--res WxH]
    blender -b -P build.py -- [car ...] [--no-render]

Cars: vaz2106 zaz968 lada2107 nova63 vaz2108 zil111 (default: all).
Outputs go to ./output/<NAME>.blend and ./output/renders/.
"""
import argparse
import importlib
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from carlib import util as U, studio as S, assemble as A, details as D  # noqa: E402

CARS = ["vaz2106", "zaz968", "lada2107", "nova63", "vaz2108", "zil111"]


def build_one(key, out_dir, render=True, samples=96, res=(1600, 900), views=None):
    mod = importlib.import_module(f"cars.{key}")
    importlib.reload(mod)
    t = time.time()
    U.reset_scene()
    S.build_studio(dark=getattr(mod, "DARK_STUDIO", False))
    S.setup_render(res, samples)
    U.set_collection("Car")
    D.WINDOW_CUTTERS.clear()
    mod.build()
    import bpy
    D.cut_window_openings(bpy.data.objects["greenhouse"])
    A.organize(mod.NAME)
    print(f"[{key}] geometry built in {time.time() - t:.1f}s")
    blend, renders = A.save_and_render(mod.NAME, out_dir, mod.LENGTH, render=render, res=res, samples=samples,
                                       views=views or ("front34", "side", "rear34"))
    print(f"[{key}] saved {blend} ({time.time() - t:.1f}s)")
    return blend, renders


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument("cars", nargs="*", default=CARS)
    ap.add_argument("--no-render", action="store_true")
    ap.add_argument("--samples", type=int, default=96)
    ap.add_argument("--res", default="1600x900")
    ap.add_argument("--views", default="front34,side,rear34")
    ap.add_argument("--out", default=os.path.join(HERE, "output"))
    a = ap.parse_args(argv)
    res = tuple(int(v) for v in a.res.split("x"))
    for key in a.cars:
        build_one(key, a.out, not a.no_render, a.samples, res, tuple(a.views.split(",")))


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    main(argv)
