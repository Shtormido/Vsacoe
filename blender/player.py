"""Персонаж игрока — player.glb: конструктор из частей для экрана кастомизации.

Два телосложения (Player_woman / Player_man) в фартуке и без волос,
отдельно — причёски PHair_* и аксессуары PAcc_* в системе координат головы.
Игра цепляет выбранные части к узлу Head и перекрашивает материалы *_P.
"""
import os as _os
import sys as _sys

_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))

import bpy  # noqa: E402,F401

from common import empty, export, mat, reset  # noqa: E402
from people import build_character, make_beard, make_cap, make_glasses, make_hair  # noqa: E402

HAIR_STYLES = ["short", "bun", "ponytail", "bob", "long", "curly", "afro", "slick", "mohawk", "bald"]
HR = 0.15


def build():
    reset()
    base = dict(skin="fair", skin_mat="Skin_P", top="#ffffff", bottom="#3a4a6a", shoes="#2b2525", hair="#6b4423",
                hair_style="none", apron="#5fd0b5")
    build_character("P", dict(base, body="woman"), root_name="Player_woman")
    build_character("P", dict(base, body="man"), root_name="Player_man")
    hair = mat("Hair_P", "#6b4423", rough=0.7)
    for i, hs in enumerate(HAIR_STYLES):
        g = empty(f"PHair_{hs}")
        make_hair(hs, hair, g, HR, name=f"PHairMesh_{hs}")
    g = empty("PAcc_glasses")
    make_glasses(mat("Glasses_P", "#2b2b2b", rough=0.25, metal=0.5), g, HR)
    g = empty("PAcc_cap")
    make_cap(mat("Cap_P", "#e0504f", rough=0.6), g, HR)
    g = empty("PAcc_beard")
    make_beard(hair, g, HR)


if __name__ == "__main__":
    build()
    export("player.glb")
    if "--preview" in _sys.argv:
        from common import preview
        out = _sys.argv[_sys.argv.index("--preview") + 1]
        w = bpy.data.objects["Player_woman"]
        m = bpy.data.objects["Player_man"]
        m.location.x = 0.8
        for name, x in (("PHair_ponytail", 0.0), ("PHair_short", 0.8)):
            o = bpy.data.objects[name]
            head = next(h for h in (w if x == 0 else m).children_recursive if h.name.startswith("Head"))
            o.parent = head
            o.location = (0, 0, 0)
        preview(out + "/player.png", target=(0.4, 0, 0.95), dist=3.4, elev=8, azim=-15, size=700, samples=16)
