#!/usr/bin/env bash
# 安装 Manim 运行环境（幂等：已装则跳过）。主要面向 macOS，Linux 也大体可用。
# 用法: bash setup_manim.sh
set -u

say()  { printf "\033[1;34m[setup]\033[0m %s\n" "$*"; }
ok()   { printf "\033[1;32m[ ok ]\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33m[warn]\033[0m %s\n" "$*"; }

OS="$(uname -s)"

# 1) ffmpeg —— Manim 合成视频必需
if command -v ffmpeg >/dev/null 2>&1; then
  ok "ffmpeg 已安装: $(ffmpeg -version 2>/dev/null | head -n1)"
else
  say "未检测到 ffmpeg，尝试安装..."
  if [ "$OS" = "Darwin" ] && command -v brew >/dev/null 2>&1; then
    brew install ffmpeg
  elif command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update && sudo apt-get install -y ffmpeg
  else
    warn "无法自动安装 ffmpeg，请手动安装后重试（mac: brew install ffmpeg）。"
  fi
fi

# 1.5) 系统原生库 —— pip 构建 pycairo / manimpango 必需（缺则报 "cairo ... NO / pkg-config NO"）
#      这是 macOS/Linux 上 manim 安装最常见的失败点，务必先装。
say "检查 manim 所需的系统原生库 (cairo / pango / pkg-config)..."
if [ "$OS" = "Darwin" ]; then
  if command -v brew >/dev/null 2>&1; then
    for pkg in pkg-config cairo pango; do
      if brew list "$pkg" >/dev/null 2>&1; then
        ok "$pkg 已安装"
      else
        say "brew install $pkg ..."
        brew install "$pkg"
      fi
    done
  else
    warn "未检测到 Homebrew。请先装 brew，再手动: brew install pkg-config cairo pango"
  fi
elif command -v apt-get >/dev/null 2>&1; then
  say "apt-get 安装 build-essential / cairo / pango / pkg-config ..."
  sudo apt-get update && sudo apt-get install -y \
    build-essential python3-dev libcairo2-dev libpango1.0-dev pkg-config
else
  warn "未知系统：请自行安装 cairo、pango、pkg-config 开发库后重试。"
fi

# 2) Python venv —— 优先用 uv（Manim 官方推荐），否则用内置 venv
PROJ_ENV_DIR="${MANIM_VENV:-$HOME/.cache/manim-explainer-venv}"
if command -v uv >/dev/null 2>&1; then
  say "检测到 uv，用 uv 创建/复用虚拟环境: $PROJ_ENV_DIR"
  uv venv "$PROJ_ENV_DIR" >/dev/null 2>&1 || true
  # shellcheck disable=SC1091
  source "$PROJ_ENV_DIR/bin/activate"
  uv pip install --upgrade manim fonttools
else
  say "未检测到 uv，使用 python3 venv: $PROJ_ENV_DIR"
  python3 -m venv "$PROJ_ENV_DIR"
  # shellcheck disable=SC1091
  source "$PROJ_ENV_DIR/bin/activate"
  python -m pip install --upgrade pip >/dev/null
  python -m pip install --upgrade manim fonttools
fi

# 3) 校验 manim
if python -c "import manim" >/dev/null 2>&1; then
  ok "manim 安装成功: $(python -c 'import manim;print(manim.__version__)')"
else
  warn "manim 导入失败，请查看上面的 pip 错误输出。"
fi

# 4) LaTeX（可选）—— 仅当需要 MathTex/Tex 高质量公式时
if command -v latex >/dev/null 2>&1; then
  ok "LaTeX 可用，可使用 MathTex/Tex。"
else
  warn "未检测到 LaTeX（可选）。没有它就用 Text 写公式即可（见 manim-guide）。"
  warn "如需高质量公式: mac 用 'brew install --cask mactex-no-gui' 或体积更小的 'brew install --cask basictex'。"
fi

cat <<EOF

------------------------------------------------------------
环境就绪。后续渲染请用 render.sh（它会自动激活同一个 venv）。
虚拟环境位置: $PROJ_ENV_DIR
若想手动进入: source "$PROJ_ENV_DIR/bin/activate"
------------------------------------------------------------
EOF
