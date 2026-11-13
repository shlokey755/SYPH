#!/usr/bin/env python3
"""
make-parchment-art.py
Draws the pictures behind SYPH's "pirate's torn map" look. Run it once and commit the output; the app only ships the PNG/JPEG
files in assets/parchment/. Needs Pillow and numpy:

    python3 scripts/make-parchment-art.py

Everything is drawn from a fixed random seed, so running it again gives the same files.

  parchment-map.jpg    aged parchment, burnt edges, fold creases, tea stains and an inked map (islands, a dotted trail to an X,
                       a compass rose, a ship, waves). Behind the tab screens, sign-in and onboarding.
  parchment-plain.jpg  the same parchment with no drawing on it. Behind chats and sheets, where text must stay easy to read.
  night-sea.jpg        a dark sea chart for calls: deep blue-green, a faint compass and rhumb lines.
  wood.jpg             ship's planking, for the tab bar.
  tear.png             the ragged top edge of a torn scrap, black with transparency. The app tints it to the paper colour.
  tear-rim.png         the pale fibres along that tear; the app tints it lighter than the paper.
  compass.png          a compass rose, black with transparency. The app tints it.
  seal.png, seal-ring.png   a blob of sealing wax and the groove stamped in it (tinted red and darker red).
  parchment-map-wide.jpg, parchment-plain-wide.jpg   the same two pages in landscape, for desktop browser windows.
  ../images/favicon-compass.png   the browser tab icon.
"""

import math
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'assets', 'parchment')
FONT = os.path.join(HERE, '..', 'assets', 'fonts', 'PirataOne-Regular.ttf')
W, H = 540, 1170
S = 2  # supersampling for the ink drawing
rng = np.random.default_rng(1721)


def fbm(h, w, cells=(300, 120, 50, 16, 5), weights=(0.45, 0.3, 0.15, 0.07, 0.03), stretch=(1, 1)):
    """Smooth value noise, 0..1. `stretch` > 1 makes the blobs longer along that axis (wood grain)."""
    acc = np.zeros((h, w), np.float32)
    for cell, weight in zip(cells, weights):
        lh = max(2, int(h / (cell * stretch[0])) + 2)
        lw = max(2, int(w / (cell * stretch[1])) + 2)
        low = rng.random((lh, lw)).astype(np.float32)
        up = np.asarray(Image.fromarray(low, mode='F').resize((w, h), Image.BICUBIC), dtype=np.float32)
        acc += weight * up
    acc -= acc.min()
    return acc / (acc.max() + 1e-6)


def lerp(a, b, t):
    return a * (1 - t[..., None]) + b * t[..., None]


def smooth(x):
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)


def parchment(with_burn=True, wide=False):
    """The aged page as a float RGB array (0..255)."""
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    base = np.array([232, 211, 163], np.float32)
    dark = np.array([196, 158, 98], np.float32)
    n = fbm(H, W)
    img = lerp(np.broadcast_to(base, (H, W, 3)).copy(), np.broadcast_to(dark, (H, W, 3)).copy(), 0.55 * n)
    img += (rng.random((H, W, 1)).astype(np.float32) - 0.5) * 9          # grain
    fibres = fbm(H, W, cells=(14, 6), weights=(0.6, 0.4), stretch=(0.5, 3))
    img *= (0.965 + 0.07 * fibres)[..., None]                          # paper fibres

    # tea and coffee stains: two rings and a few cloudy blotches
    stains = ((330, 610, 90, 6.0, 0.28), (1180, 260, 70, 5.0, 0.24), (1010, 790, 52, 4.0, 0.20), (150, 120, 46, 4.0, 0.18)) if wide else (
        (150, 610, 70, 5.0, 0.30), (505, 470, 58, 4.0, 0.24), (300, 1128, 40, 3.5, 0.18))
    for cx, cy, r, width, strength in stains:
        d = np.abs(np.hypot(xx - cx, yy - cy) - r)
        ring = np.exp(-((d / width) ** 2)) * strength
        inside = (np.hypot(xx - cx, yy - cy) < r).astype(np.float32) * 0.05
        img = lerp(img, np.broadcast_to(np.array([118, 76, 36], np.float32), img.shape).copy(), ring + inside)
    blot = smooth((fbm(H, W, cells=(160, 70), weights=(0.6, 0.4)) - 0.62) * 5)
    img = lerp(img, np.broadcast_to(np.array([150, 104, 54], np.float32), img.shape).copy(), blot * 0.35)

    # folds: once across the middle, twice down the long side, like a map kept in a pocket
    def crease(dist, line=1.2, hi=1.8):
        return -0.17 * np.exp(-((dist / line) ** 2)) + 0.09 * np.exp(-(((dist - 2.4) / hi) ** 2))

    if wide:                                                           # landscape: once across the middle, twice down the long side
        wob = 3 * np.sin(xx / 61.0) + 2 * np.sin(xx / 23.0 + 1)
        shade = crease(yy - H / 2 - wob)
        for frac in (1 / 3, 2 / 3):
            shade += crease(xx - W * frac - 2.5 * np.sin(yy / 47.0))
    else:
        wob = 3 * np.sin(yy / 61.0) + 2 * np.sin(yy / 23.0 + 1)
        shade = crease(xx - W / 2 - wob)
        for frac in (1 / 3, 2 / 3):
            shade += crease(yy - H * frac - 2.5 * np.sin(xx / 47.0))
    img *= (1 + shade)[..., None]
    for col in range(2):
        for row in range(3):
            img[row * H // 3:(row + 1) * H // 3, col * W // 2:(col + 1) * W // 2] *= 1 + rng.uniform(-0.018, 0.018)

    if with_burn:
        edge = np.minimum(np.minimum(xx, W - 1 - xx), np.minimum(yy, H - 1 - yy))
        warp = (fbm(H, W, cells=(90, 30, 9), weights=(0.5, 0.35, 0.15)) - 0.5) * 80
        d = edge + warp
        burn = np.clip(1 - d / 66, 0, 1) ** 1.8
        char = np.clip(1 - d / 12, 0, 1) ** 1.3
        img = lerp(img, np.broadcast_to(np.array([92, 56, 24], np.float32), img.shape).copy(), 0.78 * burn)
        img = lerp(img, np.broadcast_to(np.array([30, 18, 9], np.float32), img.shape).copy(), 0.88 * char)
    return np.clip(img, 0, 255)


def font(size):
    return ImageFont.truetype(FONT, size)


# ---------- the inked map ----------

def jitter(points, amount=1.2):
    return [(x + rng.normal(0, amount), y + rng.normal(0, amount)) for x, y in points]


def blob(cx, cy, rx, ry, seed_phase, n=90):
    ph = rng.uniform(0, 6.28, 4) + seed_phase
    pts = []
    for i in range(n):
        t = 2 * math.pi * i / n
        r = 0.74 + 0.20 * math.sin(3 * t + ph[0]) + 0.11 * math.sin(5 * t + ph[1]) + 0.06 * math.sin(9 * t + ph[2]) + 0.03 * math.sin(17 * t + ph[3])
        pts.append((cx + rx * r * math.cos(t), cy + ry * r * math.sin(t)))
    return pts


def scaled(points, cx, cy, k):
    return [(cx + (x - cx) * k, cy + (y - cy) * k) for x, y in points]


def catmull(points, step=11.0):
    """Evenly spaced points along a smooth curve through `points`."""
    pts = [points[0]] + points + [points[-1]]
    dense = []
    for i in range(1, len(pts) - 2):
        p0, p1, p2, p3 = (np.array(p, np.float32) for p in pts[i - 1:i + 3])
        for t in np.linspace(0, 1, 40, endpoint=False):
            dense.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    out, acc, last = [dense[0]], 0.0, dense[0]
    for p in dense[1:]:
        acc += float(np.hypot(*(p - last)))
        last = p
        if acc >= step:
            out.append(p)
            acc = 0.0
    return [tuple(p) for p in out]


def star(d, cx, cy, r, ink, width=3, north=True):
    """An eight-pointed compass star: left half of every point filled, right half outlined."""
    for k in range(8):
        a = -math.pi / 2 + k * math.pi / 4
        tip_r = r if k % 2 == 0 else r * 0.62
        half = math.pi / 16 if k % 2 == 0 else math.pi / 14
        tip = (cx + tip_r * math.cos(a), cy + tip_r * math.sin(a))
        left = (cx + r * 0.2 * math.cos(a - half * 2.2), cy + r * 0.2 * math.sin(a - half * 2.2))
        right = (cx + r * 0.2 * math.cos(a + half * 2.2), cy + r * 0.2 * math.sin(a + half * 2.2))
        d.polygon([tip, left, (cx, cy)], fill=ink)
        d.line([tip, right, (cx, cy), tip], fill=ink, width=max(1, width // 2))
    if north:
        f = font(int(r * 0.42))
        w = d.textlength('N', font=f)
        d.text((cx - w / 2, cy - r - r * 0.5), 'N', font=f, fill=ink)


def compass_rose(d, cx, cy, r, ink, width=3, rhumb=None):
    for k, rr in enumerate((r * 0.98, r * 0.84, r * 0.42)):
        d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], outline=ink, width=max(1, width - k))
    for i in range(72):  # ticks between the two outer rings
        a = i * math.pi / 36
        inner = r * (0.84 if i % 6 else 0.78)
        d.line([(cx + inner * math.cos(a), cy + inner * math.sin(a)), (cx + r * 0.98 * math.cos(a), cy + r * 0.98 * math.sin(a))], fill=ink, width=1 if i % 6 else 2)
    star(d, cx, cy, r * 0.8, ink, width)
    if rhumb:
        for i in range(16):
            a = i * math.pi / 8
            d.line([(cx, cy), (cx + rhumb * math.cos(a), cy + rhumb * math.sin(a))], fill=ink, width=1)


def ship(d, cx, cy, k, ink, fill):
    def P(x, y):
        return (cx + x * k, cy + y * k)
    hull = [P(-46, 0), P(46, 0), P(38, 16), P(20, 24), P(-26, 24), P(-40, 14)]
    d.polygon(hull, outline=ink, fill=fill)
    d.line([P(-46, 0), P(-60, -12), P(-46, -2)], fill=ink, width=3)       # bowsprit and stern
    for mx, top in ((-22, -86), (4, -108), (28, -80)):
        d.line([P(mx, 0), P(mx, top)], fill=ink, width=3)
        d.polygon([P(mx - 17, top + 10), P(mx + 17, top + 10), P(mx + 15, top + 46), P(mx - 15, top + 46)], outline=ink, fill=fill)
        d.line([P(mx - 15, top + 28), P(mx + 15, top + 28)], fill=ink, width=1)
    d.polygon([P(4, -108), P(24, -104), P(4, -98)], fill=ink)             # flag
    for i in range(4):
        x0 = -52 + i * 28
        d.arc([P(x0, 20)[0], P(x0, 20)[1], P(x0 + 26, 34)[0], P(x0 + 26, 34)[1]], 200, 340, fill=ink, width=2)


def wave(d, x, y, ink, k=1.0):
    pts = [(x + i * k, y + 3 * k * math.sin(i / 3.2)) for i in range(0, 26)]
    d.line(pts, fill=ink, width=2)
    pts = [(x + 12 * k + i * k, y + 7 * k + 3 * k * math.sin(i / 3.2)) for i in range(0, 20)]
    d.line(pts, fill=ink, width=2)


def serpent(d, x, y, ink, k=1.0):
    pts = []
    for i in range(0, 120):
        t = i / 119
        pts.append((x + 190 * k * t, y - 26 * k * math.sin(t * 3 * math.pi) * math.sin(t * math.pi * 0.9)))
    d.line(pts, fill=ink, width=int(5 * k))
    hx, hy = pts[-1]
    d.polygon([(hx, hy - 12 * k), (hx + 26 * k, hy - 2 * k), (hx + 4 * k, hy + 10 * k)], fill=ink)
    d.ellipse([hx + 8 * k, hy - 6 * k, hx + 12 * k, hy - 2 * k], fill=0)
    for i in (22, 55, 90):
        px, py = pts[i]
        d.polygon([(px - 6 * k, py - 8 * k), (px, py - 20 * k), (px + 6 * k, py - 8 * k)], fill=ink)  # back fins


def island(d, d_light, cx, cy, rx, ry, phase, ink):
    shore = blob(cx, cy, rx, ry, phase)
    d.polygon(shore, outline=ink, width=4)
    for k, width in ((1.07, 2), (1.15, 2), (1.25, 1)):                    # water lining
        d_light.line(scaled(shore, cx, cy, k) + [scaled(shore, cx, cy, k)[0]], fill=ink, width=width)
    for _ in range(int(rx / 12)):                                          # hills
        hx = cx + rng.uniform(-0.45, 0.45) * rx
        hy = cy + rng.uniform(-0.4, 0.4) * ry
        s = rng.uniform(9, 17)
        d.line([(hx - s, hy + s * 0.6), (hx, hy - s * 0.6), (hx + s, hy + s * 0.6)], fill=ink, width=2)
        d.line([(hx, hy - s * 0.6), (hx + s * 0.5, hy + s * 0.6)], fill=ink, width=1)
    return shore


def map_overlay(wide=False):
    """The inked map as a mask (0..1) and the red of the X as a second mask. `wide` lays it out for a landscape page."""
    mask = Image.new('L', (W * S, H * S), 0)
    faint = Image.new('L', (W * S, H * S), 0)
    red = Image.new('L', (W * S, H * S), 0)
    d, dl, dr = ImageDraw.Draw(mask), ImageDraw.Draw(faint), ImageDraw.Draw(red)
    ink, soft = 255, 120
    s = S
    if wide:
        compass_cx, compass_cy, compass_r, reach = 1390, 690, 118, 2000
        islands = ((300, 330, 150, 100, 0.4), (1010, 560, 112, 80, 2.1), (560, 745, 72, 54, 4.0))
        trail_pts = [(400, 420), (470, 450), (545, 468), (610, 520), (645, 590), (660, 655), (650, 720), (640, 762)]
        x_at, arm = (668, 800), 24
        ship_at, serpent_at, wave_count, wave_box = (880, 190, 1.35), (110, 800), 80, (40, 40, W - 70, H - 60)
        near = [(300, 330, 190), (1010, 560, 150), (560, 745, 110), (compass_cx, compass_cy, 160), (880, 250, 130), (668, 800, 60)]
    else:
        compass_cx, compass_cy, compass_r, reach = 410, 985, 98, 1400
        islands = ((150, 395, 120, 88, 0.4), (392, 650, 88, 62, 2.1), (128, 840, 58, 44, 4.0))
        trail_pts = [(212, 462), (262, 505), (318, 520), (356, 575), (350, 640), (330, 712), (268, 770), (205, 812), (170, 880)]
        x_at, arm = (170, 892), 22
        ship_at, serpent_at, wave_count, wave_box = (380, 268, 1.05), (70, 1095), 38, (40, 190, W - 70, H - 60)
        near = [(150, 395, 190), (392, 650, 150), (128, 840, 110), (compass_cx, compass_cy, 140), (380, 330, 120), (170, 892, 60)]
    # rhumb lines out of the compass, very faint
    for i in range(16):
        a = i * math.pi / 8
        dl.line([(compass_cx * s, compass_cy * s), ((compass_cx + reach * math.cos(a)) * s, (compass_cy + reach * math.sin(a)) * s)], fill=70, width=2)
    for cx, cy, rx, ry, phase in islands:
        island(d, dl, cx * s, cy * s, rx * s, ry * s, phase, ink)
    trail = catmull(trail_pts)
    for x, y in trail[:-1]:
        d.ellipse([x * s - 3.2, y * s - 3.2, x * s + 3.2, y * s + 3.2], fill=ink)
    # the X that marks the spot
    xx0, yy0 = x_at[0] * s, x_at[1] * s
    for a, b in (((-1, -1), (1, 1)), ((-1, 1), (1, -1))):
        dr.line([(xx0 + a[0] * arm * s, yy0 + a[1] * arm * s), (xx0 + b[0] * arm * s, yy0 + b[1] * arm * s)], fill=255, width=11 * s // 2)
    compass_rose(d, compass_cx * s, compass_cy * s, compass_r * s, ink, width=4)
    ship(d, ship_at[0] * s, ship_at[1] * s, ship_at[2] * s, ink, 40)
    serpent(d, serpent_at[0] * s, serpent_at[1] * s, soft, k=s)
    # waves in open water, kept off the islands and the trail
    spots = []
    attempts = 0
    while len(spots) < wave_count and attempts < 4000:
        attempts += 1
        x, y = rng.uniform(wave_box[0], wave_box[2]), rng.uniform(wave_box[1], wave_box[3])
        if any(math.hypot(x - sx, y - sy) < 62 for sx, sy in spots):
            continue
        if min(math.hypot(x - px, y - py) for px, py in trail) < 34:
            continue
        if any(math.hypot(x - ox, y - oy) < r for ox, oy, r in near):
            continue
        spots.append((x, y))
    for x, y in spots:
        wave(d, x * s, y * s, soft, k=s * 1.0)
    return mask, faint, red


def to_alpha(img):
    img = img.resize((W, H), Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.5))
    return np.asarray(img, dtype=np.float32) / 255


def make_map(path, with_art, wide=False):
    img = parchment(wide=wide)
    if with_art:
        mask, faint, red = map_overlay(wide)
        wobble = 0.82 + 0.18 * fbm(H, W, cells=(8, 3), weights=(0.6, 0.4))      # uneven inking
        a = np.clip(to_alpha(mask) * 0.60 * wobble + to_alpha(faint) * 0.30 * wobble, 0, 1)
        ink = np.broadcast_to(np.array([72, 44, 20], np.float32), img.shape).copy()
        img = lerp(img, ink, a)
        ra = np.clip(to_alpha(red) * 0.86 * wobble, 0, 1)
        img = lerp(img, np.broadcast_to(np.array([150, 38, 26], np.float32), img.shape).copy(), ra)
    Image.fromarray(img.astype(np.uint8)).save(path, quality=84, optimize=True)


def make_night(path):
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    n = fbm(H, W)
    base = np.array([21, 38, 49], np.float32)
    deep = np.array([12, 24, 32], np.float32)
    img = lerp(np.broadcast_to(base, (H, W, 3)).copy(), np.broadcast_to(deep, (H, W, 3)).copy(), 0.7 * n)
    img += (rng.random((H, W, 1)).astype(np.float32) - 0.5) * 7
    edge = np.minimum(np.minimum(xx, W - 1 - xx), np.minimum(yy, H - 1 - yy))
    img *= (1 - 0.55 * np.clip(1 - edge / 130, 0, 1) ** 1.6)[..., None]
    mask = Image.new('L', (W * S, H * S), 0)
    d = ImageDraw.Draw(mask)
    cx, cy = 270 * S, 540 * S
    for i in range(32):
        a = i * math.pi / 16
        d.line([(cx, cy), (cx + 1400 * math.cos(a), cy + 1400 * math.sin(a))], fill=60, width=2)
    compass_rose(d, cx, cy, 235 * S, 150, width=4)
    for i in range(30):
        wave(d, rng.uniform(30, W - 60) * S, rng.uniform(60, H - 40) * S, 90, k=S)
    a = to_alpha(mask) * 0.16
    img = lerp(img, np.broadcast_to(np.array([226, 208, 160], np.float32), img.shape).copy(), a)
    Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).save(path, quality=84, optimize=True)


def make_wood(path):
    w, h = 540, 150
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    grain = fbm(h, w, cells=(40, 14, 5), weights=(0.45, 0.35, 0.2), stretch=(0.18, 4.0))
    base = np.array([112, 72, 40], np.float32)
    dark = np.array([66, 40, 20], np.float32)
    img = lerp(np.broadcast_to(base, (h, w, 3)).copy(), np.broadcast_to(dark, (h, w, 3)).copy(), grain * 0.9)
    img += (rng.random((h, w, 1)).astype(np.float32) - 0.5) * 8
    for y0 in (h // 2,):                                              # seam between two planks
        img[y0 - 1:y0 + 1] *= 0.45
        img[y0 + 1:y0 + 2] *= 1.18
    for y_end in (0, h):
        pass
    vignette = 0.82 + 0.18 * np.sin(np.clip(yy / h, 0, 1) * math.pi)
    img *= vignette[..., None]
    pil = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(pil)
    for nx in (16, w - 16):
        for ny in (h * 0.25, h * 0.75):
            d.ellipse([nx - 4, ny - 4, nx + 4, ny + 4], fill=(40, 26, 14))
            d.ellipse([nx - 3, ny - 3, nx + 3, ny + 3], fill=(176, 142, 74))
            d.ellipse([nx - 2, ny - 2, nx, ny], fill=(228, 200, 130))
    pil.save(path, quality=86, optimize=True)


def make_tear(path, rim_path):
    """A ragged edge along the top of a strip; everything below it is solid. The rim is the pale, fibrous band along the tear."""
    w, h, ss = 800, 32, 4
    xs = np.arange(w * ss, dtype=np.float32) / ss

    def noise(n):
        return np.asarray(Image.fromarray(rng.random((1, n)).astype(np.float32), mode='F').resize((w * ss, 1), Image.BICUBIC))[0]

    edge = 15 + (noise(9) - 0.5) * 11 + (noise(40) - 0.5) * 8 + (noise(260) - 0.5) * 4.5
    for _ in range(34):                                                     # nicks and bites
        x = rng.uniform(0, w)
        edge += rng.uniform(2, 6.5) * np.exp(-(((xs - x) / rng.uniform(2.5, 8)) ** 2))
    edge = np.clip(edge, 3, 26)
    shape = Image.new('L', (w * ss, h * ss), 0)
    d = ImageDraw.Draw(shape)
    d.polygon([(0, h * ss), (w * ss, h * ss)] + [(i, float(edge[i]) * ss) for i in range(w * ss - 1, -1, -1)], fill=255)
    alpha = shape.resize((w, h), Image.LANCZOS)
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    out.putalpha(alpha)
    out.save(path, optimize=True)

    # the rim: the strip minus the strip moved down 3px, roughened so it reads as torn fibres and not as an outline
    a = np.asarray(alpha, dtype=np.float32) / 255
    lower = np.zeros_like(a)
    lower[3:] = a[:-3]
    band = np.clip(a - lower, 0, 1)
    fibres = np.asarray(Image.fromarray((rng.random((h, w)) * 255).astype(np.uint8), mode='L').filter(ImageFilter.GaussianBlur(0.7)), dtype=np.float32) / 255
    fibres = np.clip((fibres - fibres.mean()) * 3 + 0.5, 0, 1)
    band = band * np.clip(0.45 + 1.3 * fibres, 0, 1)
    rim = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    rim.putalpha(Image.fromarray((np.clip(band, 0, 1) * 255).astype(np.uint8), mode='L'))
    rim.save(rim_path, optimize=True)


def make_compass(path):
    size = 256
    img = Image.new('L', (size * S, size * S), 0)
    d = ImageDraw.Draw(img)
    compass_rose(d, size * S / 2, size * S / 2 + 6 * S, 92 * S, 255, width=5)
    img = img.resize((size, size), Image.LANCZOS)
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    out.putalpha(img)
    out.save(path, optimize=True)


def make_seal(path, ring_path):
    """A blob of sealing wax with a ragged edge (the app tints it red), and the groove stamped into it (tinted darker)."""
    size, k = 128, 4
    c = size * k / 2
    ph = rng.uniform(0, 6.28, 5)
    pts = []
    for i in range(240):
        t = 2 * math.pi * i / 240
        r = 52 + 3.2 * math.sin(5 * t + ph[0]) + 2.4 * math.sin(9 * t + ph[1]) + 1.6 * math.sin(14 * t + ph[2]) + 1.0 * math.sin(23 * t + ph[3])
        pts.append((c + r * k * math.cos(t), c + r * k * math.sin(t)))
    blob = Image.new('L', (size * k, size * k), 0)
    ImageDraw.Draw(blob).polygon(pts, fill=255)
    # small drips beyond the edge
    d = ImageDraw.Draw(blob)
    for _ in range(5):
        a = rng.uniform(0, 6.28)
        rr = rng.uniform(5, 9) * k
        d.ellipse([c + 54 * k * math.cos(a) - rr, c + 54 * k * math.sin(a) - rr, c + 54 * k * math.cos(a) + rr, c + 54 * k * math.sin(a) + rr], fill=255)
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    out.putalpha(blob.resize((size, size), Image.LANCZOS))
    out.save(path, optimize=True)

    groove = Image.new('L', (size * k, size * k), 0)
    g = ImageDraw.Draw(groove)
    g.ellipse([c - 38 * k, c - 38 * k, c + 38 * k, c + 38 * k], outline=255, width=int(3.2 * k))
    g.ellipse([c - 44 * k, c - 44 * k, c + 44 * k, c + 44 * k], outline=120, width=int(1.4 * k))
    ring = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    ring.putalpha(groove.resize((size, size), Image.LANCZOS).point(lambda v: int(v * 0.8)))
    ring.save(ring_path, optimize=True)


def make_favicon(path):
    """A brass compass on a dark sea, as a round badge. 64x64, drawn at 8x and brought down."""
    size, k = 64, 8
    img = Image.new('RGBA', (size * k, size * k), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    c = size * k / 2
    d.ellipse([k, k, size * k - k, size * k - k], fill=(20, 35, 46, 255))
    d.ellipse([k * 2.2, k * 2.2, size * k - k * 2.2, size * k - k * 2.2], outline=(199, 154, 46, 255), width=int(k * 2.2))
    for a in range(8):
        ang = -math.pi / 2 + a * math.pi / 4
        r = size * k * (0.34 if a % 2 == 0 else 0.2)
        tip = (c + r * math.cos(ang), c + r * math.sin(ang))
        left = (c + size * k * 0.07 * math.cos(ang - 0.9), c + size * k * 0.07 * math.sin(ang - 0.9))
        right = (c + size * k * 0.07 * math.cos(ang + 0.9), c + size * k * 0.07 * math.sin(ang + 0.9))
        d.polygon([tip, left, right], fill=(235, 217, 174, 255) if a % 2 == 0 else (199, 154, 46, 255))
    d.ellipse([c - k * 2.4, c - k * 2.4, c + k * 2.4, c + k * 2.4], fill=(143, 38, 25, 255))
    img.resize((size, size), Image.LANCZOS).save(path, optimize=True)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    make_map(os.path.join(OUT, 'parchment-map.jpg'), with_art=True)
    make_map(os.path.join(OUT, 'parchment-plain.jpg'), with_art=False)
    make_night(os.path.join(OUT, 'night-sea.jpg'))
    make_wood(os.path.join(OUT, 'wood.jpg'))
    make_tear(os.path.join(OUT, 'tear.png'), os.path.join(OUT, 'tear-rim.png'))
    make_compass(os.path.join(OUT, 'compass.png'))
    make_seal(os.path.join(OUT, 'seal.png'), os.path.join(OUT, 'seal-ring.png'))
    make_favicon(os.path.join(HERE, '..', 'assets', 'images', 'favicon-compass.png'))
    # Landscape pages for a desktop browser window. Made last, so running this script again changes none of the pictures above.
    W, H = 1600, 900
    make_map(os.path.join(OUT, 'parchment-map-wide.jpg'), with_art=True, wide=True)
    make_map(os.path.join(OUT, 'parchment-plain-wide.jpg'), with_art=False, wide=True)
    for name in sorted(os.listdir(OUT)):
        print(name, os.path.getsize(os.path.join(OUT, name)) // 1024, 'KB')
