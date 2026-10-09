# Placeholder manga pages for the comic-route example: panel borders, shapes and empty balloons (no characters).
# usage: python projects/comic-example/make_assets.py   -> assets/pages/p1.png, p2.png
from pathlib import Path
from PIL import Image, ImageDraw

A = Path(__file__).resolve().parent / 'assets/pages'
A.mkdir(parents=True, exist_ok=True)
PANELS = {'p1': [(40, 40, 1160, 820), (40, 860, 1160, 1660)], 'p2': [(40, 40, 590, 1000), (630, 40, 1160, 1000), (40, 1040, 1160, 1660)]}
TONES = [(214, 222, 228), (228, 218, 200), (206, 218, 204), (226, 210, 214), (218, 214, 230)]
k = 0
for page, boxes in PANELS.items():
    im = Image.new('RGB', (1200, 1700), (250, 250, 246)); d = ImageDraw.Draw(im)
    for x0, y0, x1, y1 in boxes:
        d.rectangle((x0, y0, x1, y1), fill=TONES[k % 5], outline=(20, 20, 20), width=6)
        w, h = x1 - x0, y1 - y0
        d.polygon([(x0 + w * .1, y1 - 6), (x0 + w * .45, y0 + h * .45), (x0 + w * .8, y1 - 6)], fill=(120, 128, 136))   # a hill
        d.ellipse((x1 - w * .3, y0 + h * .12, x1 - w * .12, y0 + h * .12 + w * .18), fill=(236, 196, 120))           # a sun
        d.ellipse((x0 + 30, y0 + 30, x0 + 30 + w * .38, y0 + 30 + h * .2), fill=(255, 255, 255), outline=(20, 20, 20), width=4)   # empty balloon
        k += 1
    im.save(A / f'{page}.png', optimize=True)
print('pages written to', A)
