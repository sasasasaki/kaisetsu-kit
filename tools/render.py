# Frame grabber: headless Chromium opens the engine page, calls renderAt(t) for every frame (frame-accurate, no clock),
# pipes canvas JPEGs into ffmpeg. Subtitles are burned in; audio = renders/audio.wav (tools/sound.py).
# usage:
#   python tools/render.py <project> stills <sec> [<sec> ...]   -> qc/still-<sec>.jpg   ("auto" = middle of every shot)
#   python tools/render.py <project> sheet [step=6]             -> qc/sheet.jpg contact sheet
#   python tools/render.py <project> video [workers=3]          -> renders/video.mp4, then mux -> renders/final.mp4
#   python tools/render.py <project> mux                        -> re-mux after changing only the sound
# Only one full render runs per machine: <repo>/.render.lock holds the pid; a stale lock is taken over.
import os, sys, json, base64, asyncio, subprocess, socket, time
from io import BytesIO
from pathlib import Path
from playwright.async_api import async_playwright
from kit import REPO, project, rj

PROJ, ROOT = project()
TL = rj(ROOT / 'src/timeline.json')
ARGS = sys.argv[2:]
OUT = ROOT / 'renders'
FPS, DUR = TL['fps'], TL['dur']
PAGE = 'comic.html' if TL.get('route') == 'comic' else 'index.html'
GRAB = "async t => { await renderAt(t); return document.getElementById('c').toDataURL('image/jpeg', 0.94); }"


def serve():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
    p = subprocess.Popen([sys.executable, '-m', 'http.server', str(port), '--bind', '127.0.0.1'], cwd=REPO, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.6)
    return p, f'http://127.0.0.1:{port}/engine/{PAGE}?p={PROJ}'


async def page(pw, url):
    b = await pw.chromium.launch(headless=True, args=['--use-angle=d3d11', '--ignore-gpu-blocklist'] if os.name == 'nt' else [])
    pg = await b.new_page(viewport={'width': 1920, 'height': 1080})
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto(url)
    await pg.wait_for_function('window.READY || window.LOAD_ERROR', timeout=180000)
    if await pg.evaluate('window.LOAD_ERROR'):
        raise SystemExit('page failed to load: ' + await pg.evaluate('window.LOAD_ERROR'))
    print('ready', await pg.evaluate('window.READY'), flush=True)
    return b, pg, errs


async def grab(pg, t):
    return base64.b64decode((await pg.evaluate(GRAB, t)).split(',', 1)[1])


async def stills(times):
    srv, url = serve()
    try:
        async with async_playwright() as pw:
            b, pg, errs = await page(pw, url)
            if 'auto' in times:
                times = [t for t in times if t != 'auto'] + await pg.evaluate("() => typeof SHOTS !== 'undefined' ? SHOTS.map(s => +((s.t0 + s.t1) / 2).toFixed(2)) : TL.panels.map(p => +((p.arrive + p.end) / 2).toFixed(2))")
            (ROOT / 'qc').mkdir(exist_ok=True)
            for t in map(float, times):
                (ROOT / f'qc/still-{t:06.2f}.jpg').write_bytes(await grab(pg, t))
            print('stills', len(times), 'errors', errs[:5])
            await b.close()
            if errs:
                raise SystemExit(1)
    finally:
        srv.terminate()


async def sheet(step):
    from PIL import Image, ImageDraw
    times = [round(x * step, 2) for x in range(int(DUR / step) + 1)]
    srv, url = serve()
    tiles = []
    try:
        async with async_playwright() as pw:
            b, pg, errs = await page(pw, url)
            for t in times:
                im = Image.open(BytesIO(await grab(pg, t))).resize((320, 180))
                ImageDraw.Draw(im).text((4, 4), f'{t:.1f}s', fill=(255, 255, 0)); tiles.append(im)
            print('errors', errs[:5])
            await b.close()
    finally:
        srv.terminate()
    cols = 6; rows = (len(tiles) + cols - 1) // cols
    s = Image.new('RGB', (cols * 324, rows * 184), (40, 40, 40))
    for i, im in enumerate(tiles):
        s.paste(im, ((i % cols) * 324, (i // cols) * 184))
    (ROOT / 'qc').mkdir(exist_ok=True)
    s.save(ROOT / 'qc/sheet.jpg', quality=85)


def mux():
    if not (OUT / 'audio.wav').exists():
        print('no renders/audio.wav, video only'); return
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(OUT / 'video.mp4'), '-i', str(OUT / 'audio.wav'), '-c:v', 'copy',
                    '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-t', str(DUR), '-movflags', '+faststart',
                    str(OUT / 'final.mp4')], check=True)
    print('muxed', OUT / 'final.mp4')


async def worker(pw, url, f0, f1, out):
    b, pg, errs = await page(pw, url)
    ff = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'image2pipe', '-framerate', str(FPS), '-c:v', 'mjpeg', '-i', '-',
                           '-c:v', 'libx264', '-preset', 'medium', '-crf', '15', '-pix_fmt', 'yuv420p', '-r', str(FPS), '-threads', '2', str(out)],
                          stdin=subprocess.PIPE)
    t0 = time.time()
    for f in range(f0, f1):
        ff.stdin.write(await grab(pg, f / FPS))
        if (f - f0) % 480 == 0:
            print(f'  {out.name} {f - f0}/{f1 - f0}  {time.time() - t0:.0f}s', flush=True)
    ff.stdin.close(); ff.wait()
    if errs:
        print('errors', out.name, errs[:3])
    await b.close()


async def video(n):
    total = int(round(DUR * FPS))
    cuts = [round(total * k / n) for k in range(n + 1)]
    OUT.mkdir(exist_ok=True)
    outs = [OUT / f'_seg{k}.mp4' for k in range(n)]
    srv, url = serve()
    try:
        async with async_playwright() as pw:
            await asyncio.gather(*[worker(pw, url, cuts[k], cuts[k + 1], outs[k]) for k in range(n)])
    finally:
        srv.terminate()
    lst = OUT / '_segs.txt'
    lst.write_text(''.join(f"file '{o.name}'\n" for o in outs), encoding='utf-8')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', str(lst), '-c', 'copy', str(OUT / 'video.mp4')], check=True)
    for o in outs:
        o.unlink()
    lst.unlink()
    mux()
    print('done', total, 'frames')


def alive(pid):
    if os.name == 'nt':
        return str(pid) in subprocess.run(['tasklist', '/FI', f'PID eq {pid}', '/NH'], capture_output=True, text=True).stdout
    try:
        os.kill(pid, 0); return True
    except OSError:
        return False


if __name__ == '__main__':
    mode = ARGS[0]
    if mode == 'stills':
        asyncio.run(stills(ARGS[1:]))
    elif mode == 'sheet':
        asyncio.run(sheet(float(ARGS[1]) if len(ARGS) > 1 else 6.0))
    elif mode == 'video':
        LOCK = REPO / '.render.lock'
        while LOCK.exists() and alive(int(LOCK.read_text().split()[0])):
            print('waiting for render lock held by', LOCK.read_text().strip(), flush=True); time.sleep(30)
        LOCK.write_text(f'{os.getpid()} {PROJ}')
        try:
            asyncio.run(video(int(ARGS[1]) if len(ARGS) > 1 else 3))
        finally:
            LOCK.unlink(missing_ok=True)
    elif mode == 'mux':
        mux()
    else:
        raise SystemExit('modes: stills | sheet | video | mux')
