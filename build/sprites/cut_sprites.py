# Нарезка спрайтов из референс-листа: поиск кадров, удаление фона, уменьшение до игрового размера.
# Запуск: python cut_sprites.py reference_sheet.jpg ../../game/assets/sprites
import sys, os, json
import numpy as np
from PIL import Image
from scipy import ndimage as nd

src = Image.open(sys.argv[1]).convert("RGB")
OUT = sys.argv[2]
os.makedirs(OUT, exist_ok=True)
im = np.asarray(src).astype(int)
BG = np.array([7, 14, 24])
diff = np.abs(im - BG).sum(axis=2)
mask = nd.binary_dilation(nd.binary_closing(diff > 38, iterations=2), iterations=3)
lab, _ = nd.label(mask)
boxes = []
for sl in nd.find_objects(lab):
    y0, y1, x0, x1 = sl[0].start, sl[0].stop, sl[1].start, sl[1].stop
    if y1 - y0 > 40 and x1 - x0 > 14:
        boxes.append((x0, y0, x1, y1))

def find(x, y):
    best = min(boxes, key=lambda b: abs(b[0] - x) + abs(b[1] - y))
    assert abs(best[0] - x) + abs(best[1] - y) < 30, (x, y, best)
    return best

# персонаж: (масштаб, {анимация: [(x, y) левого верхнего угла кадра на листе]})
SPEC = {
    "dima": (0.42, {
        "idle": [(221, 69), (221, 69), (291, 68)],
        "walk": [(221, 197), (290, 197), (360, 198), (430, 197), (502, 198), (575, 198)],
        "walk2": [(221, 69), (291, 68), (364, 69), (434, 68), (507, 68), (575, 68), (645, 68)],
        "freeze": [(221, 320)], "inspect": [(290, 322)], "kneel": [(375, 321)],
        "sit": [(562, 323)], "sit2": [(462, 323)], "climb": [(647, 196)],
    }),
    "leha": (0.345, {
        "idle": [(964, 76)],
        "walk": [(964, 76), (1037, 76), (1109, 77), (1182, 76), (1259, 76)],
        "photo": [(1341, 72)], "inspect": [(1420, 85)],
        "sneak": [(965, 234), (1037, 234), (1109, 234), (1181, 235)],
        "freeze": [(965, 234)], "kneel": [(1250, 248)], "sit": [(1339, 247)], "cry": [(1433, 263)],
        "possessed": [(966, 332), (1037, 331), (1109, 331), (1181, 331)],
    }),
    "evd": (0.27, {"idle": [(205, 481), (293, 485), (371, 488), (450, 490)], "portrait": [(34, 469)]}),
    "laptev": (0.28, {"idle": [(732, 486), (816, 494), (888, 495)], "point": [(961, 501)], "portrait": [(580, 475)]}),
    "alesha": (0.26, {"idle": [(1223, 506), (1291, 510), (1364, 509)], "wave": [(1434, 513)], "portrait": [(1092, 491)]}),
    "nameless": (0.26, {"idle": [(36, 738), (160, 749), (268, 745), (351, 769), (421, 759)]}),
    "preacher": (0.29, {"idle": [(712, 745), (819, 756), (906, 760), (1009, 769)], "big": [(567, 731)]}),
}

# поправки масштаба: на листе часть рядов нарисована мельче
ADJ = {("dima", "walk"): 119 / 108, ("dima", "freeze"): 119 / 108, ("dima", "inspect"): 119 / 108, ("dima", "kneel"): 119 / 108,
       ("dima", "sit"): 119 / 108, ("dima", "sit2"): 119 / 108, ("dima", "climb"): 0.75,
       ("leha", "sneak"): 1.25, ("leha", "freeze"): 1.25, ("leha", "kneel"): 1.25, ("leha", "sit"): 1.25, ("leha", "cry"): 1.25,
       ("leha", "possessed"): 1.6}

def cut(box, scale):
    x0, y0, x1, y1 = box
    crop = im[y0:y1, x0:x1]
    d = np.abs(crop - BG).sum(axis=2)
    a = d > 34
    a = nd.binary_closing(a, iterations=2)
    a = nd.binary_fill_holes(a)
    # оставляем только крупнейший связный объект (без соседних кадров и подписей)
    l, n = nd.label(nd.binary_dilation(a, iterations=2))
    if n > 1:
        sizes = nd.sum(a, l, range(1, n + 1))
        a = a & (l == (1 + int(np.argmax(sizes))))
    ys, xs = np.where(a)
    a = a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    rgb = crop[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    h, w = a.shape
    nw, nh = max(1, round(w * scale)), max(1, round(h * scale))
    img = Image.fromarray(rgb.astype(np.uint8)).resize((nw, nh), Image.LANCZOS)
    al = Image.fromarray((a * 255).astype(np.uint8)).resize((nw, nh), Image.BILINEAR)
    al = al.point(lambda v: 255 if v > 110 else 0)
    # лёгкая постеризация в духе пиксель-арта
    img = img.quantize(colors=32, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert("RGB")
    out = img.convert("RGBA")
    out.putalpha(al)
    return out

meta = {}
for ch, (scale, anims) in SPEC.items():
    meta[ch] = {}
    os.makedirs(os.path.join(OUT, ch), exist_ok=True)
    for an, frames in anims.items():
        s = scale * ADJ.get((ch, an), 1)
        if an == "portrait": s = 64 / (find(*frames[0])[3] - find(*frames[0])[1])
        meta[ch][an] = len(frames)
        for i, (x, y) in enumerate(frames):
            cut(find(x, y), s).save(os.path.join(OUT, ch, f"{an}_{i + 1}.png"))
with open(os.path.join(OUT, "sprites.lua"), "w", encoding="utf8") as f:
    f.write("-- Сгенерировано build/sprites/cut_sprites.py: персонаж -> анимация -> число кадров\nreturn {\n")
    for ch, anims in meta.items():
        f.write(f"  {ch} = {{ " + ", ".join(f"{a} = {n}" for a, n in anims.items()) + " },\n")
    f.write("}\n")
print(json.dumps(meta, ensure_ascii=False))
