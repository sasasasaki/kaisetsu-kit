# Placeholder art for the example, drawn from gradients and simple shapes (no people, no characters).
# Replace with real scene / summary illustrations in a real project; keep the same names.
#   assets/kv/open.png, road.png, mountain.png   full-bleed scenes
#   assets/sum/summary.png                        summary illustration (framed above the subtitles)
#   assets/regions.json                           named boxes that beats point the camera, circles and tags at
#   assets/faces.json                             one demo "face" box on the road sun, so card placement has something to avoid
# usage: python projects/example/make_assets.py
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

A = Path(__file__).resolve().parent / 'assets'
W, H = 1920, 1080
rng = np.random.default_rng(3)


def sky(top, bottom):
    k = np.linspace(0, 1, H)[:, None, None]
    return (np.array(top) * (1 - k) + np.array(bottom) * k) * np.ones((1, W, 1))


def ridge(base, amp, seed, freq=3):
    x = np.linspace(0, 1, W); r = np.random.default_rng(seed)
    y = sum(r.uniform(.3, 1) / (i + 1) * np.sin(2 * np.pi * (freq * (i + 1) * x + r.uniform(0, 1))) for i in range(5))
    return (base - amp * y / 2).astype(int)


def fill_below(im, ys, color):
    d = ImageDraw.Draw(im)
    d.polygon([(0, H)] + [(x, int(y)) for x, y in zip(range(W), ys)] + [(W, H)], fill=color)


def grain(im):
    a = np.asarray(im).astype(float) + rng.normal(0, 3, (H, W, 1))
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


def scene_open():
    im = Image.fromarray(sky((236, 214, 186), (246, 238, 222)).astype(np.uint8))
    ImageDraw.Draw(im).ellipse((1180, 250, 1340, 410), fill=(214, 120, 84))
    for i, (base, amp, col) in enumerate([(620, 160, (176, 168, 160)), (730, 130, (128, 124, 120)), (860, 90, (70, 70, 72))]):
        fill_below(im, ridge(base, amp, 10 + i), col)
    return grain(im.filter(ImageFilter.GaussianBlur(1.2)))


def scene_road():
    im = Image.fromarray(sky((200, 222, 230), (240, 236, 220)).astype(np.uint8))
    d = ImageDraw.Draw(im)
    d.ellipse((1430, 140, 1590, 300), fill=(240, 196, 120))
    fill_below(im, ridge(560, 40, 4, 2), (150, 170, 140))
    d.polygon([(0, 640), (W, 600), (W, H), (0, H)], fill=(118, 146, 100))
    d.polygon([(900, 580), (1010, 580), (1500, H), (380, H)], fill=(196, 178, 146))
    for k in range(8):   # dashed centre line in perspective
        u0, u1 = (k / 8) ** 1.6, ((k + .5) / 8) ** 1.6
        y0, y1 = 580 + u0 * 500, 580 + u1 * 500
        d.polygon([(953 - 2 - 10 * u0, y0), (957 + 2 + 10 * u0, y0), (957 + 2 + 10 * u1, y1), (953 - 2 - 10 * u1, y1)], fill=(240, 232, 214))
    return grain(im.filter(ImageFilter.GaussianBlur(1.0)))


def scene_mountain():
    im = Image.fromarray(sky((180, 196, 214), (230, 228, 224)).astype(np.uint8))
    d = ImageDraw.Draw(im)
    d.polygon([(260, H), (960, 170), (1660, H)], fill=(96, 110, 120))
    d.polygon([(860, 300), (960, 170), (1060, 300), (1000, 280), (960, 310), (920, 280)], fill=(236, 238, 240))
    pts, x, y = [], 700, 1040   # zig-zag path to the top
    for i in range(9):
        pts.append((x, y)); x = 1220 - (x - 700) if i % 2 == 0 else 700 + (1220 - x) * 0.82; y -= 92
        x = 960 + (x - 960) * (1 - i / 10)
    d.line(pts + [(960, 200)], fill=(222, 206, 172), width=10, joint='curve')
    fill_below(im, ridge(960, 50, 8, 4), (64, 80, 70))
    return grain(im.filter(ImageFilter.GaussianBlur(1.0)))


def summary():
    im = Image.new('RGB', (1600, 900), (250, 246, 236))
    d = ImageDraw.Draw(im)
    d.rectangle((40, 40, 1560, 860), outline=(60, 56, 50), width=3)
    for i, col in enumerate([(61, 107, 103), (155, 45, 36), (168, 132, 60)]):
        x = 140 + i * 480
        d.rounded_rectangle((x, 260, x + 360, 620), 24, outline=col, width=6)
        d.ellipse((x + 120, 330, x + 240, 450), fill=col)
        d.rectangle((x + 60, 500, x + 300, 520), fill=(120, 114, 104))
        d.rectangle((x + 60, 550, x + 240, 566), fill=(170, 164, 154))
        if i < 2:
            d.polygon([(x + 390, 430), (x + 450, 440), (x + 390, 450)], fill=(60, 56, 50))
    d.rectangle((140, 120, 900, 150), fill=(60, 56, 50))
    d.rectangle((140, 170, 640, 186), fill=(150, 144, 134))
    return im


for rel, im in [('kv/open.png', scene_open()), ('kv/road.png', scene_road()), ('kv/mountain.png', scene_mountain()), ('sum/summary.png', summary())]:
    p = A / rel; p.parent.mkdir(parents=True, exist_ok=True); im.save(p, optimize=True)
(A / 'regions.json').write_text(json.dumps({'kv/road': {'w': W, 'h': H, 'r': {'path': [0.2, 0.53, 0.78, 1.0], 'sun': [0.74, 0.12, 0.83, 0.29]}},   # named boxes for beats
                                          'kv/mountain': {'w': W, 'h': H, 'r': {'summit': [0.44, 0.15, 0.56, 0.29], 'slope': [0.13, 0.15, 0.87, 1.0]}}}, indent=1), encoding='utf-8')
(A / 'faces.json').write_text(json.dumps({'kv/road': {'w': W, 'h': H, 'f': [[0.74, 0.12, 0.83, 0.29]]}}, indent=1), encoding='utf-8')
print('example assets written to', A)
