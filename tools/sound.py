# Soundtrack, all procedural and deterministic: voice lines placed at their timeline times plus synthesized music and effects.
# Explainer: a pad per section (chord by board mood), a swish + bell at section changes, brush sounds that follow the
#   kanji stroke data, a low hit + koto phrase on the title, ticks as table/list rows appear; music ducks ~6 dB under speech.
# Comic route (timeline route == "comic"): page-turn effects, knocks, shake hits, a warm pad per page, voice, ducking,
#   then a two-pass linear loudnorm to -16 LUFS.
# Output: renders/audio.wav (+ qc/audio_strip.png for the explainer).
# usage: python tools/sound.py <project>
import json, re, subprocess, wave
import numpy as np
from scipy.signal import butter, sosfilt, oaconvolve, lfilter
from PIL import Image, ImageDraw
from kit import REPO, project, rj, pcm

name, ROOT = project()
T = rj(ROOT / 'src/timeline.json')
SR = 48000
N = int(round(T['dur'] * SR))
DRY = np.zeros((2, N), np.float32)
WET = np.zeros((2, N), np.float32)
rng = np.random.default_rng(20261002)


def hz(m): return 440.0 * 2 ** ((m - 69) / 12)
def tv(d): return np.arange(int(d * SR)) / SR
def noise(d): return rng.standard_normal(int(d * SR))
def filt(x, kind, f, order=2): return sosfilt(butter(order, f, kind, fs=SR, output='sos'), x)


def swell(d, a, r):
    t = tv(d)
    k = np.minimum(np.clip(t / a, 0, 1), np.clip((d - t) / r, 0, 1))
    return k * k * (3 - 2 * k)


def add(x, t0, gain, pan=0.0, wet=0.25, dry=None, wetbuf=None):
    dry = DRY if dry is None else dry
    wetbuf = WET if wetbuf is None else wetbuf
    i = int(round(t0 * SR))
    if i < 0:
        x, i = x[-i:], 0
    n = min(len(x), N - i)
    if n <= 0:
        return
    th = (pan + 1) * np.pi / 4
    for c, g in enumerate((np.cos(th), np.sin(th))):
        dry[c, i:i + n] += (x[:n] * gain * g).astype(np.float32)
        wetbuf[c, i:i + n] += (x[:n] * gain * g * wet).astype(np.float32)


def koto(t0, m, gain, pan=0.0, d=3.2, bright=5000):   # Karplus-Strong pluck
    p = int(SR / hz(m))
    x = np.zeros(int(d * SR)); x[:p] = filt(rng.uniform(-1, 1, p), 'lowpass', bright)
    a = np.zeros(p + 2); a[0], a[p], a[p + 1] = 1, -0.4985, -0.4985
    y = filt(lfilter([1], a, x), 'lowpass', 6000) * np.minimum(1, tv(d) / 0.002)
    add(y / (np.abs(y).max() + 1e-9), t0, gain, pan, 0.4)


def phrase(t0, notes, beat, gain, pan=0.0):
    for b, m in notes:
        koto(t0 + b * beat, m, gain, pan)


def rin(t0, gain, f=880.0, pan=0.0):   # small bell
    t = tv(6.0)
    x = sum(a * np.sin(2 * np.pi * f * r * t + r) * np.exp(-t / tau) for r, a, tau in ((1, 1, 2.6), (2.71, 0.5, 1.4), (5.12, 0.25, 0.6), (1.006, 0.7, 2.4)))
    add(x * np.minimum(1, t / 0.002), t0, gain, pan, 0.6)


def pad(t0, t1, notes, gain, bright=1100):
    d = t1 - t0; t = tv(d); x = np.zeros_like(t)
    for m in notes:
        f = hz(m)
        x += np.sin(2 * np.pi * f * t) + 0.8 * np.sin(2 * np.pi * f * 1.004 * t + 1.3) + 0.2 * np.sin(2 * np.pi * f * 2 * t)
    x = filt(x, 'lowpass', bright) * (0.8 + 0.2 * np.sin(2 * np.pi * 0.11 * t))
    add(x / len(notes) * swell(d, min(2.5, d / 3), min(2.5, d / 3)), t0, gain, 0, 0.6)


def swish(t0, d, gain, pan=0.0):
    u = tv(d) / d
    add(filt(noise(d), 'bandpass', [500, 3200]) * np.sin(np.pi * u) ** 1.5, t0, gain, pan, 0.3)


def flip(t0, gain):   # paper flip: one short and one long rustle
    for dt, d in ((0, 0.09), (0.07, 0.22)):
        u = tv(d) / d
        add(filt(noise(d), 'bandpass', [1800, 7000]) * np.exp(-u * 4) * (1 - np.exp(-u * 40)), t0 + dt, gain, 0.25, 0.2)


def tick(t0, gain, f=1200, pan=0.0):   # soft wooden tick
    t = tv(0.12)
    add(np.sin(2 * np.pi * f * t) * np.exp(-t / 0.018) + 0.3 * filt(noise(0.12), 'highpass', 3000) * np.exp(-t / 0.006), t0, gain, pan, 0.2)


def boom(t0, gain):   # low hit
    t = tv(2.5)
    x = np.sin(2 * np.pi * np.cumsum(48 * (1 + 1.5 * np.exp(-t / 0.08))) / SR) * np.exp(-t / 0.7) + 0.4 * filt(noise(2.5), 'lowpass', 300) * np.exp(-t / 0.25)
    add(x, t0, gain, 0, 0.5)


def knock(t0, gain):   # wooden door
    t = tv(0.18)
    body = np.sin(2 * np.pi * 180 * t) * np.exp(-t * 38) + 0.5 * np.sin(2 * np.pi * 410 * t) * np.exp(-t * 60)
    add(body + filt(noise(0.18), 'bandpass', [1500, 4500]) * np.exp(-t * 120) * 0.6, t0, gain, 0.25, 0.15)


def brush(t0, d, gain, pan=-0.3):   # one brush stroke
    u = tv(d) / d
    e = np.sin(np.pi * u) ** 0.7 * (1 + 0.3 * np.exp(-u / 0.08))
    add(filt(noise(d), 'bandpass', [1100, 4500]) * e * (1 + 0.5 * filt(noise(d), 'lowpass', 30)), t0, gain, pan, 0.15)


STROKES = json.loads(re.search(r'window\.STROKES\s*=\s*(\{.*\})', (REPO / 'engine/strokes.js').read_text(encoding='utf-8'), re.S).group(1))


def path_len(d):
    nums = [float(v) for v in re.findall(r'-?\d+\.?\d*', d)]
    pts = np.array(nums[:len(nums) // 2 * 2]).reshape(-1, 2)
    return float(np.linalg.norm(np.diff(pts, axis=0), axis=1).sum()) if len(pts) > 1 else 10.0


def write_text(s, t0, gain):   # mirrors brush.js writeLine timing: glyphDur = clamp(0.3 + strokes * 0.07, 0.4, 1.3), next glyph at 0.9
    tt = t0
    for ch in s:
        ss = STROKES.get(ch, [])
        d = min(1.3, max(0.4, 0.3 + len(ss) * 0.07)) if ss else 0.8
        if ss:
            w = np.array([path_len(x) + 22 for x in ss]); cut = np.concatenate([[0], np.cumsum(w) / w.sum()])
            for a0, b0 in zip(cut[:-1], cut[1:]):
                brush(tt + a0 * d, max(0.06, (b0 - a0) * d * 0.86), gain)
        tt += d * 0.9


rt, pre = 2.0, int(0.02 * SR)
IR = []
for c in range(2):
    ti = tv(rt * 1.1)
    ir = filt(rng.standard_normal(len(ti)) * np.exp(-6.91 * ti / rt), 'lowpass', 5000)
    IR.append((ir / np.sqrt((ir ** 2).sum())).astype(np.float32))


def hall(dry, wet):
    o = dry.copy()
    for c in range(2):
        o[c, pre:] += 0.5 * oaconvolve(wet[c], IR[c])[:N - pre].astype(np.float32)
    return o


def voice_mix(lines, path_of, pan_of, wet_of):   # each line's speech aligned to -17 dBFS RMS; returns (voice bus, speaking mask per 10 ms)
    VD, VW, act = np.zeros((2, N), np.float32), np.zeros((2, N), np.float32), np.zeros(N // 480 + 1)
    for ln in lines:
        v = pcm(path_of(ln))
        e = 20 * np.log10(np.sqrt((v[:len(v) // 480 * 480].reshape(-1, 480) ** 2).mean(1)) + 1e-9)
        on = np.where(e > -42)[0]
        if not len(on):
            continue
        v = v * 10 ** (-17 / 20) / np.sqrt((v[:len(e) * 480].reshape(-1, 480)[on] ** 2).mean())
        add(v, ln['at'] - on[0] * 0.01, 1.0, pan_of(ln), wet_of(ln), VD, VW)
        a0 = int(ln['at'] * 100)
        act[a0:a0 + on[-1] - on[0] + 1] = 1
    return hall(VD, VW), act


def duck_curve(act, depth):
    m = np.convolve(act, np.ones(50), 'same') > 0
    m = np.convolve(m.astype(float), np.ones(20) / 20, 'same')
    d = 1 - depth * np.repeat(m, 480)[:N]
    return np.concatenate([d, np.ones(N - len(d))]).astype(np.float32)


def save(out, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(out, -1, 1).T * 32767).astype('<i2').tobytes())


def explainer():
    B = rj(ROOT / 'src/board.json')
    script = {l['id']: l for l in rj(ROOT / 'assets/voice/script.json')['lines']}
    cast = {c['id']: c for c in rj(ROOT / 'assets/cast/cast.json', {'cast': []})['cast']}
    S, LN = T['secs'], {}
    for l in T['lines']:
        LN.setdefault(l['sec'], []).append(l)
    MOOD = {'myst': [50, 57, 62, 65], 'tense': [47, 54, 57, 62], 'warm': [48, 55, 60, 64], 'dark': [45, 52, 55, 60], 'bright': [50, 57, 62, 66], 'still': [43, 50, 55, 62]}
    BELL = {'myst': 880, 'warm': 784, 'tense': 698, 'dark': 587, 'bright': 988, 'still': 659}
    marks = []
    for i, sec in enumerate(B['secs']):
        a, b = S[sec['id']]
        mood = sec.get('mood', ['myst', 'warm', 'tense', 'still'][i % 4])
        pad(max(0, a - 1.2), b + 1.2, MOOD[mood], 0.05)
        if i:
            swish(a - 0.5, 1.1, 0.05, 0.2); rin(a + 0.05, 0.05, BELL[mood])
        marks.append((a, sec['id']))
        if sec.get('bgm') == 'koto':   # pentatonic koto line over the section, seeded by the section id
            sc = [50, 53, 55, 57, 60, 62, 65, 67, 69, 72, 74]; r = np.random.default_rng(len(sec['id']) * 7 + 3); j, tt = 5, a + 0.6
            while tt < b - 1.5:
                koto(tt, sc[j] + 12, 0.045, float(r.uniform(-0.4, 0.4)), 3.6, 3500)
                if r.random() < 0.3:
                    koto(tt, sc[max(0, j - 5)], 0.03, -0.3, 4.0, 2000)
                j = int(np.clip(j + r.choice([-2, -1, -1, 1, 1, 2]), 2, len(sc) - 1)); tt += float(r.choice([0.9, 0.9, 1.35, 1.8]))
        for sh in sec['shots']:
            L = LN[sec['id']][min(sh['k'], len(LN[sec['id']]) - 1)]
            t0 = a if (sh['k'] == 0 and not sh.get('f') and not sh.get('s')) else L['at'] + sh.get('f', 0) * L['len'] + sh.get('s', 0) - 0.3
            typ = sh['type']
            if typ == 'opener':
                write_text(sh['kanji'], t0 + 0.15, 0.07); rin(t0 + 0.1, 0.05, 660)
            elif typ == 'kanji':
                write_text(sh['ch'], t0 + 0.3, 0.07); rin(t0 + sh.get('mount', 4.2) + 0.2, 0.05, 660)
            elif typ == 'scene' and sh.get('from'):
                flip(t0 + 0.2, 0.07)
            elif typ in ('split', 'illus'):
                swish(t0 - 0.2, 0.9, 0.035, -0.2)
            elif typ == 'title':
                boom(t0 + 0.5, 0.16); phrase(t0 + 1.2, [(0, 62), (1, 69), (2, 74), (3.5, 72), (5, 69)], 0.45, 0.08, -0.1)
            elif typ == 'manga':
                flip(t0, 0.06)
                for e in sh['seq'][1:]:
                    Le = LN[sec['id']][min(e[0], len(LN[sec['id']]) - 1)]
                    tick(Le['at'] + (e[2] if len(e) > 2 else 0) * Le['len'] + (e[3] if len(e) > 3 else 0) - 0.2, 0.025, 900)
            elif typ in ('table', 'list', 'flow', 'axis', 'ladder', 'gates', 'trio', 'loop', 'compare'):
                rev = sh.get('reveal')
                if rev and not sh.get('ref'):
                    for j, k in enumerate(rev):
                        Lk = LN[sec['id']][min(k, len(LN[sec['id']]) - 1)]
                        tick(max(t0 + 0.2 + j * 0.12, Lk['at'] - 0.25), 0.03, 1100 + 80 * j, -0.2)
                else:
                    tick(t0 + 0.3, 0.03, 1100)
            elif typ in ('quote', 'tri'):
                rin(t0 + 0.3, 0.05, 440)
    for l in T['lines']:   # shouted lines get a low hit underneath
        tag = script[l['id']]['text'].split(']')[0]
        if any(w in tag for w in ('shouting', 'roaring', 'fierce')):
            boom(l['at'] - 0.05, 0.08)
    for c in range(2):
        DRY[c] += (filt(rng.standard_normal(N), 'lowpass', 220) * 0.01).astype(np.float32)
    out = hall(DRY, WET)
    out *= 0.89 / np.abs(out).max()
    voice, act = voice_mix(T['lines'], lambda l: ROOT / f"assets/voice/lines/{l['id']}.mp3",
                           lambda l: cast.get(l['who'], {}).get('pan', 0.0), lambda l: cast.get(l['who'], {}).get('reverb', 0.1))
    out = out * duck_curve(act, 0.5) + voice
    ta = np.arange(N) / SR
    out *= (np.clip(ta / 0.05, 0, 1) * (1 - np.clip((ta - (T['dur'] - 1.0)) / 1.0, 0, 1))).astype(np.float32)
    out *= 0.89 / np.abs(out).max()
    save(out, ROOT / 'renders/audio.wav')
    hop = SR // 20
    db = 20 * np.log10(np.sqrt((out.mean(0)[:N // hop * hop].reshape(-1, hop) ** 2).mean(1)) + 1e-9)
    Wd, Hd = 1800, 300
    im = Image.new('RGB', (Wd, Hd), (18, 18, 22)); dr = ImageDraw.Draw(im)
    X = lambda s: int(s / T['dur'] * (Wd - 20)) + 10
    Y = lambda v: int(Hd - 30 - (max(-60, v) + 60) / 60 * (Hd - 60))
    dr.line([(X(i * 0.05), Y(v)) for i, v in enumerate(db)], fill=(120, 200, 255))
    for k, (s, sid) in enumerate(sorted(marks)):
        dr.line([(X(s), 20), (X(s), 50)], fill=(255, 120, 120)); dr.text((X(s) + 2, 20 + (k % 3) * 12), sid, fill=(255, 150, 150))
    (ROOT / 'qc').mkdir(exist_ok=True)
    im.save(ROOT / 'qc/audio_strip.png')
    print('audio', ROOT / 'renders/audio.wav', f'{N / SR:.2f}s', 'rms p50/p95', round(float(np.median(db)), 1), round(float(np.percentile(db, 95)), 1))


def comic():
    for p in T['pages'][1:]:
        {'turn': lambda t: flip(t + 0.15, 0.10), 'slide': lambda t: swish(t, 0.7, 0.07), 'push': lambda t: swish(t, 0.9, 0.09), 'flash': lambda t: boom(t + 0.15, 0.12)}[p['trans']](p['t0'])
    for f in T['fx']:
        if f['kind'] == 'knock':
            knock(f['t'], 0.55); knock(f['t'] + 0.42, 0.5)
        if f['kind'] == 'shake':
            boom(f['t'], 0.12)
    CH = [[60, 64, 67], [57, 60, 64], [65, 69, 72], [55, 59, 62]]
    for i, p in enumerate(T['pages']):
        pad(max(0, p['t0'] - 0.6), min(T['dur'], p['t1'] + 0.6), CH[i % 4], 0.05, 1400)
    music = hall(DRY, WET)
    voice, act = voice_mix(T['lines'], lambda l: ROOT / f"assets/voice/lines/{l['id']}.mp3", lambda l: 0.0, lambda l: 0.08)
    out = music * duck_curve(act, 0.6) + voice
    pk = np.abs(out).max(); out = out / pk * 0.9 if pk > 0.9 else out
    raw, wav = ROOT / 'renders/audio_raw.wav', ROOT / 'renders/audio.wav'
    save(out, raw)
    m = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', str(raw), '-af', 'loudnorm=I=-16:TP=-1:LRA=11:print_format=json', '-f', 'null', '-'], capture_output=True, text=True).stderr
    j = json.loads(m[m.rfind('{'):m.rfind('}') + 1])
    af = (f"loudnorm=I=-16:TP=-1:LRA=11:measured_I={j['input_i']}:measured_TP={j['input_tp']}:measured_LRA={j['input_lra']}"
          f":measured_thresh={j['input_thresh']}:offset={j['target_offset']}:linear=true")
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(raw), '-af', af, '-ar', str(SR), str(wav)], check=True)
    raw.unlink()
    print('audio', wav, T['dur'], 's | measured', j['input_i'], 'LUFS -> -16')


comic() if T.get('route') == 'comic' else explainer()
