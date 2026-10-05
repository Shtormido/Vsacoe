"""Генерирует src/Vsacoe/Assets/app.ico без сторонних библиотек.

Рисунок: скруглённый синий квадрат с четырьмя полупрозрачными «оградами».
Размеры 16/24/32/48 — BMP-кадры (лучше совместимы с System.Drawing.Icon), 256 — PNG.
"""
import struct
import zlib
from pathlib import Path


def rounded_rect_coverage(x, y, rx, ry, rw, rh, r):
    """Принадлежность точки скруглённому прямоугольнику (1/0)."""
    if x < rx or x > rx + rw or y < ry or y > ry + rh:
        return 0.0
    cx = min(max(x, rx + r), rx + rw - r)
    cy = min(max(y, ry + r), ry + rh - r)
    return 1.0 if (x - cx) ** 2 + (y - cy) ** 2 <= r * r else 0.0


def blend(dst, src_rgb, alpha):
    r, g, b, a = dst
    sr, sg, sb = src_rgb
    out_a = alpha + a * (1 - alpha)
    if out_a == 0:
        return (0, 0, 0, 0)
    mix = lambda s, d: (s * alpha + d * a * (1 - alpha)) / out_a
    return (mix(sr, r), mix(sg, g), mix(sb, b), out_a)


def render(size):
    ss = 4  # суперсэмплинг
    pixels = []
    for py in range(size):
        row = []
        for px in range(size):
            acc = [0.0, 0.0, 0.0, 0.0]
            for sy in range(ss):
                for sx in range(ss):
                    x = (px + (sx + 0.5) / ss) / size
                    y = (py + (sy + 0.5) / ss) / size
                    c = (0.0, 0.0, 0.0, 0.0)
                    # фон-плитка с вертикальным градиентом
                    if rounded_rect_coverage(x, y, 0.03, 0.03, 0.94, 0.94, 0.2):
                        t = y
                        c = blend(c, (40 + 30 * t, 110 - 40 * t, 220 - 60 * t), 1.0)
                    # четыре «ограды»
                    for (rx, ry) in ((0.16, 0.16), (0.53, 0.16), (0.16, 0.53), (0.53, 0.53)):
                        if rounded_rect_coverage(x, y, rx, ry, 0.31, 0.31, 0.07):
                            c = blend(c, (255, 255, 255), 0.88)
                            # полоска заголовка
                            if y < ry + 0.08:
                                c = blend(c, (180, 210, 255), 0.9)
                    acc = [acc[i] + (c[i] * c[3] if i < 3 else c[3]) for i in range(4)]
            n = ss * ss
            a = acc[3] / n
            rgb = [acc[i] / acc[3] if acc[3] else 0 for i in range(3)]
            row.append(tuple(int(round(v)) for v in rgb) + (int(round(a * 255)),))
        pixels.append(row)
    return pixels


def png_bytes(pixels):
    size = len(pixels)
    raw = b"".join(b"\x00" + bytes(v for p in row for v in p) for row in pixels)

    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 9))
            + chunk(b"IEND", b""))


def bmp_bytes(pixels):
    size = len(pixels)
    header = struct.pack("<IiiHHIIiiII", 40, size, size * 2, 1, 32, 0, 0, 0, 0, 0, 0)
    xor = b"".join(bytes((p[2], p[1], p[0], p[3])) for row in reversed(pixels) for p in row)
    mask_row = ((size + 31) // 32) * 4
    and_mask = b"\x00" * (mask_row * size)
    return header + xor + and_mask


def main():
    frames = []
    for size in (16, 24, 32, 48, 256):
        px = render(size)
        frames.append((size, png_bytes(px) if size >= 256 else bmp_bytes(px)))

    out = struct.pack("<HHH", 0, 1, len(frames))
    offset = 6 + 16 * len(frames)
    data = b""
    for size, blob in frames:
        dim = 0 if size >= 256 else size
        out += struct.pack("<BBBBHHII", dim, dim, 0, 0, 1, 32, len(blob), offset + len(data))
        data += blob
    target = Path(__file__).resolve().parent.parent / "src" / "Vsacoe" / "Assets" / "app.ico"
    target.write_bytes(out + data)
    print(f"wrote {target} ({len(out) + len(data)} bytes)")


if __name__ == "__main__":
    main()
