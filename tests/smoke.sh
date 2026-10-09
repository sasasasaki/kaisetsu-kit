#!/usr/bin/env bash
# End-to-end dry run, no paid API: placeholder art + placeholder voice -> plan -> sound -> overlap QC -> render -> verify.
# Needs python (numpy, scipy, pillow, playwright + its chromium) and ffmpeg/ffprobe on PATH. PYTHON=... to pick an interpreter.
set -euo pipefail
cd "$(dirname "$0")/.."
PY=${PYTHON:-python}
step() { echo; echo "== $*"; }

step explainer: assets, script, voice, board, timeline, sound
$PY projects/example/make_assets.py
$PY tools/validate_src.py example
$PY tools/make_script.py example
$PY tools/dry_voice.py example
$PY tools/board.py example
$PY tools/plan.py example
$PY tools/sound.py example
step explainer: overlap checks
$PY tools/qc_cards.py example
$PY tools/qc_cards.py example --subs 1.0
$PY tools/beat_gaps.py example
$PY tools/qc_layout.py example 0.5
step explainer: stills, video, verify
rm -f projects/example/qc/still-*.jpg
$PY tools/render.py example stills auto
$PY tools/render.py example video 3
$PY tools/verify.py example --draft
$PY tools/stage.py example

step comic route
$PY projects/comic-example/make_assets.py
$PY tools/dry_voice.py comic-example
$PY tools/plan_comic.py comic-example
$PY tools/sound.py comic-example
$PY tools/render.py comic-example stills auto
$PY tools/render.py comic-example video 2
$PY tools/verify.py comic-example

step done
ls projects/example/qc/still-*.jpg | wc -l | xargs echo "explainer stills:"
ls -la projects/example/renders/final.mp4 projects/comic-example/renders/final.mp4
echo SMOKE OK
