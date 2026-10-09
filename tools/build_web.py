# Web package: python tools/build_web.py <project> -> projects/<p>/web/
#   ch1..N.mp4   final.mp4 cut at the board's chapter starts; 720p two-pass H.264, bitrate sized so the page stays
#                <= ~60 MB and every file <= 15 MB (static hosts often cap file size)
#   poster.jpg   frame from the title shot; illus-*.jpg thumbnails of assets/illus/*.png (+ .brief.txt prompt if present)
#   data.json    title, chapters, sections, lines (ja + zh + en + speaker), cast, illustrations
#   index.html   copy of engine/page.html (data driven)
import json, subprocess
from PIL import Image
from kit import REPO, project, rj

name, ROOT = project()
WEB = ROOT / 'web'
WEB.mkdir(exist_ok=True)
T = rj(ROOT / 'src/timeline.json')
B = rj(ROOT / 'src/board.json')
FILM = ROOT / 'renders/final.mp4'
CAST = {c['id']: c for c in rj(ROOT / 'assets/cast/cast.json', {'cast': []})['cast']}


def ff(*a):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', *map(str, a)], check=True)


def thumb(src, dst, box, q=82):
    im = Image.open(src).convert('RGB'); im.thumbnail(box, Image.LANCZOS); im.save(dst, quality=q, optimize=True)


S = T['secs']
cuts = [S[c['from']][0] for c in B['chapters']] + [T['dur']]
budget = 56e6 * 8 / T['dur']   # average total bitrate (video + 64k audio)
chapters = []
for k, c in enumerate(B['chapters']):
    a, b = cuts[k], cuts[k + 1]
    rate = int(min(budget, 14.4e6 * 8 / (b - a)) / 1000) - 64
    out = WEB / f'ch{k + 1}.mp4'
    x264 = ['-vf', 'scale=1280:720:flags=lanczos', '-c:v', 'libx264', '-preset', 'slow', '-threads', '4', '-b:v', f'{rate}k', '-profile:v', 'high',
            '-pix_fmt', 'yuv420p', '-g', '96', '-passlogfile', ROOT / f'renders/_web_ch{k + 1}']
    ff('-ss', a, '-to', b, '-i', FILM, *x264, '-pass', '1', '-an', '-f', 'null', '-')
    ff('-ss', a, '-to', b, '-i', FILM, *x264, '-pass', '2', '-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart', out)
    chapters.append({'file': out.name, 'name': c['name'], 't0': round(a, 3), 't1': round(b, 3), 'kbps': rate, 'mb': round(out.stat().st_size / 1e6, 2)})
    print(out.name, chapters[-1]['mb'], 'MB', rate, 'kbps', flush=True)

title_t = next((S[s['id']][0] for s in B['secs'] if any(sh['type'] == 'title' for sh in s['shots'])), S[B['secs'][0]['id']][0])
ff('-ss', min(title_t + 6.5, T['dur'] - 1), '-i', FILM, '-frames:v', '1', '-vf', 'scale=1280:720:flags=lanczos', '-q:v', '3', WEB / 'poster.jpg')
illus = []
for p in sorted((ROOT / 'assets/illus').glob('*.png')):
    thumb(p, WEB / f'illus-{p.stem}.jpg', (800, 450))
    brief = p.with_suffix('.brief.txt')
    illus.append({'id': p.stem, 'brief': brief.read_text(encoding='utf-8') if brief.exists() else ''})
cast = []
for w in sorted({l['who'] for l in T['lines']}):
    c = CAST.get(w, {})
    if c.get('image'):
        thumb(ROOT / 'assets/cast' / c['image'], WEB / f'cast-{w}.jpg', (420, 630))
    cast.append({'id': w, 'name': c.get('name', w), 'accent': c.get('accent', '#9b2d24'), 'image': bool(c.get('image')), 'lines': sum(1 for l in T['lines'] if l['who'] == w)})
script = {l['id']: l for l in rj(ROOT / 'assets/voice/script.json')['lines']}
label = {s['id']: s['label'] for s in B['secs']}
data = {'film': B['film'], 'mark': B.get('mark', ''), 'dur': T['dur'], 'chapters': chapters,
        'secs': [{'id': s, 'name': label[s], 't': a} for s, (a, b) in S.items()],
        'lines': [{'t': l['at'], 'who': l['who'], 'jp': script[l['id']]['plain'], 'zh': script[l['id']]['zh'], 'en': script[l['id']].get('en', '')} for l in T['lines']],
        'cast': cast, 'illus': illus}
(WEB / 'data.json').write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
(WEB / 'index.html').write_text((REPO / 'engine/page.html').read_text(encoding='utf-8').replace('<title>Explainer</title>', f"<title>{B['film']}</title>", 1), encoding='utf-8', newline='\n')
tot = sum(f.stat().st_size for f in WEB.iterdir())
print('files', len(list(WEB.iterdir())), 'total', round(tot / 1e6, 1), 'MB')
