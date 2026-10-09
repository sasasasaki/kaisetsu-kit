# Video clips -> per-frame JPGs so the renderer can pick the exact frame for any t (deterministic replays).
# assets/video/<id>.mp4 -> assets/video/frames/<id>/0001.jpg ..., frame counts in frames/index.json
# usage: python tools/frames.py <project> [fps=24]
import shutil, subprocess, sys
from kit import project, wj

name, ROOT = project()
fps = sys.argv[2] if len(sys.argv) > 2 else '24'
V = ROOT / 'assets/video'
idx = {}
for mp4 in sorted(V.glob('*.mp4')):
    d = V / 'frames' / mp4.stem
    shutil.rmtree(d, ignore_errors=True); d.mkdir(parents=True)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(mp4), '-vf', f'fps={fps}', '-q:v', '3', str(d / '%04d.jpg')], check=True)
    idx[mp4.stem] = len(list(d.glob('*.jpg')))
wj(V / 'frames/index.json', idx)
print(name, idx)
