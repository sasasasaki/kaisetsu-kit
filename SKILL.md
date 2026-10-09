---
name: kaisetsu-kit
description: Turn a script into a narrated canvas explainer video (1920x1080, Japanese narration with English subtitles) with brush-kanji openers, vocab "translation cards" that avoid faces and text, tri-language quote columns (zh / ja / en), framed summary illustrations, tables and diagrams, plus a motion-comic route that pans over manga pages. Use when asked to build, re-render, check or package an explainer / 解説 video or a motion comic from a script. Progress is computed from artifacts (stage.py) and every delivery passes overlap QC and verify.py.
---

# kaisetsu-kit

Everything is a pure function of time: `renderAt(t)` draws one frame on a canvas, Playwright grabs every frame,
ffmpeg encodes. The timeline (`src/timeline.json`) is generated, never hand-edited.

## Layout

- `engine/` canvas engine (`engine.js`, `components.js`, `brush.js`, `strokes.js`), motion comic (`comic.js`), web page template
- `tools/` the pipeline, one script per step, all `python tools/<step>.py <project>`
- `projects/<name>/` one folder per video; `projects/example` and `projects/comic-example` are runnable demos

## Explainer route

1. Write `assets/voice/script.src.json`: sections of `[speaker, tag, ja, zh, en]`. Cut long lines with `｜` (ja) and `|` (en) at the same places.
   Readings for TTS go in `kana.json`. Run `tools/validate_src.py` until it prints OK.
2. `tools/make_script.py` -> `assets/voice/script.json`.
3. Voice: `tools/dry_voice.py` for a free placeholder, or `tools/tts.py batch <p> --pilot 10` (ELEVENLABS_API_KEY), listen, then the rest.
4. Images: scenes in `assets/kv/`, summary illustrations in `assets/sum/`, optional `tools/faces.py` for face boxes.
   When generating images with text, ask for exact glyphs in the prompt and zoom-inspect every label (models invent characters).
5. `notes.json` (scenes, diagrams, sums, cards, tris placed by keyword) -> `tools/board.py` -> `src/board.json`.
6. `tools/plan.py` (timeline) -> `tools/sound.py` (audio).
7. `tools/qc_cards.py <p>` and `tools/qc_cards.py <p> --subs` must both report 0.
8. `tools/render.py <p> stills auto` and look at them; then `tools/render.py <p> video 3`.
9. `tools/verify.py <p> --draft` must PASS (decode, -16 LUFS, true peak, freeze/black, SRT, 720p draft).
10. `tools/build_web.py <p>` for a chaptered web package. `tools/stage.py <p>` tells where the project stands.

## Comic route

`comic.json` (pages, panels with boxes, lines, captions, clips, knocks) -> `tools/dry_voice.py` or recorded lines ->
`tools/plan_comic.py` -> `tools/sound.py` -> `tools/render.py` -> `tools/verify.py`. Clips: `tools/clips.py` (VIDEO_API_KEY,
VIDEO_BASE_URL) then `tools/frames.py`; map a clip to a panel with its crop box in page pixels.

## Rules

- Language spheres, not countries: say "Chinese-speaking / Japanese-speaking sphere".
- A quote whose original is Chinese is shown in three columns: zh, ja, en (board `tris`, or a `tri` shot).
- Every term the audience may not know gets a vocab card; works cited as examples get a memo card.
- Nothing may sit under the subtitle box or under a card; summary images are framed above the tallest subtitle.
- Paid APIs: pilot first (10 lines / 1 clip), retries are capped, stop after 3 rejected takes of the same item.
- Do not claim done without artifacts: `stage.py` decides.

See `README.md` for formats and `LEARNINGS.md` for why each rule exists.
