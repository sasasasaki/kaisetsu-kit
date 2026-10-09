# Shared paths and small helpers. Projects live in <repo>/projects/<name>/; the engine is served from the repo root.
import json, subprocess, sys
from pathlib import Path
import numpy as np

REPO = Path(__file__).resolve().parent.parent
for _s in (sys.stdout, sys.stderr):
    _s.reconfigure(errors='replace')   # legacy Windows consoles cannot print every CJK character


def project(arg=None):
    """Project name ('example') or path ('projects/example') -> (name, Path)."""
    arg = arg or (sys.argv[1] if len(sys.argv) > 1 else None)
    if not arg:
        raise SystemExit('usage: python tools/<tool>.py <project> ...')
    name = Path(arg).name
    root = REPO / 'projects' / name
    if not root.is_dir():
        raise SystemExit(f'no project folder: {root}')
    return name, root


def rj(p, default=None):
    p = Path(p)
    if not p.exists() and default is not None:
        return default
    return json.loads(p.read_text(encoding='utf-8'))


def wj(p, obj, indent=1):
    p = Path(p); p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj, ensure_ascii=False, indent=indent), encoding='utf-8', newline='\n')


def pcm(path, sr=48000):
    """Decode any audio file to mono float samples."""
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(path), '-ac', '1', '-ar', str(sr), '-f', 's16le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, '<i2').astype(float) / 32768


def speech(path):
    """(silence before speech, speech length) in seconds; frames above -42 dBFS count as speech."""
    v = pcm(path)
    e = 20 * np.log10(np.sqrt((v[:len(v) // 480 * 480].reshape(-1, 480) ** 2).mean(1)) + 1e-9)
    on = np.where(e > -42)[0]
    if not len(on):
        return 0.0, len(v) / 48000
    return on[0] * 0.01, (on[-1] + 1 - on[0]) * 0.01


def probe_dur(path):
    return float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(path)], capture_output=True, text=True).stdout)
