# ElevenLabs client. Key from env ELEVENLABS_API_KEY (never printed).
# usage:
#   python tools/tts.py account                                   quota and models
#   python tools/tts.py voices [query] [n]                        search the shared voice library (Japanese)
#   python tools/tts.py say VOICE_ID "text" out.mp3 [stability]   one line
#   python tools/tts.py batch <project> [--pilot N] [--timed]     assets/voice/script.json -> assets/voice/lines/<id>.mp3
# batch guardrails: --pilot N records only the first N missing lines (listen, then run the rest); lines whose voice,
# text and settings are unchanged are skipped or reused; each line retries at most twice; 3 failures in a row stop the batch.
# --timed uses the with-timestamps endpoint and stores per-character times in the manifest (karaoke subtitles, word cues).
import base64, hashlib, json, os, sys, time, urllib.error, urllib.parse, urllib.request
from pathlib import Path

API = 'https://api.elevenlabs.io'
MODEL = os.environ.get('ELEVENLABS_MODEL', 'eleven_v3')


def key():
    k = os.environ.get('ELEVENLABS_API_KEY', '').strip()
    if not k:
        raise SystemExit('set ELEVENLABS_API_KEY')
    return k


def req(method, path, body=None, raw=False, timeout=180):
    data = json.dumps(body).encode('utf-8') if body is not None else None
    r = urllib.request.Request(API + path, data=data, method=method, headers={'xi-api-key': key(), 'Content-Type': 'application/json', 'Accept': '*/*'})
    try:
        with urllib.request.urlopen(r, timeout=timeout) as f:
            b = f.read()
            return b if raw else json.loads(b.decode('utf-8'))
    except urllib.error.HTTPError as e:
        raise RuntimeError(f'HTTP {e.code} {path}: {e.read().decode("utf-8", "ignore")[:600]}')


def body(text, stability, similarity, model, lang, seed):
    b = {'text': text, 'model_id': model, 'language_code': lang, 'voice_settings': {'stability': stability, 'similarity_boost': similarity}}
    if seed is not None:
        b['seed'] = seed
    return b


def tts(voice, text, out, stability=0.5, similarity=0.75, model=MODEL, lang='ja', seed=None, fmt='mp3_44100_128'):
    b = req('POST', f'/v1/text-to-speech/{voice}?output_format={fmt}', body(text, stability, similarity, model, lang, seed), raw=True)
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    Path(out).write_bytes(b)
    return len(b), None


def tts_timed(voice, text, out, stability=0.5, similarity=0.75, model=MODEL, lang='ja', seed=None, fmt='mp3_44100_128'):
    """Same as tts() plus per-character timing: {characters, character_start_times_seconds, character_end_times_seconds}."""
    d = req('POST', f'/v1/text-to-speech/{voice}/with-timestamps?output_format={fmt}', body(text, stability, similarity, model, lang, seed))
    a = base64.b64decode(d['audio_base64'])
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    Path(out).write_bytes(a)
    return len(a), d.get('normalized_alignment') or d.get('alignment')


def batch(proj, pilot=None, timed=False):
    root = Path(__file__).resolve().parent.parent / 'projects' / Path(proj).name
    script = json.loads((root / 'assets/voice/script.json').read_text(encoding='utf-8'))
    outdir = root / 'assets/voice/lines'; outdir.mkdir(parents=True, exist_ok=True)
    man_p = outdir / 'manifest.json'
    man = json.loads(man_p.read_text(encoding='utf-8')) if man_p.exists() else {}
    man = {k: v for k, v in man.items() if not v.get('dry')}   # placeholder lines from dry_voice.py are always replaced
    voices = script.get('voices', {})
    old = {e['hash']: (outdir / e['file']).read_bytes() for e in man.values() if (outdir / e['file']).exists()}   # renumbered lines reuse old takes
    done, fails = 0, 0
    for it in script['lines']:
        v = voices.get(it['voice'])
        if not v:
            raise SystemExit(f"no voice_id for speaker {it['voice']} (assets/voice/voices.json)")
        h = hashlib.sha1(f"{v}|{it['text']}|{it.get('stability', 0.5)}|{MODEL}|{timed}".encode('utf-8')).hexdigest()[:10]
        fn = f"{it['id']}.mp3"
        if man.get(it['id'], {}).get('hash') == h and (outdir / fn).exists():
            continue
        if pilot is not None and done >= pilot:
            break
        if h in old:
            (outdir / fn).write_bytes(old[h]); n, al = len(old[h]), man.get(it['id'], {}).get('alignment')
        else:
            for attempt in range(3):
                try:
                    n, al = (tts_timed if timed else tts)(v, it['text'], outdir / fn, it.get('stability', 0.5)); fails = 0; break
                except (RuntimeError, OSError) as e:
                    print('retry' if attempt < 2 else 'failed', it['id'], e, flush=True); time.sleep(2 + 3 * attempt)
            else:
                fails += 1
                if fails >= 3:
                    raise SystemExit('3 lines failed in a row, stopping')
                continue
        man[it['id']] = {'file': fn, 'hash': h, 'voice': it['voice'], 'text': it['text'], 'plain': it.get('plain', ''), 'bytes': n, **({'alignment': al} if al else {})}
        man_p.write_text(json.dumps(man, ensure_ascii=False, indent=1), encoding='utf-8')
        done += 1
        print('ok', it['id'], n, 'reused' if h in old else '', flush=True)
        time.sleep(0.2)
    print('recorded', done, 'lines' + (' (pilot: listen before running the rest)' if pilot is not None else ''))


def main(a):
    cmd = a[0] if a else 'account'
    if cmd == 'account':
        s = req('GET', '/v1/user/subscription')
        print('tier', s.get('tier'), 'used', s.get('character_count'), '/', s.get('character_limit'))
        for m in req('GET', '/v1/models'):
            if m.get('can_do_text_to_speech'):
                print(m['model_id'], '|', m.get('name'))
    elif cmd == 'voices':
        p = {'language': 'ja', 'page_size': int(a[2]) if len(a) > 2 else 30, 'sort': 'usage_character_count_1y', **({'search': a[1]} if len(a) > 1 else {})}
        for v in req('GET', '/v1/shared-voices?' + urllib.parse.urlencode(p)).get('voices', []):
            print(v['voice_id'], '|', v.get('name'), '|', v.get('gender'), v.get('age'), '|', (v.get('description') or '')[:90].replace('\n', ' '))
    elif cmd == 'say':
        n, _ = tts(a[1], a[2], a[3], float(a[4]) if len(a) > 4 else 0.5)
        print('ok', a[3], n, 'bytes')
    elif cmd == 'batch':
        batch(a[1], int(a[a.index('--pilot') + 1]) if '--pilot' in a else None, '--timed' in a)
    else:
        raise SystemExit('commands: account | voices | say | batch')


if __name__ == '__main__':
    main(sys.argv[1:])
