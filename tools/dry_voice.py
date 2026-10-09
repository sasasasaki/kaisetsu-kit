# Placeholder voice so the whole pipeline runs without a TTS key: one mp3 per line, timed from its length
# (0.3 s + 0.13 s per character), filled with a quiet syllable-like murmur (true silence would read as "no speech"
# to plan.py). Replace with real recordings via tools/tts.py; the file names are the same.
# usage: python tools/dry_voice.py <project>      reads assets/voice/script.json, or comic.json for the comic route
import subprocess
import numpy as np
from kit import project, rj, wj

SR = 48000
name, ROOT = project()
src = ROOT / 'assets/voice/script.json'
lines = rj(src)['lines'] if src.exists() else rj(ROOT / 'comic.json')['lines']
out = ROOT / 'assets/voice/lines'
out.mkdir(parents=True, exist_ok=True)
rng = np.random.default_rng(7)
man = {}
for l in lines:
    d = 0.3 + 0.13 * len(l['plain'])
    t = np.arange(int(d * SR)) / SR
    f0 = rng.uniform(170, 230)   # a hum with two overtones, gated into syllables, fixed loudness
    x = sum(a * np.sin(2 * np.pi * f0 * h * t + rng.uniform(0, 6)) for h, a in ((1, 1), (2, .5), (3.1, .25)))
    syl = 0.35 + 0.65 * np.sin(2 * np.pi * 6.5 * t + rng.uniform(0, 6)) ** 2
    x = x * syl * np.clip(t / 0.05, 0, 1) * np.clip((d - t) / 0.08, 0, 1)
    x *= 0.08 / np.sqrt((x ** 2).mean())
    x = np.concatenate([np.zeros(int(0.15 * SR)), x, np.zeros(int(0.2 * SR))])
    f = out / f"{l['id']}.mp3"
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 's16le', '-ar', str(SR), '-ac', '1', '-i', '-', '-c:a', 'libmp3lame', '-b:a', '64k', str(f)],
                   input=(x * 32767).astype('<i2').tobytes(), check=True)
    man[l['id']] = {'file': f.name, 'dry': True, 'seconds': round(d, 2)}
wj(out / 'manifest.json', man)
print(name, len(man), 'placeholder lines', round(sum(v['seconds'] for v in man.values()), 1), 's of speech')
