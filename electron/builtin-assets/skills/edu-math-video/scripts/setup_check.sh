#!/usr/bin/env bash
# Verify everything the pipeline needs. Prints OK / MISSING per item and the fix. Exit code 1 if anything is missing.
#   bash setup_check.sh <project_dir>
set -uo pipefail
P="$(cd "${1:-.}" && pwd)"; bad=0
ok()   { printf '  OK       %s\n' "$1"; }
miss() { printf '  MISSING  %s\n           fix: %s\n' "$1" "$2"; bad=1; }
up() { d="$P"; while [ "$d" != "/" ]; do [ -e "$d/$1" ] && { echo "$d"; return 0; }; d="$(dirname "$d")"; done; return 1; }

echo "project: $P"
PY=""
for c in /usr/bin/python3 python3 python; do
  if command -v "$c" >/dev/null 2>&1 && "$c" -c "import numpy, requests, pypinyin" 2>/dev/null; then PY="$(command -v "$c")"; break; fi
done
[ -n "$PY" ] && ok "python with numpy+requests+pypinyin: $PY   (use this as PY)" \
  || miss "python3 with numpy, requests, pypinyin" "python3 -m pip install --user numpy requests pypinyin pillow"
[ -n "$PY" ] && { "$PY" -c "import PIL" 2>/dev/null && ok "pillow (problem image tools)" || miss "pillow" "$PY -m pip install --user pillow"; }
command -v node >/dev/null && ok "node $(node -v)" || miss "node" "install Node.js 18+"
NM="$(up node_modules/playwright)" && ok "playwright in $NM/node_modules" || miss "playwright (shared node_modules)" "cd <workspace_root> && npm install   (package.json made by new_video.sh)"
FF="$(up node_modules/ffmpeg-static/ffmpeg)" && ok "ffmpeg-static in $FF/node_modules" || miss "ffmpeg-static" "cd <workspace_root> && npm install"
if [ -d "/Applications/Google Chrome.app" ] || command -v google-chrome >/dev/null 2>&1; then ok "Google Chrome"; else
  echo "  note     no Google Chrome: render.mjs falls back to Playwright Chromium -> run: npx playwright install chromium"; fi
PR="$(up pron.py)" && [ -e "$PR/pron.json" ] && ok "pron.py + pron.json in $PR" || miss "pron.py + pron.json" "copy <skill>/shared/pron.* to the workspace root"
SKILL="$(cd "$(dirname "$0")/.." && pwd -P)"
PT="$(up tts.py)" && ok "tts.py (shared TTS engines) in $PT" || miss "tts.py next to pron.py" "ln -s $SKILL/shared/tts.py <workspace_root>/"
if [ -n "$PY" ]; then
  # engine = episode.json "tts" > TTS_ENGINE > auto; `tts.py info` never prints key values
  ET="$(grep -o '"tts" *: *"[a-z]*"' "$P/episode.json" 2>/dev/null | sed 's/.*"\([a-z]*\)"$/\1/')"
  INFO="$(cd "$P" && "$PY" "$SKILL/shared/tts.py" info ${ET:+--tts "$ET"} 2>/dev/null)"
  echo "  tts      $INFO"
  ENG="$(echo "$INFO" | awk '{print $2}')"
  case "$ENG" in
    glm) KV=GLM_API_KEY ;; doubao) KV=DOUBAO_API_KEY ;; minimax) KV=MINIMAX_API_KEY ;; *) KV="" ;;
  esac
  if [ -z "$ENG" ]; then miss "shared/tts.py info" "run: cd $P && $PY $SKILL/shared/tts.py info   (read the error)"
  elif [ -n "$KV" ] && ! echo "$INFO" | grep -q "$KV=set"; then
    miss "$KV (TTS engine $ENG)" "bash $SKILL/scripts/init_env.sh <workspace_root> $ENG, then ASK THE USER to fill in $KV in <workspace_root>/.env and come back (reference/tts-setup.md); or pick another engine (\"tts\" in episode.json). Do NOT go looking for another project's .env."
  elif [ -z "$KV" ] && echo "$INFO" | grep -q "\[auto\]"; then
    miss "a TTS choice (no key: only the fallback $ENG is left)" "ASK THE USER: fill in a key (bash $SKILL/scripts/init_env.sh <workspace_root> <engine>, then wait for them) or use $ENG, warning that it sounds noticeably worse; record the choice as \"tts\": \"$ENG\" in episode.json"
  elif [ -z "$KV" ]; then
    echo "  note     TTS engine $ENG chosen by the user (fallback quality). Remind them at delivery; GLM, Doubao or MiniMax sound better."
  else ok "TTS engine $ENG with $KV (value not shown)"; fi
  echo "$INFO" | grep -q "GLM_API_KEY=set" || echo "  note     no GLM_API_KEY: --asr (letter check) will be skipped"
fi
[ $bad -eq 0 ] && echo "ALL OK. Next: key test ->  cd $P && ${PY:-python3} build_audio.py --say \"你好，我们来看一道数学题。\"" || echo "Fix the MISSING items, then run this again."
exit $bad
