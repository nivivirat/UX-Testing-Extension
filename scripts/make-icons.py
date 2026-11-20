"""Draws the extension icons (16/32/48/128 px PNG) without any dependencies.

Black rounded square, white cursor arrow (same shape as the toolbar's Inspect icon) and a small blue
dot. Run:  python scripts/make-icons.py
"""
import os
import struct
import zlib

OUT = os.path.join(os.path.dirname(__file__), '..', 'extension', 'icons')
DARK = (23, 23, 23)
WHITE = (255, 255, 255)
BLUE = (0, 107, 255)
SS = 4  # supersampling per axis for smooth edges


def inside_round_rect(x, y, n, r):
    cx = min(max(x, r), n - r)
    cy = min(max(y, r), n - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def inside_poly(x, y, pts):
    inside = False
    j = len(pts) - 1
    for i in range(len(pts)):
        xi, yi = pts[i]
        xj, yj = pts[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def icon(n):
    s = n / 24 * 0.78
    ox, oy = n * 0.13, n * 0.12
    arrow = [(ox + px * s, oy + py * s) for px, py in [(5, 3), (19, 10), (13, 12), (11, 18)]]
    dot = (n * 0.74, n * 0.74, n * 0.11)
    rows = []
    for y in range(n):
        row = bytearray([0])  # filter: none
        for x in range(n):
            acc = [0, 0, 0, 0]
            for sy in range(SS):
                for sx in range(SS):
                    fx = x + (sx + 0.5) / SS
                    fy = y + (sy + 0.5) / SS
                    if not inside_round_rect(fx, fy, n, n * 0.22):
                        continue
                    if (fx - dot[0]) ** 2 + (fy - dot[1]) ** 2 <= dot[2] ** 2:
                        c = BLUE
                    elif inside_poly(fx, fy, arrow):
                        c = WHITE
                    else:
                        c = DARK
                    acc[0] += c[0]
                    acc[1] += c[1]
                    acc[2] += c[2]
                    acc[3] += 255
            k = SS * SS
            a = acc[3] // k
            if a:
                row += bytes([acc[0] * 255 // acc[3], acc[1] * 255 // acc[3], acc[2] * 255 // acc[3], a])
            else:
                row += bytes([0, 0, 0, 0])
        rows.append(bytes(row))
    raw = b''.join(rows)

    def chunk(t, d):
        c = struct.pack('>I', len(d)) + t + d
        return c + struct.pack('>I', zlib.crc32(t + d) & 0xFFFFFFFF)

    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', n, n, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')


os.makedirs(OUT, exist_ok=True)
for size in (16, 32, 48, 128):
    with open(os.path.join(OUT, f'icon-{size}.png'), 'wb') as f:
        f.write(icon(size))
print('icons written to', os.path.abspath(OUT))
