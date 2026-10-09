# Layout QC: open the film page headless, step through it, record every piece of text drawn on the main canvas (with its real transformed
# position) and every paper panel, and report four kinds of problems:
#   offscreen  text past an edge of the frame
#   overflow   text sitting on a paper panel but sticking out of it (a card's reading running off the card)
#   undersub   non-subtitle text inside the subtitle box (the box as drawn in that frame)
#   overlap    two different pieces of text overlapping (tag on tag)
# Flagged frames are saved to qc/layout/ and listed in qc/layout.json; exits 1 if anything is found, 2 if the page throws.
# Text shorter than 14 px (cards shrinking into the word book) and the header crossfade are ignored. Faces are not checked here: look at frames.
# usage: python tools/qc_layout.py <project> [step seconds=0.5] [from to]
import sys, json, base64, asyncio, subprocess, socket, time
from playwright.async_api import async_playwright
from kit import REPO, project, rj

PROJ, ROOT = project()
STEP = float(sys.argv[2]) if len(sys.argv) > 2 else 0.5
TL = rj(ROOT / 'src/timeline.json')
T0 = float(sys.argv[3]) if len(sys.argv) > 4 else 0.0
T1 = float(sys.argv[4]) if len(sys.argv) > 4 else TL['dur']
OUT = ROOT / 'qc/layout'
PAGE = 'comic.html' if TL.get('route') == 'comic' else 'index.html'

HOOK = r"""
(() => {
  const C = CanvasRenderingContext2D.prototype, main = document.getElementById('c');
  window.__QC = { text: [], paper: [] };
  const box = (g, x0, y0, x1, y1) => { const m = g.getTransform(), p = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map(([x, y]) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]);
    return [Math.min(...p.map(q => q[0])), Math.min(...p.map(q => q[1])), Math.max(...p.map(q => q[0])), Math.max(...p.map(q => q[1]))]; };
  const ft = C.fillText;
  C.fillText = function (s, x, y, mw) {
    if (this.canvas === main && this.globalAlpha > 0.35 && String(s).trim()) {
      const mt = this.measureText(s), w = mt.width, al = this.textAlign, x0 = al === 'center' ? x - w / 2 : (al === 'right' || al === 'end') ? x - w : x;
      const asc = mt.actualBoundingBoxAscent || 0, des = mt.actualBoundingBoxDescent || 0;
      window.__QC.text.push({ s: String(s), b: box(this, x0, y - asc, x0 + w, y + des), sub: !!window.__QC_SUB });
    }
    return ft.call(this, s, x, y, mw);
  };
  const fr = C.fillRect;
  C.fillRect = function (x, y, w, h) {
    if (this.canvas === main && this.globalAlpha > 0.5 && typeof this.fillStyle === 'string' && this.fillStyle.toLowerCase() === (typeof PAPER !== 'undefined' ? PAPER : '#f3eee3').toLowerCase() && w < main.width * 0.9)
      window.__QC.paper.push(box(this, x, y, x + w, y + h));
    return fr.call(this, x, y, w, h);
  };
  const sub0 = window.subtitle;
  if (sub0) window.subtitle = subtitle = function (g, t) { window.__QC_SUB = true; try { return sub0(g, t); } finally { window.__QC_SUB = false; } };
})();
"""
PROBE = "async t => { window.__QC = { text: [], paper: [] }; await renderAt(t); return window.__QC; }"
GRAB = "() => document.getElementById('c').toDataURL('image/jpeg', 0.9)"


def serve():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
    p = subprocess.Popen([sys.executable, '-m', 'http.server', str(port), '--bind', '127.0.0.1'], cwd=REPO, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.6)
    return p, f'http://127.0.0.1:{port}/engine/{PAGE}?p={PROJ}'


def inter(a, b):
    return max(0, min(a[2], b[2]) - max(a[0], b[0])) * max(0, min(a[3], b[3]) - max(a[1], b[1]))


def check(q, W=1920, H=1080):
    bad = []
    subs = [x for x in q['text'] if x['sub']]
    subbox = [min(x['b'][0] for x in subs) - 130, min(x['b'][1] for x in subs) - 14,   
              max(x['b'][2] for x in subs) + 30, H] if subs else None
    others = [x for x in q['text'] if not x['sub'] and x['b'][3] - x['b'][1] >= 14]   
    for x in others:
        b = x['b']
        if b[0] < -2 or b[1] < -2 or b[2] > W + 2 or b[3] > H + 2:
            bad.append(('offscreen', x['s'], b))
        if subbox and inter(b, subbox) > 0.25 * (b[2] - b[0]) * (b[3] - b[1]):
            bad.append(('undersub', x['s'], b))
        hosts = [p for p in q['paper'] if inter(b, p) > 0.3 * (b[2] - b[0]) * (b[3] - b[1])]
        if hosts and not any(p[0] - 3 <= b[0] and b[2] <= p[2] + 3 and p[1] - 3 <= b[1] and b[3] <= p[3] + 3 for p in hosts):
            bad.append(('overflow', x['s'], b))
    for i, a in enumerate(others):
        for c in others[i + 1:]:
            if a['b'][3] < 64 and c['b'][3] < 64:   
                continue
            if a['s'] != c['s'] and inter(a['b'], c['b']) > 0.2 * min((a['b'][2] - a['b'][0]) * (a['b'][3] - a['b'][1]), (c['b'][2] - c['b'][0]) * (c['b'][3] - c['b'][1])):
                bad.append(('overlap', a['s'] + ' ／ ' + c['s'], a['b']))
    return bad


async def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for f in OUT.glob('*.jpg'): f.unlink()
    srv, url = serve()
    found, last = [], {}
    try:
        async with async_playwright() as pw:
            b = await pw.chromium.launch(headless=True, args=['--use-angle=d3d11', '--ignore-gpu-blocklist'])
            pg = await b.new_page(viewport={'width': 1920, 'height': 1080})
            errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.goto(url); await pg.wait_for_function('window.READY', timeout=180000)
            if errs:   
                print('PAGE ERROR', errs[:3]); sys.exit(2)
            await pg.evaluate(HOOK)
            t = T0
            while t <= T1:
                try:   # a frame that takes over 60 s means the page is stuck: fail instead of hanging
                    q = await asyncio.wait_for(pg.evaluate(PROBE, t), 60)
                except asyncio.TimeoutError:
                    print(f'STUCK at {t}s'); await b.close(); sys.exit(3)
                for kind, s, bx in check(q):
                    key = (kind, s)
                    if key in last and t - last[key] <= STEP * 1.5:   
                        last[key] = t; continue
                    last[key] = t
                    shot = OUT / f'{t:07.2f}-{kind}.jpg'
                    if not shot.exists(): shot.write_bytes(base64.b64decode((await pg.evaluate(GRAB)).split(',', 1)[1]))
                    found.append({'t': round(t, 2), 'kind': kind, 'text': s, 'box': [round(v) for v in bx], 'shot': str(shot.relative_to(ROOT))})
                t = round(t + STEP, 3)
            await b.close()
    finally:
        srv.terminate()
    (ROOT / 'qc/layout.json').write_text(json.dumps({'step': STEP, 'from': T0, 'to': T1, 'issues': found}, ensure_ascii=False, indent=1), encoding='utf-8')
    from collections import Counter
    print(PROJ, f'{T0:g}-{T1:g}s step {STEP}:', len(found), 'issues', dict(Counter(f['kind'] for f in found)), 'PASS' if not found else 'FAIL')
    for f in found[:40]:
        print(f"  {f['t']:7.2f} {f['kind']:9s} {f['text'][:40]}  {f['box']}")
    sys.exit(1 if found else 0)


from runlock import heavy
with heavy(f'{PROJ} qc_layout'):   # it opens a browser too: queue behind renders
    asyncio.run(main())
