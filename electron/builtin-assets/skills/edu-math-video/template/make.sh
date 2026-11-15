#!/usr/bin/env bash
# Full build: lint + pronunciation check -> TTS + mix -> stills for review. Preview = open index.html.
# Usage: ./make.sh              build, then open index.html in a browser to watch
#        ./make.sh video [n]    also export the MP4 (n = parallel browser pages, default 6)
#        (PY=/path/to/python3 ./make.sh to choose the interpreter)
set -euo pipefail
cd "$(dirname "$0")"
if [ -z "${PY:-}" ]; then
  if /usr/bin/python3 -c "import numpy, requests, pypinyin" 2>/dev/null; then PY=/usr/bin/python3; else PY=python3; fi
fi
"$PY" build_audio.py --check
"$PY" build_audio.py
node render.mjs motion
node render.mjs stills auto
if [ "${1:-}" = video ]; then node render.mjs video "${2:-6}"; else echo "preview: open $(pwd)/index.html   (MP4: ./make.sh video)"; fi
