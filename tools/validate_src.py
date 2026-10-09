# Script format check: python tools/validate_src.py <project> [--recap WORD] -> fix every problem before recording.
# Checks: each line has 5 fields [who, tag, ja, zh, en]; the speaker is known (cast.json or voices.json, when present);
# ja "｜" chunks match en "|" chunks; every ja chunk <= 29 characters (one subtitle block); zh is not empty;
# with --recap, every section except open/recap has a line containing WORD (e.g. のまとめ);
# every notes.json keyword is found in its section.
import sys
from kit import project, rj

name, ROOT = project()
recap = sys.argv[sys.argv.index('--recap') + 1] if '--recap' in sys.argv else None
known = {c['id'] for c in rj(ROOT / 'assets/cast/cast.json', {'cast': []})['cast']} | set(rj(ROOT / 'assets/voice/voices.json', {}))
src = rj(ROOT / 'assets/voice/script.src.json')
bad, lines = [], {}
for sec in src['secs']:
    sid = sec['id']; lines[sid] = []
    for l in sec['lines']:
        at = f'{sid}#{len(lines[sid])}'
        if len(l) < 5:
            bad.append(f'{at} fewer than 5 fields: {l}'); lines[sid].append(''); continue
        who, tag, ja, zh, en = l[:5]
        lines[sid].append(ja.replace('｜', ''))
        if known and who not in known:
            bad.append(f'{at} unknown speaker {who}')
        jp, ens = ja.split('｜'), en.split('|')
        if len(jp) != len(ens):
            bad.append(f'{at} {len(jp)} ja chunks / {len(ens)} en chunks: {ja}')
        for c in jp:
            if len(c.strip('　 ')) > 29:
                bad.append(f'{at} chunk over 29 chars ({len(c)}): {c}')
        if not zh.strip():
            bad.append(f'{at} missing zh')
    if recap and sid not in ('open', 'recap') and not any(recap in x for x in lines[sid]):
        bad.append(f'{sid} has no "{recap}" line')
notes = rj(ROOT / 'notes.json', {})
for kind, rows in notes.items():
    for r in rows if isinstance(rows, list) else []:
        if not isinstance(r, (dict, list)) or kind in ('chapters', 'holds', 'beats'):   # beats are checked against their own line in board.py
            continue
        sec, key = (r.get('sec'), r.get('keyword')) if isinstance(r, dict) else (r[0], r[1])
        if isinstance(key, int):
            continue
        if sec not in lines or not any(key in x for x in lines[sec]):
            bad.append(f'notes.{kind}: "{key}" not found in section {sec}')
print(name, sum(len(v) for v in lines.values()), 'lines', sum(len(x) for v in lines.values() for x in v), 'chars')
for b in bad:
    print('  x', b)
print('OK' if not bad else f'{len(bad)} problems')
sys.exit(1 if bad else 0)
