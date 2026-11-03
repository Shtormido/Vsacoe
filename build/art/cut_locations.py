# Нарезка листа фонов локаций: полосы → assets/bg/<сцена>.png в экранном разрешении (высота 270),
# стирание подписей, разворот стрелки «К СТАНЦИИ» налево.
# Запуск: python cut_locations.py locations_v1.jpg ../../game/assets/bg
import sys, os, json
from PIL import Image, ImageOps
src = Image.open(sys.argv[1]).convert("RGB")
OUT = sys.argv[2]
os.makedirs(OUT, exist_ok=True)
Z = 2.4          # приближение камеры в этих сценах
FLOOR = 232      # линия ступней в мире
# id: (y0, y1 полосы, ширина подписи, y ступней в полосе)
STRIPS = {
    "surface":   (0, 213, 292, 194),
    "corridor":  (216, 395, 218, 166),
    "severnaya": (398, 626, 210, 174),
    "tunnel_sl": (628, 803, 326, 158),
    "lipovaya":  (806, 1024, 200, 174),
}
meta = {}
for sid, (y0, y1, lw, feet) in STRIPS.items():
    strip = src.crop((0, y0, src.size[0], y1))
    h = y1 - y0
    # подпись: заменяем куском той же высоты правее
    px = 820 if sid == "surface" else lw + 8
    patch = strip.crop((px, 0, px + lw + 8, 44 if sid == "surface" else 38))
    strip.paste(patch, (0, 0))
    if sid == "corridor":
        # стрелка указывает налево
        box = (1100, 52, 1150, 92)
        strip.paste(ImageOps.mirror(strip.crop(box)), box[:2])
    k = 270 / (h * Z)                        # мировых точек на точку полосы
    sw = round(src.size[0] * 270 / h)        # ширина в экранных точках
    img = strip.resize((sw, 270), Image.LANCZOS)
    img = img.quantize(colors=96, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert("RGB")
    img.save(os.path.join(OUT, sid + ".png"))
    meta[sid] = {"k": round(k, 5), "w": round(src.size[0] * k), "viewTop": round(FLOOR - feet * k, 2), "screenW": sw}
print(json.dumps(meta, indent=1))
