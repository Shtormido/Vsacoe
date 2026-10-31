# Вырезает из референсов куски без персонажей и приводит к масштабу игры (кадр 1672×941 → 480×270)
import sys, os
from PIL import Image, ImageOps
REF = sys.argv[1]
OUT = sys.argv[2]
os.makedirs(OUT, exist_ok=True)
K = 480 / 1672
st = Image.open(os.path.join(REF, "station_reference.jpg")).convert("RGB")
ti = Image.open(os.path.join(REF, "title_reference.jpg")).convert("RGB")

def scaled(img, box, colors=40):
    c = img.crop(box)
    w, h = round(c.size[0] * K), round(c.size[1] * K)
    c = c.resize((w, h), Image.LANCZOS)
    return c.quantize(colors=colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert("RGB")

def tile_pair(c):
    # звено и его зеркальная копия: стыки совпадают, можно повторять
    w, h = c.size
    out = Image.new("RGB", (w * 2, h))
    out.paste(c, (0, 0))
    out.paste(ImageOps.mirror(c), (w, 0))
    return out

# своды с лампой (правая арка, без персонажей)
tile_pair(scaled(st, (810, 0, 1610, 300))).save(os.path.join(OUT, "vault.png"))
# мозаика со святым в арке
scaled(st, (90, 118, 600, 415), 48).save(os.path.join(OUT, "mosaic.png"))
# путевая яма с рельсами
tile_pair(scaled(st, (300, 800, 1000, 941))).save(os.path.join(OUT, "trackpit.png"))
# борт старого вагона
tile_pair(scaled(st, (1050, 292, 1290, 500))).save(os.path.join(OUT, "wagon.png"))
# ночное небо с луной, облаками и лесом
scaled(ti, (0, 0, 1672, 360), 48).save(os.path.join(OUT, "sky.png"))
for f in sorted(os.listdir(OUT)):
    if f.endswith(".png"):
        print(f, Image.open(os.path.join(OUT, f)).size)
