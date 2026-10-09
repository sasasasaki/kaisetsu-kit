# Overlap checker. Hooks CanvasRenderingContext2D.fillText and records the box of every string drawn on any
# full-size canvas: shots are drawn on offscreen layers and then composited, so watching only the main canvas
# misses diagram text (that once produced a false "0 collisions").
#   default  for every vocab card, at a few moments while it is fully open: any text under the card? also reports
#            cards that cover a face > 20%, cards over a summary image, and cards squeezed out by the next one
#   --subs   whole-film scan every <step> s: any non-subtitle text inside the subtitle box?
# Results go to qc/cards.json ({hits, subs}); tools/stage.py gates on both being 0. Exit 1 if anything is found.
# usage: python tools/qc_cards.py <project> [--stills]   |   python tools/qc_cards.py <project> --subs [step=1.5]
import sys, base64, asyncio, subprocess, socket, time
from playwright.async_api import async_playwright
from kit import REPO, project, rj, wj

PROJ, ROOT = project()
STILLS = '--stills' in sys.argv

HOOK = """() => {
  const P = CanvasRenderingContext2D.prototype, f0 = P.fillText, main = document.getElementById('c');
  window.QC_ON = false; window.QC_IN = false; window.QC = [];
  P.fillText = function (s, x, y, ...r) {
    if (window.QC_ON && !window.QC_IN && this.canvas.width === main.width && this.canvas.height === main.height && this.globalAlpha > 0.05 && String(s).trim()) {
      const m = this.measureText(s), T = this.getTransform();
      const xs = [x - m.actualBoundingBoxLeft, x + m.actualBoundingBoxRight], ys = [y - m.actualBoundingBoxAscent, y + m.actualBoundingBoxDescent];
      const p = xs.flatMap(a => ys.map(b => [T.a * a + T.c * b + T.e, T.b * a + T.d * b + T.f]));
      window.QC.push({ sub: !!window.QC_SUB, s: String(s).slice(0, 24), x0: Math.min(...p.map(q => q[0])), y0: Math.min(...p.map(q => q[1])), x1: Math.max(...p.map(q => q[0])), y1: Math.max(...p.map(q => q[1])) });
    }
    return f0.call(this, s, x, y, ...r);
  };
  const c0 = vocabCard; vocabCard = function (...a) { window.QC_IN = true; try { return c0(...a); } finally { window.QC_IN = false; } };
  const s0 = subtitle; subtitle = function (...a) { window.QC_SUB = true; try { return s0(...a); } finally { window.QC_SUB = false; } };
}"""
PROBE = "async t => { window.QC = []; window.QC_ON = true; await renderAt(t); window.QC_ON = false; return window.QC; }"
GRAB = "async t => { await renderAt(t); return document.getElementById('c').toDataURL('image/jpeg', 0.9); }"


def card_rect(c):   # matches vocabCard fully open, plus 8 px of shadow
    if c['pos']:
        x0, y0 = c['pos']
        return x0 - 8, y0 - 8, x0 + 608, y0 + 258
    k = 0.8 if c['compact'] else 1
    x0, y0 = 1920 - 600 * k - (34 if c['compact'] else 50), 58 if c['compact'] else 96
    return x0 - 8, y0 - 8, x0 + 600 * k + 8, y0 + 250 * k + 8


def record(**kw):
    f = ROOT / 'qc/cards.json'
    d = rj(f, {}); d.update(kw); wj(f, d)


async def subs_scan(pg):   # subtitle box: x 300..1620, bottom 1050, top = highest subtitle glyph (incl. speaker tag) in this frame
    i = sys.argv.index('--subs'); step = float(sys.argv[i + 1]) if len(sys.argv) > i + 1 else 1.5
    dur = rj(ROOT / 'src/timeline.json')['dur']
    seen, n, ns = set(), 0, 0
    for k in range(int(dur / step)):
        t = round(0.5 + k * step, 2); qs = await pg.evaluate(PROBE, t); n += 1
        top = min((q['y0'] for q in qs if q['sub']), default=None)
        if top is None:
            continue
        top -= 8; ns += 1
        over = tuple(dict.fromkeys(q['s'] for q in qs if not q['sub'] and q['x0'] < 1620 and q['x1'] > 300 and q['y1'] > top and q['y0'] < 1050))
        if over and over not in seen:
            seen.add(over); print(f'  {t:8.2f}s  in subtitle box: {" / ".join(over)}')
    print(f'{PROJ}: subtitle box scan, {n} moments ({ns} with subtitles), {len(seen)} problems')
    record(subs=len(seen), subs_frames=n)
    return len(seen)


async def main():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(port), '--bind', '127.0.0.1'], cwd=REPO, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.6)
    hits, seen = [], []
    try:
        async with async_playwright() as pw:
            b = await pw.chromium.launch(headless=True)
            pg = await b.new_page(viewport={'width': 1920, 'height': 1080})
            await pg.goto(f'http://127.0.0.1:{port}/engine/index.html?p={PROJ}')
            await pg.wait_for_function('window.READY || window.LOAD_ERROR', timeout=180000)
            await pg.evaluate(HOOK)
            await pg.evaluate('async () => { await renderAt(1); }')
            if '--subs' in sys.argv:
                n = await subs_scan(pg); await b.close(); return n
            cards = await pg.evaluate('() => CARDS.map(c => ({sec: c.sec, k: c.k, term: c.term, t0: c.t0, t1: c.t1, compact: c.compact, pos: c.compact ? null : c.pos, face: c.faceHit || 0, sum: SHOTS.some(s => s.sum && s.t0 < c.t1 + 0.6 && s.t1 > c.t0)}))')
            hits += [(c['t0'] + 0.6, c, ['(over summary image)']) for c in cards if c['sum']]
            hits += [(c['t0'], c, ['(squeezed out)']) for c in cards if c['t1'] < c['t0'] + 1.0]
            hits += [(c['t0'] + 0.6, c, [f"(covers a face {c['face']:.0%})"]) for c in cards if c['face'] > 0.2]   # ~10% is hair or forehead; >20% is a face
            for c in cards:
                rx0, ry0, rx1, ry1 = card_rect(c)
                a, z = c['t0'] + 0.6, c['t1'] - 0.05
                for t in sorted({round(a, 2), round((a + z) / 2, 2), round(z, 2)}) if z > a else [round((c['t0'] + c['t1']) / 2, 2)]:
                    qs = await pg.evaluate(PROBE, t); seen.append(len(qs))
                    over = [q['s'] for q in qs if q['x0'] < rx1 and q['x1'] > rx0 and q['y0'] < ry1 and q['y1'] > ry0]
                    if over:
                        hits.append((t, c, over))
                        if STILLS:
                            (ROOT / 'qc').mkdir(exist_ok=True)
                            (ROOT / f'qc/card-{t:07.2f}.jpg').write_bytes(base64.b64decode((await pg.evaluate(GRAB, t)).split(',', 1)[1]))
                        break
            await b.close()
    finally:
        srv.terminate()
    print(f'{PROJ}: {len(cards)} cards, {len(seen)} moments, {min(seen, default=0)}-{max(seen, default=0)} strings per frame, {len(hits)} hits')
    record(hits=len(hits), cards=len(cards))
    for t, c, over in hits:
        print(f"  {t:8.2f}s  {c['sec']}#{c['k']} {c['term']}{' (compact)' if c['compact'] else ' @' + str(c['pos'])}  <- {' / '.join(dict.fromkeys(over))}")
    return len(hits)


sys.exit(1 if asyncio.run(main()) else 0)
