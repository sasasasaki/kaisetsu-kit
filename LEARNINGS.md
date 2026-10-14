# Learnings

Techniques we picked up, newest first. Each entry says why it matters and how the kit enforces it.

## 2026-10-15 — one in-story document as the whole stage

- **A single page from the story's own world can carry a whole explainer.** A newspaper (or notice, book page, scroll) is the stage: one
  camera pushes and pulls over it in the page's own coordinates, eased, never a hard cut. The reviewer thought it may work even better
  than our voiced motion comics, and that it fits many subjects besides comics. The kit cannot do it yet: `cam` pushes a cover-fitted
  scene by 1.12–1.42×, so under `cam` a portrait page is never seen whole (whole sheet to one sentence is about 4×; summary illustrations
  and `manga` shots show a page whole but cannot push or pull), each new section bleeds in through an ink mask, and the comic route's
  page camera has no beats layer.
- **The layout is the outline.** A title, exactly three blocks and one closing line already say "three things today" (newspaper: headline,
  three short stories, pull quote; notice: title, three articles, closing line; textbook page or scroll: heading, three sections or
  passages, the key sentence), one section per block, the closing line as the ending, so the viewer always knows where they are. The page
  takes the place of the `gates` overview; name its blocks in `assets/regions.json`.
- **A quote card must stay readable for 3 s before anything covers it.** Circle the key sentence, then show it in the document's language
  with the translation under it; bring the card in at the start of its line and hold the next panel back (the first review found one
  covered by the next panel after 0.7 s). The kit's `tris` (zh / ja / en for a Chinese original) have no minimum time.
- **Panels rise out of the page and sink back.** A comic panel or illustration grows out of the block it illustrates, may push in for a
  detail, and shrinks back into that block at the section's end, the dimmed page still around it. The kit's `inset` only slides a crop
  into a free spot.
- **Marks stay on the page.** Circles, underlines and boxes in an ink of the document's world (multiply on the paper) are never erased, so
  the final pull-back shows everything that was read. Keep them tight to the line: a circle that took in half a line above and below read
  as a strike-through. The kit's `circle` pads its box 18 px across and 14 px up and down, and fades after its line.
- **Every card over printed text needs an opaque ground.** Section names, labels and quote cards on the page's body text were unreadable
  with any translucency, and `qc_layout` cannot see it (print is pixels, not drawn text): look at frames. Most grounds in the kit
  (`tag`, `write`, subtitles) are 86–94% opaque; the section name in `chrome` has none.
- **Side characters that pop in take space, not just pixels.** While a talking bust is on screen the centre zone shrinks away from it and
  focus, panels, cards and subtitles follow; a card that would be squeezed out leaves 1.2 s before the bust talks (`qc_layout` caught one
  running off its card). Stickers and new-word tags take three fixed slots per side margin and never the centre (the kit's `xbPlace`
  searches for any free spot instead); report a full margin in `XB.crowded`, which `qc_layout` lists (entries end in `@<seconds>`).
- **Every line still reacts, and the meant silences are marked.** A panel shown before anyone speaks, or the pause after a punchline, is a
  `hold`, not a `rest`: a `rest` never reaches `verify`, so a still stretch of 4 s or more there fails as frozen, while `hold` spans go to
  `qc/holds.json`, which `verify` exempts. `beat_gaps.py` counts every beat except `rest` / `hold` / `clear`, so new kinds count as they
  are; silence before a line is `pre` on its section, which `plan.py` reads and `board.py` cannot set yet.
- **Suggested beats (not in the kit yet).** A `doc` shot in page pixels that spans sections; `cam` extended with `{view, into}` to fit the
  whole sheet or one sentence into the centre zone or its left half; `ink {circle|under|box}` kept to the end; `qcard {orig, tr, keep}` for
  the quote card (`quote` is already a diagram); opaque grounds; `panel {img, box, slot: c|l|r, origin}`, `pzoom {box}`, `unpanel`;
  `bust {pose, side}`; `sticker` and `word` in margin slots.

## 2026-10-10 — pauses are part of the rhythm

- **A 2.5 s freeze limit flagged deliberate pauses.** A calligraphy shot that let two tags sit for three seconds failed delivery and cost
  a full re-render. Frozen now means 4 s of identical frames.
- **The author marks the pauses that are meant.** A `hold` beat (`{do: "hold", sec, k, at, len}`) says "this stillness is on purpose":
  `beat_gaps` does not count it as a gap and writes its span to `qc/holds.json`, which `verify` exempts. Mark it while writing the beats,
  not after a failed render.
- **Check only what changed.** After editing a few lines, run `qc_layout` on that time range (`qc_layout.py <project> 0.5 <from> <to>`)
  instead of the whole film; `beat_gaps` runs before rendering and catches most static stretches in seconds.

## 2026-10-10 — place everything in time order, before drawing

- **"Placed on its first frame" is not deterministic.** The first frame that draws a reaction differs between a chunked render (each worker
  starts mid-film), the sequential layout check and a single still, so the check passed while the film had labels on top of each other.
  How: `xbPlace` places every tag, written word and inset once, in time order, each seeing only the ones placed before it. Same layout
  whatever order frames are drawn in.
- **Avoid over the reaction's whole life, not the frame it appears in.** A tag placed beside a face in the wide shot ended up on the face
  after the next push. Faces are sampled every 0.25 s through the push/pull; circles are sampled the same way (a circle grows with a push
  and struck through a fixed tag). A tag pinned to a box does not avoid that box's own circle, or it drifts next to something else.
- **No free spot is a reported fallback, not a silent one.** The least-covered spot is used and `qc_layout` lists it as `crowded`.

## 2026-10-10 — placed once, then kept

- **A reaction's position is decided on its first frame and never re-fitted.**
  Why: re-fitting every frame made a tag jump hundreds of pixels when a card or another tag appeared next to it, and a tag that followed
  its box was carried off screen by the next camera push while it faded out.
  How: `xbFit` caches the offset (`fitAt`), `xbWhere` caches the screen point (`whAt`). The first placement already avoids everything that
  will show during the reaction's life: cards, tri bands, circles and strikes (`xbLifeObs`).
- **Cards avoid what is being pointed at, not only faces.** A card that covers the box being circled or pushed into hides the point of the line.
  How: `faceHit` samples every half second (three samples missed a face the camera pushed into) and adds `xbCardAvoid`; when every slot
  covers more than 20%, the card is tucked small in the corner.
- **Written words are placed before tags** in a frame, so a tag can see them.

## 2026-10-10 — layout QC, and why it needs its own checker

- **Text off-screen, out of its card, under the subtitle, or on a face is the most visible mistake in a choreographed explainer.**
  Why: the reviewer found a reading running off a vocab card, a tag pinned under a region that the camera had pushed below the subtitle, and
  labels covering faces once the metaphor images were redrawn with the cast in them.
  How: `tools/qc_layout.py` steps through the film, records every piece of text drawn on the main canvas with its transformed box and every
  paper panel, and reports offscreen / overflow / undersub / overlap with a screenshot per issue. Smoke runs it. A page error stops it (a broken
  script hides whole layers, which once made the check report zero).
- **Placement searches for a free spot instead of nudging.** Tags, written words and insets avoid the subtitle box (the tallest subtitle
  while they show), the edges and header, vocab cards, tri bands and the current shot's faces (faces.json projected through the push/pull);
  pushing only up or down kept landing on the next thing.
- **A tag pinned below a region sits 18 px under it**, not overlapping it, so the circle on the same region never strikes through it.
- **Machine checks do not see faces covered, circles off target or a tag that names the wrong thing.** We run a separate review agent that
  only inspects and files a list with screenshots; fixes are done by someone else. Keep reviewer and fixer apart.
- **Gap filler marks whole words only** (`tools/fill_marks.py`): half-words and particles underlined in the subtitle looked like mistakes.

## 2026-10-09 — every line gets a reaction (from our own production)

- **Micro-motion does not fix a static explainer; choreography does.**
  Why: viewers felt the picture stand still while the narrator explained. A 1% drift only hides the freeze detector; it does not show what is being said.
  How: `engine/beats.js` — each line carries beats that fire on a substring of the line: push the camera to the named box being talked about,
  write the key word with the brush, circle or strike with the brush, pin a tag, slide in an inset, write into a small ledger, flip a formula
  from = to ≠. A section of 2 minutes went from 3.5 to 37 reactions per minute and from 39% to 100% of lines with a reaction.
- **Fire on the spoken word, not on the line start.**
  Why: a tag that appears a second before or after the word reads as a mistake.
  How: `tools/align.py` (faster-whisper word timestamps mapped back to the script per character) or engine timestamps; `board.py` checks every
  trigger is still a substring of its line, so a rewrite fails loudly instead of drifting.
- **Measure it before rendering.**
  How: `tools/beat_gaps.py` — every line ≥1 event, lines ≥5 s ≥2, no gap over 3.5 s while speaking; smoke runs it.
- **A cut clears what was stacked on the previous shot.**
  Why: overlays fading into the next image looked like leftovers.
  How: `beats.js` ends every layer at the next shot change; only a section carrier (`slot`) survives.
- **A carrier appears when its first entry is written.** An empty ledger hanging on screen for half a minute was the first thing the reviewer disliked.
- **Write the English with the word.** Every written word, tag, ledger entry, inset caption and board label carries an `en` line, so an English cut needs no new images.
- **Rolling it out to a whole film needs new pictures, not just new code.** A 4-minute section on three images leaves the camera nothing to point at; each section of our first film got 4–8 new metaphor images (no characters, so regions are easy to name), placed as extra shots on the line they explain.
- **Two bugs found only at film scale:** a ledger collected entries from every section (scope fills to their section), and a strike through a tag was hidden by the tag itself (draw brush marks after words and tags).
- **Brush marks should look like brush marks.** Circles and strikes use the same stroke model as the title calligraphy (pressure at the start, dry-brush streaks at the end) in cinnabar; the reviewer singled this out as the best part.

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
