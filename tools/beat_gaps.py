# Gate: does the picture react while each line is spoken? Computed from board + timeline (+ align.json), no render needed.
# Events: beats (cam/write/strike/circle/tag/inset/fill/slot/paper/formula/board2), shot changes, vocab cards / memos, tris, diagram reveals.
# Rules: every line has >= 1 event; a line of 5 s or more has >= 2; no gap over 3.5 s while speaking (a declared `rest` beat
# exempts the pause after a punchline). A `hold` beat ({do: 'hold', sec, k, at?, len}) is a pause the author meant: no gap inside it,
# and its span goes to qc/holds.json so verify does not call it frozen. Writes qc/beats.json; exits 1 on failure.
# usage: python tools/beat_gaps.py <project> [section id ...]
import sys, json
from kit import project, rj

name, ROOT = project()
only = set(sys.argv[2:])
T, B = rj(ROOT / 'src/timeline.json'), rj(ROOT / 'src/board.json')
A = rj(ROOT / 'assets/voice/align.json') if (ROOT / 'assets/voice/align.json').exists() else {}
LN = {}
for l in T['lines']:
    LN.setdefault(l['sec'], []).append(l)
MAXGAP = 3.5


def at(b, phrase, frac):
    L = LN[b['sec']][b['k']]
    if not phrase:
        return L['at'] + b.get('dt', 0)
    a = A.get(L['id'])
    if a and phrase in a['text']:
        return L['at'] - L.get('lead', 0) + a['t'][a['text'].index(phrase)] + b.get('dt', 0)
    return L['at'] + L['len'] * (frac or 0) + b.get('dt', 0)


ev, rests, holds = [], [], []
for b in B.get('beats', []):
    if b['do'] == 'rest':
        L = LN[b['sec']][b['k']]; rests.append((L['at'] + L['len'], b.get('len', 0.8))); continue
    if b['do'] == 'hold':
        t = at(b, b.get('at'), b.get('frac')); holds.append((t, t + b.get('len', 4))); continue
    if b['do'] == 'clear':
        continue
    ev.append((at(b, b.get('at'), b.get('frac')), b['sec']))
    for f in ('fixAt', 'rightAt', 'stoneAt'):
        if b.get(f):
            ev.append((at(b, b[f], b.get(f + 'Frac')), b['sec']))
for s in B['secs']:
    for sh in s['shots']:
        L = LN[s['id']][min(sh['k'], len(LN[s['id']]) - 1)]
        ev.append((L['at'] + sh.get('f', 0) * L['len'], s['id']))
        ev += [(LN[s['id']][r]['at'], s['id']) for r in (sh.get('reveal') or []) if r is not None and r < len(LN[s['id']])]
for c in B.get('cards', []):
    L = LN[c['sec']][c['k']]; ev.append((L['at'] + c.get('f', 0) * L['len'], c['sec']))
ev += [(LN[c['sec']][c['k']]['at'], c['sec']) for c in B.get('tris', [])]

rep, bad = {'lines': [], 'gaps': []}, 0
for sec, lines in LN.items():
    if only and sec not in only:
        continue
    times = sorted(x for x, s in ev if s == sec)
    for L in lines:
        end = L['at'] + L['len']
        n = sum(1 for x in times if L['at'] - 0.3 <= x <= end)
        ok = n >= (2 if L['len'] >= 5 else 1)
        bad += not ok
        rep['lines'].append({'id': L['id'], 'sec': sec, 'k': L['k'], 'len': L['len'], 'events': n, 'ok': ok})
        pts = [L['at']] + [x for x in times if L['at'] < x < end] + [end]
        for x0, x1 in zip(pts, pts[1:]):
            if x1 - x0 > MAXGAP and not any(abs(x0 - r0) <= 0.2 and x1 - x0 <= r1 + MAXGAP for r0, r1 in rests) \
                    and not any(h0 - 0.3 <= x0 and x1 <= h1 + 0.3 for h0, h1 in holds):
                rep['gaps'].append({'id': L['id'], 'from': round(x0, 2), 'to': round(x1, 2), 'gap': round(x1 - x0, 2)}); bad += 1
span = [l for s, ls in LN.items() if not only or s in only for l in ls]
dur = span[-1]['at'] + span[-1]['len'] - span[0]['at'] if span else 1
cov = sum(1 for r in rep['lines'] if r['events']) / max(1, len(rep['lines']))
rep.update(coverage=round(cov, 3), events_per_min=round(sum(1 for _, s in ev if not only or s in only) / dur * 60, 1),
           lines_failing=sum(1 for r in rep['lines'] if not r['ok']), long_gaps=len(rep['gaps']), pass_=bad == 0)
(ROOT / 'qc').mkdir(exist_ok=True)
if not only:
    (ROOT / 'qc/holds.json').write_text(json.dumps([[round(a, 2), round(b, 2)] for a, b in holds]), encoding='utf-8')
(ROOT / 'qc/beats.json').write_text(json.dumps(rep, ensure_ascii=False, indent=1), encoding='utf-8')
print(f"{name} {'/'.join(sorted(only)) or 'all'}: lines with a reaction {cov:.0%}, {rep['events_per_min']} events/min, "
      f"failing lines {rep['lines_failing']}, gaps over {MAXGAP}s {len(rep['gaps'])}", 'PASS' if bad == 0 else 'FAIL')
for r in rep['lines']:
    if not r['ok']:
        print(f"  x {r['id']} #{r['k']} {r['len']:.1f}s events {r['events']}")
for g in rep['gaps'][:20]:
    print(f"  gap {g['id']} {g['from']}->{g['to']} {g['gap']}s")
sys.exit(0 if bad == 0 else 1)
