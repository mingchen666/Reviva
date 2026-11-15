#!/usr/bin/env bash
# Create (or complete) <workspace_root>/.env with empty TTS key slots for the USER to fill in.
#   bash init_env.sh <workspace_root> [engine]     engine = glm | doubao | minimax (whose key is needed now)
# - never overwrites or prints an existing value; only appends the variables that are missing
# - chmod 600, and adds .env to .gitignore when the workspace is a git repo
set -euo pipefail
[ $# -ge 1 ] || { echo "usage: bash init_env.sh <workspace_root> [glm|doubao|minimax]"; exit 2; }
WS="$(cd "$1" && pwd -P)"; ENG="${2:-}"; F="$WS/.env"
touch "$F"; chmod 600 "$F"

has() { grep -q "^$1=" "$F"; }
add() {  # add <comment> <VAR=default>...
  local c="$1"; shift; local need=0
  for kv in "$@"; do has "${kv%%=*}" || need=1; done
  [ $need -eq 1 ] || return 0
  printf '\n# %s\n' "$c" >> "$F"
  for kv in "$@"; do has "${kv%%=*}" || echo "$kv" >> "$F"; done
}

[ -s "$F" ] || echo "# edu-math-video 配音设置（只在这个目录生效）。key 只填等号后面，不要加引号或空格。" >> "$F"
add "智谱 GLM-TTS：https://bigmodel.cn/usercenter/proj-mgmt/apikeys 创建 API Key" "GLM_API_KEY=" "GLM_VOICE=chuichui"
add "豆包语音合成 2.0：火山引擎控制台 https://console.volcengine.com/speech/new 创建 API Key，音色选 2.0 音色" \
    "DOUBAO_API_KEY=" "DOUBAO_VOICE=zh_male_youyoujunzi_uranus_bigtts"
add "MiniMax：https://platform.minimaxi.com 账户管理 → 接口密钥" "MINIMAX_API_KEY=" "MINIMAX_VOICE=Chinese_casual_instructor_nv1"
has VIDEO_TEMPLATE || has TTS_ENGINE || printf '\n# 可选：默认模板和配音引擎，设了以后不再每次询问\n# VIDEO_TEMPLATE=lab\n# TTS_ENGINE=doubao\n' >> "$F"

if git -C "$WS" rev-parse --is-inside-work-tree >/dev/null 2>&1 && ! git -C "$WS" check-ignore -q "$F"; then
  echo ".env" >> "$WS/.gitignore"; echo "added .env to $WS/.gitignore"
fi

case "$ENG" in
  glm) K=GLM_API_KEY ;; doubao) K=DOUBAO_API_KEY ;; minimax) K=MINIMAX_API_KEY ;; *) K="" ;;
esac
echo "ready: $F"
if [ -n "$K" ]; then
  if grep -q "^$K=." "$F"; then echo "$K: filled (value not shown)"; else echo "$K: EMPTY -> the user must fill it in, then come back"; fi
fi
