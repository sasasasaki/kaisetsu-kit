# Per-character timing for recorded lines, so beats fire on the spoken word.
# Runs faster-whisper with word timestamps on each assets/voice/lines/<id>.mp3, then maps the recognised characters back onto the
# script text (difflib); unmatched characters are interpolated between known ones. A line matched below 50% is spread evenly
# over its speech span and marked "estimated".
# Output: assets/voice/align.json {line id: {"text", "t": [seconds from file start per character], "timing", "match"}}
# Not needed when tts.py --timed already stored engine timestamps; without either, beats fall back to the phrase's position in the line.
# needs: pip install faster-whisper   (ALIGN_MODEL=medium by default; ALIGN_DEVICE=cuda|cpu)
# usage: python tools/align.py <project> [line id ...]
import os, sys, json, difflib
from faster_whisper import WhisperModel
from kit import project, rj

name, ROOT = project()
only = set(sys.argv[2:])
S = rj(ROOT / 'assets/voice/script.json')['lines']
dev = os.environ.get('ALIGN_DEVICE', 'cuda')
model = WhisperModel(os.environ.get('ALIGN_MODEL', 'medium'), device=dev, compute_type='float16' if dev == 'cuda' else 'int8')
out_f = ROOT / 'assets/voice/align.json'
out = rj(out_f) if out_f.exists() else {}
PUNCT = set('、。！？!?…「」『』（）()・ 　,.＝')

for l in S:
    if only and l['id'] not in only:
        continue
    text = l['plain']
    segs, _ = model.transcribe(str(ROOT / f"assets/voice/lines/{l['id']}.mp3"), language=os.environ.get('ALIGN_LANG', 'ja'), word_timestamps=True, beam_size=5)
    chars = []   # recognised characters; a word's time is spread evenly over its characters
    for sg in segs:
        for w in sg.words:
            ws = [c for c in w.word if c.strip()]
            chars += [(c, w.start + (w.end - w.start) * j / max(1, len(ws))) for j, c in enumerate(ws)]
    t = [None] * len(text)
    for a, b, n in difflib.SequenceMatcher(None, text, ''.join(c for c, _ in chars), autojunk=False).get_matching_blocks():
        for i in range(n):
            t[a + i] = chars[b + i][1]
    matched = sum(1 for i, c in enumerate(text) if t[i] is not None and c not in PUNCT)
    total = max(1, sum(1 for c in text if c not in PUNCT))
    start, end = (chars[0][1], chars[-1][1] + 0.2) if chars else (0.0, 1.0)
    timing = 'aligned' if matched / total >= 0.5 else 'estimated'
    if timing == 'estimated':
        t = [start + (end - start) * i / max(1, len(text)) for i in range(len(text))]
    else:
        known = [(i, v) for i, v in enumerate(t) if v is not None]
        if known[0][0] != 0:
            t[0] = start; known.insert(0, (0, start))
        if known[-1][0] != len(text) - 1:
            t[-1] = end; known.append((len(text) - 1, end))
        for (i0, v0), (i1, v1) in zip(known, known[1:]):
            for i in range(i0 + 1, i1):
                t[i] = v0 + (v1 - v0) * (i - i0) / (i1 - i0)
        for i in range(1, len(t)):
            t[i] = max(t[i], t[i - 1])
    out[l['id']] = {'text': text, 't': [round(x, 3) for x in t], 'timing': timing, 'match': round(matched / total, 2)}
    print(l['id'], timing, round(matched / total, 2), flush=True)
out_f.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding='utf-8')
print('aligned', sum(1 for v in out.values() if v['timing'] == 'aligned'), '/', len(out))
