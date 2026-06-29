#!/usr/bin/env bash
# 标准化渲染封装：自动激活 setup 创建的虚拟环境，渲染指定 Scene，并打印产物路径。
#
# 用法:
#   bash render.sh <scene.py> <SceneName> [quality]
#
# quality:
#   s  -> 只渲染最后一帧为 PNG（最快，用于布局自检；用读图能力看这张图）
#   l  -> 480p15  低质量草稿
#   m  -> 720p30  中质量草稿（默认）
#   h  -> 1080p60 高质量定稿
#   k  -> 2160p60 4K（很慢，慎用）
#
# 例:
#   bash render.sh scene.py Intro s     # 先看布局
#   bash render.sh scene.py Intro m     # 出草稿视频
set -u

if [ "$#" -lt 2 ]; then
  echo "用法: bash render.sh <scene.py> <SceneName> [s|l|m|h|k]"
  exit 2
fi

FILE="$1"; SCENE="$2"; Q="${3:-m}"

if [ ! -f "$FILE" ]; then
  echo "找不到文件: $FILE"
  exit 2
fi

# 进入 scene 文件所在目录再渲染，这样 media/ 输出始终落在 scene.py 旁边，
# 无论从哪个目录调用本脚本都正确。
FILE_DIR="$(cd "$(dirname "$FILE")" && pwd)"
FILE_BASE="$(basename "$FILE")"
cd "$FILE_DIR" || { echo "无法进入目录 $FILE_DIR"; exit 2; }

# 激活 setup_manim.sh 创建的虚拟环境（若存在）
PROJ_ENV_DIR="${MANIM_VENV:-$HOME/.cache/manim-explainer-venv}"
if [ -f "$PROJ_ENV_DIR/bin/activate" ]; then
  # shellcheck disable=SC1091
  source "$PROJ_ENV_DIR/bin/activate"
fi

if ! command -v manim >/dev/null 2>&1 && ! python -c "import manim" >/dev/null 2>&1; then
  echo "未找到 manim。请先运行 setup_manim.sh。"
  exit 2
fi
MANIM="manim"
command -v manim >/dev/null 2>&1 || MANIM="python -m manim"

case "$Q" in
  s) FLAGS="-s -qm"; KIND="still(PNG)";;
  l) FLAGS="-ql";    KIND="video 480p";;
  m) FLAGS="-qm";    KIND="video 720p";;
  h) FLAGS="-qh";    KIND="video 1080p";;
  k) FLAGS="-qk";    KIND="video 4K";;
  *) echo "未知质量 '$Q'（用 s/l/m/h/k）"; exit 2;;
esac

echo "==> 渲染 $SCENE （$KIND） @ $FILE_DIR ..."
# shellcheck disable=SC2086
$MANIM $FLAGS "$FILE_BASE" "$SCENE"
RC=$?
if [ "$RC" -ne 0 ]; then
  echo "渲染失败（退出码 $RC）。请查看上面的报错，并对照 references/manim-guide.md 的“常见错误速查”。"
  exit "$RC"
fi

# 定位最新产物（用 find 递归查找，最稳健），打印绝对路径
newest() { find "$1" -type f -name "$2" -print0 2>/dev/null | xargs -0 ls -t 2>/dev/null | head -n1; }

if [ "$Q" = "s" ]; then
  OUT=$(newest media/images "*.png")
  [ -n "${OUT:-}" ] && OUT="$FILE_DIR/${OUT#./}"
  echo "✅ 静帧 PNG: ${OUT:-未找到，请检查 $FILE_DIR/media/images/}"
  echo "   下一步：用读图能力打开这张 PNG，确认无重叠/出界、文字清晰、对齐正确。"
else
  OUT=$(newest media/videos "*.mp4")
  if [ -n "${OUT:-}" ] && [ -s "$OUT" ]; then
    # 把成片复制到主题文件夹根目录（和 index.html 并排），方便用户查找
    cp -f "$OUT" "$SCENE.mp4"
    echo "✅ 视频成片（已放到项目根，方便查找）:"
    echo "   $FILE_DIR/$SCENE.mp4  ($(du -h "$SCENE.mp4" | cut -f1))"
    echo "   （Manim 原始输出在 media/ 下，可忽略）"
  else
    echo "⚠️ 未找到 MP4，请检查 $FILE_DIR/media/videos/ 目录。"
  fi
fi
