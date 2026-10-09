# Board from notes: assets/voice/script.src.json + notes.json -> src/board.json. Shots are placed by a keyword
# in the narration, so editing the script never means recounting line numbers.
# Per section: scenes (full-bleed images), diagrams (table/list/loop/ladder/...), sums (summary illustrations),
# sorted by the line their keyword is in. Section "open" = brush kanji -> key image -> title.
# notes.json keys: film, mark, brand?, labels{sec: label}, open{kanji, gloss, img, title, sub, small}, chapters[{name, from}],
#   scenes[{sec, keyword, key, tag?}], diagrams[{sec, keyword, type, spec}], sums[{sec, keyword, key}],
#   cards[[sec, keyword, term, reading, desc, western_equivalent, english]], memos[[sec, keyword, title, medium, desc]],
#   tris[[sec, keyword, zh, ja, en, band|top, source?]], holds[[t0, t1]]
# usage: python tools/board.py <project>
from kit import project, rj, wj


def Z(z0, z1, fx=(0.5, 0.5), fy=(0.5, 0.5)):
    return {'z': [z0, z1], 'fx': list(fx), 'fy': list(fy)}


KEN = [Z(1.0, 1.1), Z(1.12, 1.0, (0.45, 0.5), (0.45, 0.5)), Z(1.05, 1.15, (0.6, 0.5), (0.4, 0.45)), Z(1.15, 1.05, (0.4, 0.45), (0.55, 0.5)), Z(1.0, 1.12, (0.5, 0.5), (0.6, 0.4))]
NUMS = '一二三四五六七八九十'


class Board:
    def __init__(self, root):
        src = rj(root / 'assets/voice/script.src.json')
        self.lines = {s['id']: [l[2].replace('｜', '') for l in s['lines']] for s in src['secs']}

    def K(self, sec, key):   # index of the line containing the keyword
        if isinstance(key, int):
            return key
        for i, l in enumerate(self.lines[sec]):
            if key in l:
                return i
        raise SystemExit(f'keyword not found: "{key}" in section {sec}')

    def scene(self, sec, key, img, tag='', kf=None, **kw):
        return {'k': self.K(sec, key), 'type': 'scene', 'img': img if '/' in img else 'kv/' + img, 'tag': tag, 'kf': kf or {}, **kw}

    def summary(self, sec, key, img):   # framed whole above the subtitles; cards leave before it appears
        return self.scene(sec, key, 'sum/' + img, '', Z(1.0, 1.04), sum=True)


def diagram(d, k):   # notes.diagrams[].spec -> shot fields
    sp, t = d.get('spec', {}), d['type']
    sh = {'k': k, 'type': t, 'tag': sp.get('tag', ''), 'title': sp.get('title', '')}
    if t == 'list':   # items: {n,t,d} or "title：detail"
        sh['items'] = [it if isinstance(it, dict) else dict(zip(('t', 'd'), (it.split('：', 1) + [''])[:2]), n=NUMS[i]) for i, it in enumerate(sp['items'])]
        sh.update({k: sp[k] for k in ('note',) if k in sp})
    elif t == 'loop':
        sh.update(nodes=[n[0] if isinstance(n, list) else n for n in sp['nodes']], mid=sp.get('mid', ''))
    elif t == 'ladder':
        sh.update(steps=[s if isinstance(s, dict) else {'t': s[0], 'w': s[1] if len(s) > 1 else ''} if isinstance(s, list) else {'t': s} for s in sp['steps']],
                  **({'climber': sp['climber']} if 'climber' in sp else {}))
    else:   # table, trio, gates, flow, compare, axis, tri, quote: fields pass through
        sh.update({k: v for k, v in sp.items() if k not in ('tag', 'title')})
    return sh


def build(root):
    B, N = Board(root), rj(root / 'notes.json')
    secs, ki = [], 0
    for sid, lines in B.lines.items():
        n = len(lines)
        if sid == 'open':
            o = N['open']
            shots = [{'k': 0, 'type': 'kanji', 'ch': o['kanji'], 'gloss': o.get('gloss', ''), 'img': 'kv/' + o['img'], 'mount': o.get('mount', 4.4), 'fy': 0.45},
                     {'k': n - 1, 'f': 1, 's': 0.8, 'type': 'title', 'img': 'kv/' + o['img'], 'title': o['title'], 'sub': o.get('sub', ''), 'small': o.get('small', '')}]
            secs.append({'id': sid, 'label': N['labels'][sid], 'lead': 5.5, 'tail': 5.0, 'shots': shots}); continue
        items = []
        for s in N.get('scenes', []):
            if s['sec'] == sid:
                items.append((B.K(sid, s['keyword']), 1, B.scene(sid, s['keyword'], s['key'], s.get('tag', ''), KEN[ki % len(KEN)]))); ki += 1
        for d in N.get('diagrams', []):
            if d['sec'] == sid:
                k = B.K(sid, d['keyword']); items.append((k, 2, diagram(d, k)))
        for s in N.get('sums', []):
            if s['sec'] == sid:
                items.append((B.K(sid, s['keyword']), 3, B.summary(sid, s['keyword'], s['key'])))
        items.sort(key=lambda x: (x[0], x[1]))
        shots, used = [], set()
        for k, _, sh in items:
            while k in used:   # two shots on one line: push the later one to the next line
                k += 1
            if k >= n:
                continue
            used.add(k); sh['k'] = k; shots.append(sh)
        if not shots:
            shots = [B.scene(sid, 0, N['open']['img'], '', KEN[0])]
        shots[0]['k'] = 0
        secs.append({'id': sid, 'label': N['labels'][sid], 'lead': 0.8, 'tail': 3.0 if sid == 'close' else 1.0, 'shots': shots})
    cards = [{'sec': r[0], 'k': B.K(r[0], r[1]), 'term': r[2], 'yomi': r[3], 'desc': r[4], 'west': r[5], 'wen': r[6], **({'f': r[7]} if len(r) > 7 else {})} for r in N.get('cards', [])]
    memos = [{'sec': r[0], 'k': B.K(r[0], r[1]), 'term': r[2], 'yomi': r[3], 'desc': r[4], 'west': '', 'wen': '', 'memo': True, 'hold': 2.5} for r in N.get('memos', [])]
    same = {}
    for c in cards + memos:   # several cards on one line: stagger them through the line
        same.setdefault((c['sec'], c['k']), []).append(c)
    for grp in same.values():
        if len(grp) > 1:
            for i, c in enumerate(grp):
                c['f'] = round(i / len(grp), 2)
    tris = [{'sec': r[0], 'k': B.K(r[0], r[1]), 'zh': r[2], 'ja': r[3], 'en': r[4], 'mode': r[5], **({'src': r[6]} if len(r) > 6 else {})} for r in N.get('tris', [])]
    beats = N.get('beats', [])
    for b in beats:   # a beat fires on a substring of its line; a rewrite that drops the phrase fails here instead of silently drifting
        line = B.lines[b['sec']][b['k']]
        for f in ('at', 'fixAt', 'rightAt', 'stoneAt'):
            if b.get(f):
                if b[f] not in line:
                    raise SystemExit(f'beat "{b[f]}" is not in {b["sec"]}#{b["k"]}: {line}')
                b['frac' if f == 'at' else f + 'Frac'] = round(line.index(b[f]) / max(1, len(line)), 3)
    board = {'film': N['film'], 'mark': N.get('mark', ''), **({'brand': N['brand']} if N.get('brand') else {}), 'secs': secs, 'cards': cards + memos, 'tris': tris,
             'beats': beats, 'chapters': N.get('chapters', [{'name': N['film'], 'from': secs[0]['id']}]), 'holds': N.get('holds', [])}
    wj(root / 'src/board.json', board)
    print(len(secs), 'secs', sum(len(s['shots']) for s in secs), 'shots', len(cards), 'cards', len(memos), 'memos', len(tris), 'tris')


if __name__ == '__main__':
    build(project()[1])
