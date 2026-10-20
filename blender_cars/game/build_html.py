"""Assemble the self-contained game file: game/drift_restomod.html

Inlines (gzip + base64) the three.js module and every car pack from game/assets/,
plus game/src/game.js, into game/src/index.html. Run export_game.py first.
"""
import base64
import gzip
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ORDER = ["VAZ2106_Restomod", "ZAZ968_Coupe", "LADA2107_NewGen", "Nova63_Restomod", "VAZ2108_2025", "ZIL111_Restomod"]


def b64(data):
    return base64.b64encode(data).decode("ascii")


def main():
    with open(os.path.join(HERE, "vendor", "three.module.min.js"), "rb") as f:
        three = b64(gzip.compress(f.read(), 9))
    cars = []
    for name in ORDER:
        p = os.path.join(HERE, "assets", f"{name}.bin.gz")
        if os.path.exists(p):
            with open(p, "rb") as f:
                cars.append(b64(f.read()))
    with open(os.path.join(HERE, "src", "game.js"), encoding="utf-8") as f:
        game = f.read()
    with open(os.path.join(HERE, "src", "index.html"), encoding="utf-8") as f:
        html = f.read()
    html = html.replace("/*__GAME_JS__*/", game)
    html = html.replace("/*__ASSETS__*/", json.dumps({"three": three, "cars": cars}))
    out = os.path.join(HERE, "drift_restomod.html")
    with open(out, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"{out}: {os.path.getsize(out) / 1e6:.2f} MB, {len(cars)} cars")


if __name__ == "__main__":
    main()
