#!/usr/bin/env python3
"""check_text.py —— 字体字形检查（防方框 □，无需视觉能力）。

很多字体（尤其中文字体）缺少某些字符的字形，渲染出来是方框。最常见：
下标字母 ₙ(U+2099)、ₖ、ᵢ 等在 PingFang SC 里没有 → aₙ/Sₙ 变成 a□/S□
（但下标数字 ₁₂₅ 是有的，所以 a₁/a₅ 没问题）。

本脚本静态扫描 scene.py 里所有 Text(...) / frow(...) 用到的字符串，
按 scene 实际使用的字体（自动检测 font= / ZH 变量，再用 fc-match 解析到 manim
真正会用的字体文件）逐字符检查字形，把缺失的字符以文字列出来——你读输出就知道会不会出方框。

用法:
    python3 check_text.py <scene.py> [字体名或字体文件路径]
不传第二个参数时：自动从 scene 检测字体名（默认 PingFang SC），用 fc-match 解析文件。

依赖 fontTools（setup_manim.sh 会装）。
"""
import ast
import os
import shutil
import subprocess
import sys
from collections import Counter

GREEN, RED, YEL, RST = "\033[1;32m", "\033[1;31m", "\033[1;33m", "\033[0m"

FONT_CANDIDATES = [
    "/System/Library/Fonts/STHeiti Medium.ttc",
    "/System/Library/Fonts/Hiragino Sans GB.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
]


def collect_strings(tree):
    out = []

    def add(s):
        if isinstance(s, str) and s.strip():
            out.append(s)

    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        fn = node.func.id if isinstance(node.func, ast.Name) else getattr(node.func, "attr", "")
        if fn in ("Text", "MarkupText") and node.args:
            if isinstance(node.args[0], ast.Constant):
                add(node.args[0].value)
        elif fn == "frow" and node.args and isinstance(node.args[0], (ast.List, ast.Tuple)):
            for el in node.args[0].elts:
                if isinstance(el, ast.Constant):
                    add(el.value)
                elif isinstance(el, ast.Tuple):
                    for e in el.elts:
                        if isinstance(e, ast.Constant):
                            add(e.value)
    return out


def detect_font_name(tree, default="PingFang SC"):
    names = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            for kw in node.keywords:
                if kw.arg == "font" and isinstance(kw.value, ast.Constant) and isinstance(kw.value.value, str):
                    names.append(kw.value.value)
        if isinstance(node, ast.Assign) and isinstance(node.value, ast.Constant) and isinstance(node.value.value, str):
            for tgt in node.targets:
                if isinstance(tgt, ast.Name) and tgt.id in ("ZH", "ZH_FONT", "FONT"):
                    names.append(node.value.value)
    return Counter(names).most_common(1)[0][0] if names else default


def resolve_font_file(name_or_path):
    # 直接给了存在的文件路径
    if os.path.exists(name_or_path) and os.path.isfile(name_or_path):
        return name_or_path, name_or_path
    # fc-match（与 manim/Pango 的解析最接近）
    if shutil.which("fc-match"):
        try:
            f = subprocess.check_output(["fc-match", "-f", "%{file}", name_or_path], text=True).strip()
            fam = subprocess.check_output(["fc-match", "-f", "%{family}", name_or_path], text=True).strip()
            if f and os.path.exists(f):
                return f, fam
        except Exception:
            pass
    # matplotlib
    try:
        from matplotlib import font_manager
        f = font_manager.findfont(name_or_path, fallback_to_default=False)
        if f and os.path.exists(f):
            return f, name_or_path
    except Exception:
        pass
    # 候选
    for p in FONT_CANDIDATES:
        if os.path.exists(p):
            return p, p
    return None, None


def supported_codepoints(font_path):
    from fontTools.ttLib import TTFont, TTCollection
    cps = set()
    fonts = list(TTCollection(font_path).fonts) if font_path.lower().endswith(".ttc") else [TTFont(font_path, fontNumber=0)]
    for f in fonts:
        try:
            for table in f["cmap"].tables:
                cps |= set(table.cmap.keys())
        except Exception:
            pass
    return cps


def main():
    if len(sys.argv) < 2:
        print("用法: python3 check_text.py <scene.py> [字体名或字体文件路径]")
        return 2
    scene = sys.argv[1]
    tree = ast.parse(open(scene, encoding="utf-8").read())

    name = sys.argv[2] if len(sys.argv) > 2 else detect_font_name(tree)
    font_path, fam = resolve_font_file(name)
    if not font_path:
        print(f"{RED}[FAIL]{RST} 找不到字体「{name}」对应的文件，请把字体文件路径作为第二个参数传入。")
        return 2
    try:
        cps = supported_codepoints(font_path)
    except ImportError:
        print(f"{RED}[FAIL]{RST} 需要 fontTools：uv pip install fonttools（或 pip install fonttools）")
        return 2

    strings = collect_strings(tree)
    ignore = set(" \t\n\u200b")
    bad = {}
    for s in strings:
        miss = [c for c in s if ord(c) not in cps and c not in ignore]
        if miss:
            bad[s] = sorted(set(miss))

    print(f"检测字体名: {name}  →  解析文件: {font_path}")
    if fam and fam != font_path:
        print(f"实际字体族: {fam}")
    print(f"扫描到 {len(strings)} 条文本。")
    if not bad:
        print(f"{GREEN}[PASS]{RST} 所有字符都有字形，不会出现方框。")
        return 0
    print(f"{RED}[FAIL]{RST} 以下文本含字体缺失的字符（会渲染成方框 □）：")
    for s, miss in bad.items():
        shown = " ".join(f"'{c}'(U+{ord(c):04X})" for c in miss)
        print(f"  · 文本「{s}」缺字形: {shown}")
    print(f"{YEL}修法{RST}：下标字母(ₙ等) → 改措辞避开 / 用 mathviz.frow() 拼下标 / 装 LaTeX 用 MathTex；"
          "其他缺字符 → 换等价写法或换字体。")
    return 1


if __name__ == "__main__":
    sys.exit(main())
