#!/usr/bin/env python3
"""环境体检：确认 manim / ffmpeg 可用，报告 LaTeX 是否可用。

用法:
    python3 check_env.py

退出码 0 = 视频渲染所需的核心组件齐全（manim + ffmpeg）。
LaTeX 不是硬性要求；缺它时改用 Text 写公式即可。
"""
import os
import shutil
import sys

# 若存在 setup_manim.sh 创建的 venv，且当前不是用它在跑，则自动切换到 venv 的解释器，
# 这样 import manim 才能命中安装位置（否则系统 python 会误报“未装 manim”）。
_VENV = os.environ.get("MANIM_VENV", os.path.expanduser("~/.cache/manim-explainer-venv"))
_VENV_PY = os.path.join(_VENV, "bin", "python")
if (
    os.path.exists(_VENV_PY)
    and os.path.realpath(sys.executable) != os.path.realpath(_VENV_PY)
    and os.environ.get("_MANIM_CHECK_REEXEC") != "1"
):
    os.environ["_MANIM_CHECK_REEXEC"] = "1"
    os.execv(_VENV_PY, [_VENV_PY, os.path.abspath(__file__)])

GREEN, RED, YEL, RST = "\033[1;32m", "\033[1;31m", "\033[1;33m", "\033[0m"


def line(tag_color, tag, msg):
    print(f"{tag_color}[{tag}]{RST} {msg}")


def main() -> int:
    core_ok = True

    # manim
    try:
        import manim  # noqa
        line(GREEN, " ok ", f"manim {manim.__version__}")
    except Exception as e:  # noqa
        core_ok = False
        line(RED, "FAIL", f"无法导入 manim: {e}")
        line(YEL, "fix ", "运行 setup_manim.sh，或在已激活的环境里 pip install manim")

    # ffmpeg
    if shutil.which("ffmpeg"):
        line(GREEN, " ok ", "ffmpeg 已安装")
    else:
        core_ok = False
        line(RED, "FAIL", "未找到 ffmpeg（合成视频必需）")
        line(YEL, "fix ", "mac: brew install ffmpeg ; linux: apt-get install ffmpeg")

    # LaTeX（可选）
    if shutil.which("latex"):
        line(GREEN, " ok ", "LaTeX 可用 → 可以使用 MathTex / Tex")
    else:
        line(YEL, "warn", "未找到 LaTeX（可选）→ 公式请用 Text + Unicode（见 manim-guide）")

    # 中文字体提示（仅 macOS 常见字体探测，非强制）
    print()
    print("中文字体提示：Text 显示中文需指定支持中文的字体，例如 mac 上 font=\"PingFang SC\"。")

    print()
    if core_ok:
        line(GREEN, "PASS", "核心环境就绪，可以开始渲染视频。")
        return 0
    line(RED, "STOP", "核心环境不完整，先修复上面的 FAIL 再继续。")
    return 1


if __name__ == "__main__":
    sys.exit(main())
