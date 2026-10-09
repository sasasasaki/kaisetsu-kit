# Progress is computed from artifacts on disk, never declared: which gate is a project stuck at?
# Gates (a gate is only checked when the previous one passed):
#   script     assets/voice/script.src.json (explainer) or comic.json (comic route)
#   voice      every timeline line has an audio file
#   visuals    every image the board / timeline references exists
#   timeline   src/timeline.json is newer than the script and the audio
#   qc         qc/cards.json reports 0 card/text hits and 0 subtitle-box hits (only when the board has cards)
#   rendered   renders/final.mp4 is newer than the timeline
#   verified   renders/verify.json pass=true for this exact file (byte size)
#   published  renders/published.json records a url for this exact file
# usage: python tools/stage.py <project> [<project> ...]
import sys, json
from kit import REPO, rj


def mtime(p):
    return p.stat().st_mtime if p.exists() else 0


def check(R):
    tl = R / 'src/timeline.json'
    T = rj(tl) if tl.exists() else None
    out = []

    def gate(name, ok, why=''):
        out.append((name, bool(ok), why))
        return ok

    src = [p for p in (R / 'assets/voice/script.src.json', R / 'comic.json') if p.exists()]
    if not gate('script', src, '' if src else 'no script'):
        return out
    if not T:
        gate('voice', False, 'no timeline yet, cannot match audio')
        return out
    vdir = R / 'assets/voice/lines'
    miss = [l['id'] for l in T['lines'] if not (vdir / f"{l['id']}.mp3").exists()]
    if not gate('voice', not miss, f'{len(miss)} missing: {miss[:5]}' if miss else f"{len(T['lines'])} lines"):
        return out
    refs = [R / p['image'] for p in T.get('pages', [])]
    board = R / 'src/board.json'
    B = rj(board) if board.exists() else {}
    refs += [R / 'assets' / f"{sh[k]}.png" for s in B.get('secs', []) for sh in s['shots'] for k in ('img', 'from') if sh.get(k)]
    lost = [p.relative_to(R).as_posix() for p in refs if not p.exists()]
    if not gate('visuals', not lost, f'{len(lost)} missing: {lost[:3]}' if lost else f'{len(refs)} references'):
        return out
    newest = max([mtime(p) for p in src] + [mtime(vdir / f"{l['id']}.mp3") for l in T['lines']])
    if not gate('timeline', mtime(tl) >= newest, '' if mtime(tl) >= newest else 'script or audio newer than timeline: re-run plan'):
        return out
    if B.get('cards'):
        q = rj(R / 'qc/cards.json', {})
        clean = q.get('hits') == 0 and q.get('subs') == 0
        if not gate('qc', clean, 'cards and subtitle box clear' if clean else 'no qc/cards.json or hits remain (tools/qc_cards.py)'):
            return out
    else:
        gate('qc', True, 'no cards (n/a)')
    mp4 = R / 'renders/final.mp4'
    if not gate('rendered', mp4.exists() and mtime(mp4) >= mtime(tl), '' if mtime(mp4) >= mtime(tl) else ('no final.mp4' if not mp4.exists() else 'timeline newer than render')):
        return out
    v = rj(R / 'renders/verify.json', {})
    good = v.get('pass') and v.get('bytes') == mp4.stat().st_size
    if not gate('verified', good, f"{v.get('loudness_lufs')} LUFS" if good else 'not verified, or verified a different file'):
        return out
    p = rj(R / 'renders/published.json', {})
    gate('published', p.get('url') and p.get('bytes') == mp4.stat().st_size, p.get('url', '') if p.get('url') else 'no publish record for this file')
    return out


if __name__ == '__main__':
    for arg in sys.argv[1:]:
        res = check(REPO / 'projects' / arg.rstrip('/').split('/')[-1])
        bad = next((n for n, ok, _ in res if not ok), None)
        print(f'{arg}: stuck at {bad}' if bad else f'{arg}: all gates pass')
        for n, ok, why in res:
            print(f"  {'ok ' if ok else 'NO '} {n:9s} {why}")
