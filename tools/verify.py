# Delivery check before anything is published: full decode, loudness and true peak, black frames, frozen video,
# SRT export, optional 720p review draft. Writes renders/verify.json; any failure exits 1 (do not publish).
#   loudness: -16 LUFS +-1.0, true peak <= -0.5 dBTP (platforms normalize again; this only catches too quiet / clipping)
#   freeze: freezedetect noise -60 dB for >= 2.5 s; designed holds can be exempted in timeline.json "holds": [[t0, t1], ...]
# usage: python tools/verify.py <project> [--draft]
import sys, re, subprocess
from kit import REPO, project, rj, wj, probe_dur

name, ROOT = project()
MP4 = ROOT / 'renders/final.mp4'
TL = rj(ROOT / 'src/timeline.json')
rel = lambda p: p.relative_to(REPO).as_posix()


def ff(*a):
    return subprocess.run(['ffmpeg', '-hide_banner', '-nostats', *a], capture_output=True, text=True).stderr


rep = {'file': rel(MP4), 'bytes': MP4.stat().st_size}
dur = probe_dur(MP4)
rep['duration'] = round(dur, 3); rep['timeline_dur'] = TL['dur']
rep['duration_ok'] = abs(dur - TL['dur']) < 1.0
err = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(MP4), '-f', 'null', '-'], capture_output=True, text=True).stderr.strip()
rep['decode_ok'] = not err; rep['decode_errors'] = err[:400]
m = ff('-i', str(MP4), '-vn', '-af', 'ebur128=peak=true', '-f', 'null', '-')
I = float(re.findall(r'I:\s+(-?[\d.]+) LUFS', m)[-1]); TP = float(re.findall(r'Peak:\s+(-?[\d.]+) dBFS', m)[-1])
rep['loudness_lufs'], rep['true_peak_dbtp'] = I, TP
rep['loudness_ok'] = abs(I + 16) <= 1.0 and TP <= -0.5
holds = TL.get('holds', [])
fr = ff('-i', str(MP4), '-an', '-vf', 'freezedetect=n=-60dB:d=2.5,blackdetect=d=0.8:pix_th=0.05', '-f', 'null', '-')
fs = [float(x) for x in re.findall(r'freeze_start: ([\d.]+)', fr)]; fe = [float(x) for x in re.findall(r'freeze_end: ([\d.]+)', fr)]
freezes = [[a, b] for a, b in zip(fs, fe + [dur] * (len(fs) - len(fe)))]
bad = [f for f in freezes if not any(h[0] - 0.5 <= f[0] and f[1] <= h[1] + 0.5 for h in holds)]
blacks = [[float(a), float(b)] for a, b in re.findall(r'black_start:([\d.]+) black_end:([\d.]+)', fr)]
blacks = [b for b in blacks if b[0] > 1.0 and b[1] < dur - 1.0]   # fade in/out at the ends is by design
rep['freezes'], rep['freeze_ok'] = bad, not bad
rep['blacks'], rep['black_ok'] = blacks, not blacks
ok = all(rep[k] for k in ('duration_ok', 'decode_ok', 'loudness_ok', 'freeze_ok', 'black_ok'))


def ts(x):
    h, x = divmod(x, 3600); m_, s = divmod(x, 60)
    return f'{int(h):02d}:{int(m_):02d}:{int(s):02d},{int(round((s % 1) * 1000)):03d}'


subs = TL.get('subs', [])   # [t0, t1, text, speaker, english?]
srt = ROOT / 'renders/final.srt'
srt.write_text('\n'.join(f'{i + 1}\n{ts(s[0])} --> {ts(s[1])}\n{s[2]}' + (f'\n{s[4]}' if len(s) > 4 and s[4] else '') + '\n' for i, s in enumerate(subs)), encoding='utf-8')
rep['srt'] = rel(srt); rep['srt_cues'] = len(subs)
if '--draft' in sys.argv:   # 720p review copy for phones
    d = ROOT / 'renders/draft-720p.mp4'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(MP4), '-vf', 'scale=1280:720', '-c:v', 'libx264', '-crf', '26', '-preset', 'veryfast', '-c:a', 'aac', '-b:a', '128k', str(d)], check=True)
    rep['draft'] = rel(d)
rep['pass'] = ok
wj(ROOT / 'renders/verify.json', rep)
print(('PASS' if ok else 'FAIL'), {k: rep[k] for k in ('duration', 'loudness_lufs', 'true_peak_dbtp', 'freezes', 'blacks', 'decode_ok', 'srt_cues')})
sys.exit(0 if ok else 1)
