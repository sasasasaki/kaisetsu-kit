# Add kanji stroke data to engine/strokes.js (window.STROKES, used by brush.js and sound.py).
# Source: KanjiVG (c) Ulrich Apel, CC BY-SA 3.0. SVGs are read from --src DIR, else downloaded into .cache/kanjivg/.
# usage: python tools/build_strokes.py 道山人 [--src DIR]
import json, re, sys, urllib.request
from pathlib import Path
from kit import REPO

OUT = REPO / 'engine/strokes.js'
HEAD = '// KanjiVG (c) Ulrich Apel, CC BY-SA 3.0 - https://kanjivg.tagaini.net\n'
src = Path(sys.argv[sys.argv.index('--src') + 1]) if '--src' in sys.argv else REPO / '.cache/kanjivg'
chars = [c for c in sys.argv[1] if not c.isspace()] if len(sys.argv) > 1 and not sys.argv[1].startswith('--') else []
strokes = json.loads(re.search(r'=\s*(\{.*\})', OUT.read_text(encoding='utf-8'), re.S).group(1)) if OUT.exists() else {}
for ch in chars:
    code = f'{ord(ch):05x}'
    f = src / f'{code}.svg'
    if not f.exists():
        src.mkdir(parents=True, exist_ok=True)
        f.write_bytes(urllib.request.urlopen(f'https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/{code}.svg', timeout=30).read())
    paths = re.findall(rf'<path id="kvg:{code}-s(\d+)"[^>]*?\sd="([^"]+)"', f.read_text(encoding='utf-8'))
    strokes[ch] = [d for _, d in sorted(paths, key=lambda p: int(p[0]))]
OUT.write_text(HEAD + 'window.STROKES = ' + json.dumps(strokes, ensure_ascii=False) + ';\n', encoding='utf-8', newline='\n')
print(len(strokes), 'glyphs:', ''.join(strokes), '| empty:', [k for k, v in strokes.items() if not v])
