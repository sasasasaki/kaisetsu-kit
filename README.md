# kaisetsu-kit

Script in, narrated explainer video out. A small canvas engine plus a pipeline of single-purpose Python tools,
packaged as an Agent Skill (`SKILL.md`). [中文](README.zh-CN.md) · [日本語](README.ja.md)

- Frame-accurate: the page exposes `async renderAt(t)`; every frame is a pure function of `t`, so renders are reproducible and can be split across workers.
- Explainer components: brush-written kanji openers (KanjiVG stroke data), full-bleed scenes with push/pull and page turns, tables / lists / ladders / loops / gates,
  vocab "translation cards" that pick the slot covering the least of any face and fly into a word book, tri-language quote columns (Chinese / Japanese / English),
  summary illustrations framed above the subtitles, procedural paper and ink-bleed section transitions.
- Motion-comic route: a camera travels over manga pages panel by panel, with page turns, shakes, sound-effect pops, and video clips pasted back at their crop box.
- Procedural soundtrack (pads, koto, bells, brush sounds, ticks) mixed under the voice with ducking.
- Checks: text-overlap QC on every layer, delivery verification (decode, -16 LUFS, true peak, freeze and black detection, SRT, 720p draft), stage computed from artifacts.

HyperFrames or any other video framework is **not** required.

## Requirements

- Python 3.10+ with `numpy scipy pillow playwright requests` and `python -m playwright install chromium`
- `ffmpeg` and `ffprobe` (with libx264, libmp3lame, aac) on PATH
- Optional: `ultralytics` + a face detection model for `tools/faces.py`; an ElevenLabs key for `tools/tts.py`; an image-to-video API for `tools/clips.py`
- Fonts: the defaults are Yu Mincho / Yu Gothic (Windows) with Hiragino and Noto fallbacks; install Noto Serif JP / Noto Sans JP elsewhere

## Quick start

```bash
bash tests/smoke.sh                 # PYTHON=/path/to/python if the default one lacks playwright
```

The smoke test builds both demo projects with no paid API (placeholder art and a placeholder voice), runs the overlap checks,
renders stills and videos, and verifies them. Outputs land in `projects/<name>/qc/` and `projects/<name>/renders/`.

## Layout

```
engine/      engine.js components.js brush.js strokes.js  index.html (explainer page)
             comic.js comic.html (motion comic)  page.html (web package template)
tools/       one step per script: python tools/<step>.py <project> ...
projects/    example/ comic-example/ ... one folder per video
tests/       smoke.sh
```

The engine is served from the repo root (`/engine/index.html?p=<project>`), so projects must live under `projects/`.

## Pipeline (explainer)

| step | tool | reads | writes |
|---|---|---|---|
| check script | `validate_src.py` | `assets/voice/script.src.json`, `notes.json` | — |
| TTS script | `make_script.py` | `script.src.json`, `kana.json`, `assets/voice/voices.json` | `assets/voice/script.json` |
| voice | `tts.py batch` / `dry_voice.py` | `script.json` | `assets/voice/lines/<id>.mp3` |
| faces | `faces.py` (optional) | `assets/kv/*.png` | `assets/faces.json` |
| board | `board.py` | `script.src.json`, `notes.json` | `src/board.json` |
| timeline | `plan.py` | board, script, voice | `src/timeline.json` |
| sound | `sound.py` | timeline, board | `renders/audio.wav` |
| overlap QC | `qc_cards.py [--subs]` | rendered frames | `qc/cards.json` |
| render | `render.py stills|sheet|video|mux` | page + timeline | `qc/still-*.jpg`, `renders/final.mp4` |
| verify | `verify.py [--draft]` | `final.mp4` | `renders/verify.json`, `final.srt`, `draft-720p.mp4` |
| package | `build_web.py` | final, board | `web/` |
| status | `stage.py` | everything | — |

Comic route: `comic.json` -> `dry_voice.py` / recorded lines -> `plan_comic.py` -> `sound.py` -> `render.py` -> `verify.py`.
Clips: `clips.py` -> `frames.py`. New brush kanji: `build_strokes.py 字字字`.

## Formats

**script.src.json** — `{"secs": [{"id": "open", "lines": [[speaker, tag, ja, zh, en], ...]}, ...]}`. `｜` in ja and `|` in en mark matching subtitle cuts; each ja chunk ≤ 29 characters.

**notes.json** — what appears on screen, placed by a keyword in the narration (see `projects/example/notes.json`):
`scenes` (full-bleed images), `diagrams` (`table`, `list`, `loop`, `ladder`, `trio`, `gates`, `flow`, `compare`, `axis`, `tri`, `quote` with a `spec`),
`sums` (summary illustrations), `cards` (`[sec, keyword, term, reading, description, western equivalent, english]`),
`memos` (works cited as examples), `tris` (`[sec, keyword, zh, ja, en, "band"|"top", source]`), `holds` (designed still ranges exempt from freeze detection).

**cast.json** (optional) — `assets/cast/cast.json`: `{"cast": [{"id", "name", "accent", "face"?, "image"?, "pan"?, "reverb"?}]}`.
`face` / `image` are paths under `assets/cast/`. Without faces, speakers get plain name chips; without cast.json, the speaker id is shown.

**voices.json** (for TTS) — `assets/voice/voices.json`: `{"speaker": {"voice_id": "...", "stability": 0.5}}`.

**comic.json** — see `projects/comic-example/comic.json` and the header of `tools/plan_comic.py`.

## Environment variables

| variable | used by |
|---|---|
| `ELEVENLABS_API_KEY`, `ELEVENLABS_MODEL` (default `eleven_v3`) | `tools/tts.py` |
| `VIDEO_API_KEY`, `VIDEO_BASE_URL`, `VIDEO_MODEL` (default `seedance-2.0`) | `tools/clips.py` |
| `FACE_MODEL` | `tools/faces.py` |

## License

MIT (see `LICENSE`). Bundled KanjiVG stroke data is CC BY-SA 3.0, see `THIRD_PARTY.md`.
