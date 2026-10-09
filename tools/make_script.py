# assets/voice/script.src.json -> assets/voice/script.json (input for tts.py batch / dry_voice.py).
# Source line: [who, tag, ja, zh, en?, fixed_id?]. The text sent to TTS = "[tag] " + ja with readings replaced
# from the project's kana.json ([[written, reading], ...], longest first); the subtitle keeps the written form.
# Subtitle cut points: mark "｜" in ja and "|" in en at the same places; each Japanese chunk gets its English chunk.
# Voices: optional assets/voice/voices.json {who: {voice_id, stability?}}.
# usage: python tools/make_script.py <project>
import sys
from kit import project, rj, wj

name, ROOT = project()
VOICES = rj(ROOT / 'assets/voice/voices.json', {})
KANA = sorted(rj(ROOT / 'kana.json', []), key=lambda p: -len(p[0]))


def kana(s):
    for a, b in KANA:
        s = s.replace(a, b)
    return s


src = rj(ROOT / 'assets/voice/script.src.json')
lines, n = [], 0
for sec in src['secs']:
    for who, tag, plain, zh, *rest in sec['lines']:
        n += 1
        en = rest[:1]
        parts = None
        if '｜' in plain:
            jp, ens = plain.split('｜'), (en[0] if en else '').split('|')
            if len(jp) != len(ens):
                sys.exit(f'n{n:03d}: {len(jp)} Japanese chunks vs {len(ens)} English chunks: {plain}')
            parts = [[a.strip('　 '), b.strip()] for a, b in zip(jp, ens)]
            plain, en = plain.replace('｜', ''), [' '.join(b for _, b in parts)]
        lines.append({'id': rest[1] if len(rest) > 1 else f'n{n:03d}', 'sec': sec['id'], 'voice': who, 'text': (f'[{tag}] ' if tag else '') + kana(plain),
                      'plain': plain, 'zh': zh, **({'en': en[0]} if en else {}), **({'parts': parts} if parts else {}),
                      'stability': VOICES.get(who, {}).get('stability', 0.5)})
wj(ROOT / 'assets/voice/script.json', {'voices': {k: v['voice_id'] for k, v in VOICES.items()}, 'lines': lines})
print(name, len(lines), 'lines', sum(len(l['plain']) for l in lines), 'chars', {w: sum(1 for l in lines if l['voice'] == w) for w in sorted({l['voice'] for l in lines})})
