# Face boxes for vocab-card placement: YOLO face detector over assets/kv/*.png -> assets/faces.json
#   {"kv/<name>": {"w": width, "h": height, "f": [[x0, y0, x1, y1] in 0..1, ...]}}
# Needs `pip install ultralytics` and a face model (e.g. a face_yolov8 .pt): --model PATH or env FACE_MODEL.
# usage: python tools/faces.py <project> [--model face_yolov8m.pt] [--conf 0.35]
import os, sys
from kit import project, wj

name, ROOT = project()
arg = lambda k, d: sys.argv[sys.argv.index(k) + 1] if k in sys.argv else d
weights = arg('--model', os.environ.get('FACE_MODEL'))
if not weights:
    raise SystemExit('give a face detection model: --model PATH or FACE_MODEL=PATH')
from ultralytics import YOLO  # noqa: E402  (optional dependency, only needed here)

model = YOLO(weights)
out = {}
for png in sorted((ROOT / 'assets/kv').glob('*.png')):
    r = model(str(png), conf=float(arg('--conf', 0.35)), verbose=False)[0]
    h, w = r.orig_shape
    out[f'kv/{png.stem}'] = {'w': w, 'h': h, 'f': [[round(b[0] / w, 3), round(b[1] / h, 3), round(b[2] / w, 3), round(b[3] / h, 3)] for b in r.boxes.xyxy.tolist()]}
wj(ROOT / 'assets/faces.json', out)
print(name, len(out), 'images', sum(len(v['f']) for v in out.values()), 'faces')
