# Gap filler: for each stretch over 3.5 s with no reaction (tools/beat_gaps.py), underline a word being spoken in the middle of the gap
# inside the subtitle (beat do:"mark"). Only whole words: a run of kanji/katakana that occurs once in the line, nearest the gap's middle.
# Written to <project>/beats_zmarks.json (recomputed each run) and merged by board.py; rebuilds and re-gates up to 4 rounds.
# usage: python tools/fill_marks.py <project>
import sys, json, re, subprocess
from kit import project

P, ROOT = project()
OUT = ROOT / 'beats_zmarks.json'
WORD = re.compile(r'[一-鿿゠-ヿー々]{2,}')


def run(*a):
    return subprocess.run([sys.executable, *a], cwd=ROOT.parents[1], capture_output=True, text=True, encoding='utf-8', errors='replace')


OUT.write_text('[]\n', encoding='utf-8')
marks = []
for rnd in range(4):
    run('tools/board.py', P)
    run('tools/beat_gaps.py', P)
    rep = json.loads((ROOT / 'qc/beats.json').read_text(encoding='utf-8'))
    if not rep['gaps']:
        break
    T = json.loads((ROOT / 'src/timeline.json').read_text(encoding='utf-8'))
    A = json.loads((ROOT / 'assets/voice/align.json').read_text(encoding='utf-8'))
    L = {l['id']: l for l in T['lines']}
    added = 0
    for gp in rep['gaps']:
        l, a = L[gp['id']], A.get(gp['id'])
        if not a:
            continue
        base, mid = l['at'] - l.get('lead', 0), (gp['from'] + gp['to']) / 2
        cands = []
        for m in WORD.finditer(a['text']):
            w, t = m.group(), base + a['t'][m.start()]
            if w[-1] in '自他其此' and len(w) > 2:   
                w = w[:-1]
            if a['text'].count(w) == 1 and gp['from'] + 0.6 < t < gp['to'] - 0.6 and any(s[0] <= t < s[1] and w in s[2] for s in T['subs']):
                cands.append((abs(t - mid), w))
        if not cands:
            print('  no word for gap', gp)
            continue
        marks.append({'sec': l['sec'], 'k': l['k'], 'at': min(cands)[1], 'do': 'mark', 'hold': 0.0})
        added += 1
    OUT.write_text('[\n' + ',\n'.join(' ' + json.dumps(b, ensure_ascii=False) for b in marks) + '\n]\n', encoding='utf-8')
    print(f'round {rnd + 1}: {len(rep["gaps"])} gaps, +{added} marks')
    if not added:
        break
run('tools/board.py', P)
print(run('tools/beat_gaps.py', P).stdout.strip().split('\n')[0])
