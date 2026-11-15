#!/usr/bin/env bash
# Create (or complete) <workspace_root>/.env with an empty GLM_API_KEY slot for the USER to fill in.
#   bash init_env.sh <workspace_root>
# - never overwrites or prints an existing value; only appends the variables that are missing
# - chmod 600, and adds .env to .gitignore when the workspace is a git repo
set -euo pipefail
[ $# -ge 1 ] || { echo "usage: bash init_env.sh <workspace_root>"; exit 2; }
WS="$(cd "$1" && pwd -P)"; F="$WS/.env"
touch "$F"; chmod 600 "$F"
has() { grep -q "^$1=" "$F"; }

[ -s "$F" ] || echo "# 讲解视频配音设置（只在这个目录生效）。key 只填等号后面，不要加引号或空格。" >> "$F"
if ! has GLM_API_KEY || ! has GLM_VOICE; then
  printf '\n# 智谱 GLM-TTS：https://bigmodel.cn/usercenter/proj-mgmt/apikeys 创建 API Key\n' >> "$F"
  has GLM_API_KEY || echo "GLM_API_KEY=" >> "$F"
  has GLM_VOICE || echo "GLM_VOICE=chuichui" >> "$F"
fi

if git -C "$WS" rev-parse --is-inside-work-tree >/dev/null 2>&1 && ! git -C "$WS" check-ignore -q "$F"; then
  echo ".env" >> "$WS/.gitignore"; echo "added .env to $WS/.gitignore"
fi
echo "ready: $F"
if grep -q "^GLM_API_KEY=." "$F"; then echo "GLM_API_KEY: filled (value not shown)"; else echo "GLM_API_KEY: EMPTY -> the user must fill it in, then come back"; fi
