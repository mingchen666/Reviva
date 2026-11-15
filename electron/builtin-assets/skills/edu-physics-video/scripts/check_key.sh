#!/usr/bin/env bash
# Step 0 gate, BEFORE solving or writing anything: can the voice-over run in this workspace?
#   bash check_key.sh <workspace_root>
# exit 0 = READY (GLM_API_KEY set, or the user already chose a fallback via TTS_ENGINE=say|edge)
# exit 1 = not ready: the message says what to ask the user. Key values are never printed.
set -uo pipefail
WS="$(cd "${1:-.}" && pwd -P)"; SKILL="$(cd "$(dirname "$0")/.." && pwd -P)"
d="$WS"; ENVF=""
while [ "$d" != "/" ]; do [ -f "$d/.env" ] && { ENVF="$d/.env"; break; }; d="$(dirname "$d")"; done
val() { local v="${!1:-}"; [ -z "$v" ] && [ -n "$ENVF" ] && v="$(grep "^$1=" "$ENVF" | tail -1 | cut -d= -f2-)"; echo "$v"; }
KEY="$(val GLM_API_KEY)"; TE="$(val TTS_ENGINE)"
if [ -n "$KEY" ] && { [ -z "$TE" ] || [ "$TE" = auto ] || [ "$TE" = glm ]; }; then
  echo "READY: GLM-TTS (GLM_API_KEY set in ${ENVF:-environment}, value not shown). Continue with step 1."; exit 0
fi
case "$TE" in
  say|edge) echo "READY: fallback TTS_ENGINE=$TE chosen by the user (sounds noticeably worse; remind them at delivery). Continue with step 1."; exit 0 ;;
  glm) ;;
  ""|auto) ;;
  *) echo "NOT READY: TTS_ENGINE=$TE is not supported here (glm / edge / say)."; exit 1 ;;
esac
echo "NOT READY: no GLM_API_KEY in $WS/.env. ASK THE USER (AskUserQuestion), then END THE TURN:"
echo "  1) 填写 key（推荐）: bash $SKILL/scripts/init_env.sh \"$WS\" ; tell them the full .env path and to fill in GLM_API_KEY (reference/glm-tts-setup.md), wait for them, run this check again"
echo "  2) 用系统自带的 say（或已安装的 edge-tts）: warn that it may not sound good (机械感明显, 断句和读音不如 GLM); if they pick it, add TTS_ENGINE=say (or edge) to $WS/.env and run this check again"
exit 1
