# Image-to-video clips through an OpenAI-style video generation API (e.g. a Seedance gateway).
# env: VIDEO_API_KEY, VIDEO_BASE_URL, optional VIDEO_MODEL (default seedance-2.0). Keys are never printed.
# usage: python tools/clips.py <project> <id>[,<id>...]        list = assets/video/clips.json
#   {"id": "c1", "type": 2, "frames": ["assets/kv/road.png"], "duration": 5, "ratio": "16:9", "prompt": "...", "rejected": []}
#   type 2 = from a first frame, type 3 = between first and last frame (two frames)
# Output assets/video/<id>.mp4; assets/video/manifest.json records task id, model, prompt, input and output sha256.
# Guardrails: generate a pilot clip before a batch; an id with 3 rejected takes (reasons in "rejected") is not retried:
# rethink the prompt or the frame instead of paying for a fourth roll.
import os, sys, json, time, base64, hashlib, io, urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import requests
from PIL import Image
from kit import project, rj, wj

name, ROOT = project()
BASE, KEY = os.environ.get('VIDEO_BASE_URL', '').rstrip('/'), os.environ.get('VIDEO_API_KEY', '')
if not (BASE and KEY):
    raise SystemExit('set VIDEO_BASE_URL and VIDEO_API_KEY')
MODEL = os.environ.get('VIDEO_MODEL', 'seedance-2.0')
OUT = ROOT / 'assets/video'
AUTH = {'Authorization': 'Bearer ' + KEY}


def data_uri(p):
    buf = io.BytesIO(); Image.open(p).convert('RGB').save(buf, 'JPEG', quality=95)
    return 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode()


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def run(c):
    body = {'model': MODEL, 'text': c['prompt'], 'videoType': c['type'], 'imageUrls': [data_uri(ROOT / f) for f in c['frames']],
            'resolution': c.get('resolution', '1080p'), 'ratio': c.get('ratio', '16:9'), 'duration': c['duration']}
    r = requests.post(BASE + '/v1/video-generations', headers=AUTH, json=body, timeout=180)
    d = r.json()
    if r.status_code != 200 or d.get('code') not in (200, 0):
        raise RuntimeError(f"{c['id']} create failed {r.status_code}: {str(d)[:400]}")
    data = d.get('data'); tid = data if isinstance(data, str) else (data or {}).get('taskId')
    print(c['id'], 'task', tid, flush=True)
    for _ in range(90):
        time.sleep(10)
        g = requests.get(f'{BASE}/v1/video-generations/{tid}', headers=AUTH, timeout=30).json()
        st = (g.get('data') or {}).get('status')
        if st in ('success', 'succeeded', 'completed'):
            out = OUT / f"{c['id']}.mp4"
            out.write_bytes(urllib.request.urlopen(urllib.request.Request(g['data']['videoUrl'], headers={'User-Agent': 'kaisetsu-kit'}), timeout=300).read())
            print(c['id'], 'saved', out.stat().st_size // 1024, 'KB', flush=True)
            return {'task': tid, 'model': MODEL, 'type': c['type'], 'ratio': body['ratio'], 'duration': c['duration'], 'prompt': c['prompt'],
                    'inputs': {f: sha(ROOT / f) for f in c['frames']}, 'output': f"assets/video/{c['id']}.mp4", 'sha256': sha(out), 'when': time.strftime('%Y-%m-%d %H:%M:%S')}
        if st in ('failed', 'error', 'cancelled'):
            raise RuntimeError(f"{c['id']} failed: {str(g)[:500]}")
    raise RuntimeError(f"{c['id']} timeout")


def safe(k):   # one failure (e.g. a content filter) does not sink the batch
    try:
        return k, run(clips[k])
    except RuntimeError as e:
        print(e, flush=True)
        return k, None


clips = {c['id']: c for c in rj(OUT / 'clips.json')}
ids = sys.argv[2].split(',')
for k in ids:
    if len(clips[k].get('rejected', [])) >= 3:
        raise SystemExit(f'{k}: 3 takes rejected already; change the prompt or the frame and clear "rejected" first')
with ThreadPoolExecutor(len(ids)) as ex:
    res = list(ex.map(safe, ids))
man = rj(OUT / 'manifest.json', {})
man.update({k: v for k, v in res if v})
wj(OUT / 'manifest.json', man)
failed = [k for k, v in res if not v]
print('done', [k for k, v in res if v], 'failed', failed)
sys.exit(1 if failed else 0)
