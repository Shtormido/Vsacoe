"""Генерирует packaging/blockscan.ico (радар + знак блокировки). Нужен Pillow."""

from pathlib import Path

from PIL import Image, ImageDraw

S = 1024
BG = (22, 50, 79, 255)
RADAR = (79, 195, 247, 255)
SWEEP = (79, 195, 247, 90)
BLOCK = (229, 57, 53, 255)
WHITE = (255, 255, 255, 255)


def draw() -> Image.Image:
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((32, 32, S - 32, S - 32), radius=220, fill=BG)

    cx, cy = 440, 440
    sweep = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(sweep).pieslice((cx - 330, cy - 330, cx + 330, cy + 330), -90, -20, fill=SWEEP)
    img.alpha_composite(sweep)
    for r in (330, 220, 110):
        d.ellipse((cx - r, cy - r, cx + r, cy + r), outline=RADAR, width=40)
    d.line((cx, cy, cx, cy - 330), fill=RADAR, width=40)
    d.ellipse((cx - 45, cy - 45, cx + 45, cy + 45), fill=RADAR)

    bx, by, br = 730, 730, 220
    d.ellipse((bx - br - 34, by - br - 34, bx + br + 34, by + br + 34), fill=BG)
    d.ellipse((bx - br, by - br, bx + br, by + br), fill=BLOCK)
    d.ellipse((bx - br + 50, by - br + 50, bx + br - 50, by + br - 50), fill=WHITE)
    d.ellipse((bx - br + 100, by - br + 100, bx + br - 100, by + br - 100), fill=BLOCK)
    off = int((br - 75) * 0.7071)
    d.line((bx - off, by - off, bx + off, by + off), fill=WHITE, width=56)
    return img


if __name__ == "__main__":
    out = Path(__file__).with_name("blockscan.ico")
    big = draw()
    sizes = [16, 24, 32, 48, 64, 128, 256]
    big.resize((256, 256), Image.LANCZOS).save(out, sizes=[(s, s) for s in sizes])
    print(out)
