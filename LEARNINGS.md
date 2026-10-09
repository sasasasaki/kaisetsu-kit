# Learnings

Techniques we picked up, newest first. Each entry says why it matters and how the kit enforces it.

## 2026-10-09 — from studying cclank/lanshu-create-ai-presenter-video and ChenShuo2004/cs-skills

- **Stage is computed from artifacts, not declared.**
  Why: "done" in a chat log drifts from what is on disk; a re-recorded line or a newer timeline silently makes a render stale.
  How: `tools/stage.py` walks fixed gates (script, voice, visuals, timeline, qc, rendered, verified, published) by file existence, mtimes and byte sizes.
- **Verify the delivery file itself.**
  Why: a render can finish with a broken segment, wrong loudness or a stuck stretch nobody watched.
  How: `tools/verify.py` fully decodes, measures -16 LUFS ±1 and true peak ≤ -0.5 dBTP, runs freezedetect and blackdetect, writes the SRT and a 720p draft; it exits 1 on any failure and `stage.py` only accepts a pass for the same byte size.
- **Word-level timestamps come from the TTS engine.**
  Why: aligning cues to audio after the fact is guesswork; the engine already knows when each character is spoken.
  How: `tools/tts.py batch --timed` uses the with-timestamps endpoint and stores per-character alignment in the manifest.
- **A pixel-still hold reads as a frozen video.**
  Why: tables and lists held for 3–7 s were flagged by freezedetect, and viewers read them as a stalled player.
  How: `components.js` wraps every diagram shot in micro-motion (0.8% push, 3 px sway); scenes get mist and a light sweep; summary images drift 1%. Intended stills must be declared in `holds`.
- **Paid-call guardrails.**
  Why: batch failures and rerolls are where money disappears.
  How: `tts.py --pilot N` records a few lines first; each line retries at most twice and three failures in a row stop the batch; `clips.py` refuses an id that already has 3 rejected takes.

## 2026-10-08 — from our own production

- **The overlap checker must see offscreen layers.**
  Why: shots are drawn on offscreen layers and composited; a checker that only hooked the main canvas reported "0 collisions" while diagram text sat under cards and subtitles. We shipped that once.
  How: `tools/qc_cards.py` records `fillText` on every canvas with the frame's size, card text excluded, subtitle text tagged.
- **Place vocab cards by the fraction of each face they cover.**
  Why: one fixed corner kept landing on faces; raw overlap area penalises big faces and misses fully hidden small ones.
  How: `faceHit` in `components.js` follows the shot's push/pull, tests 6 candidate slots and keeps the one whose worst face coverage is smallest; QC reports any card still covering more than 20% of a face.
- **Summary illustrations are framed above the tallest subtitle, not full-bleed.**
  Why: a summary image is read in full; full-bleed lets the subtitle box and corner marks cover its labels.
  How: `summary()` computes the highest subtitle top during the shot with the same layout code as `subtitle()` and fits the framed image above it.
- **Ladder, list and title layouts clear the subtitle box.**
  Why: the lowest rung, the last list items and title sub-lines were drawn under two-line subtitles.
  How: overrides in `components.js` lift those layouts; `qc_cards.py --subs` scans the whole film for any non-subtitle text inside the box.
- **Image models invent glyphs.**
  Why: generated labels contain characters that do not exist, which an audience of readers notices at once.
  How: prompts list the exact characters that may appear; every label is zoom-inspected before an image is accepted (a manual step in `SKILL.md`).
- **A video clip pasted back at its exact crop box makes the still come alive.**
  Why: cutting from a page to a separate full-screen clip breaks the reading flow.
  How: in the comic route each clip carries its crop box in page pixels; `comic.js` draws it over the page there and the camera pushes to that box until it fills the screen, then pulls back to the page.
- **Keep speech balloons out of the crop.**
  Why: trying to protect balloons inside a generated clip fails (the model redraws or smears the lettering).
  How: crop clips to the art only; the original page keeps its balloons around the pasted clip.
