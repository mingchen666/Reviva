#!/usr/bin/env python3
"""check_web.py —— 交互网页的无视觉自动检查（防静默故障）。

网页最容易“看不出来”的坑（不看图也能查）：
  - 用了 $...$ 公式，却漏装 KaTeX / 没调用 renderMathInElement → 公式不渲染
  - $ / $$ 不配对 → 公式不渲染
  - getElementById('x') 引用了 HTML 里不存在的 id（拼写错）→ 静默 null 报错
  - <input type=range> 滑块没绑 input 事件 / 没触发 draw → 拖了没反应
  - <canvas> 缺失或没 getContext / 没定义或没调用 draw()
  - 布局没按规范（单列 .wrap + 交互 .stage 在讲解 .explain 前 + 交互区限宽）
  - 内联 JS 有语法错（若装了 node，会用 `node --check` 查出来）

用法:
    python3 check_web.py <index.html>
退出码 0 = 无 FAIL（可能有 WARN 建议）；非 0 = 有会导致功能失效的问题。

纯标准库；若系统有 node，额外做 JS 语法检查。
"""
import os
import re
import shutil
import subprocess
import sys
import tempfile

GREEN, RED, YEL, RST = "\033[1;32m", "\033[1;31m", "\033[1;33m", "\033[0m"


def strip_blocks(html):
    """去掉 <script>/<style> 内容，得到“可见 HTML”，用于数公式 $ 的配对（避免 JS 的 ${} 干扰）。"""
    s = re.sub(r"<script\b[^>]*>.*?</script>", " ", html, flags=re.S | re.I)
    s = re.sub(r"<style\b[^>]*>.*?</style>", " ", s, flags=re.S | re.I)
    return s


def inline_scripts(html):
    """提取所有内联 <script>（不含 src= 的 CDN 引用）的 JS 文本。"""
    out = []
    for m in re.finditer(r"<script\b([^>]*)>(.*?)</script>", html, flags=re.S | re.I):
        attrs, body = m.group(1), m.group(2)
        if "src=" not in attrs.lower():
            out.append(body)
    return "\n".join(out)


def main():
    if len(sys.argv) < 2:
        print("用法: python3 check_web.py <index.html>")
        return 2
    path = sys.argv[1]
    html = open(path, encoding="utf-8").read()
    visible = strip_blocks(html)
    js = inline_scripts(html)

    fails, warns, oks = [], [], []

    # ---------- 公式（KaTeX）----------
    dd = visible.count("$$")
    single = visible.replace("$$", "").count("$")
    uses_math = dd > 0 or single > 0
    if uses_math:
        if dd % 2 != 0:
            fails.append(f"$$ 块级公式不配对（出现 {dd} 个 $$，应为偶数）→ 公式不会渲染")
        if single % 2 != 0:
            fails.append(f"$ 行内公式不配对（去掉 $$ 后还有 {single} 个 $，应为偶数）→ 检查是否漏写 $")
        has_css = "katex.min.css" in html
        has_js = "katex.min.js" in html
        has_auto = "auto-render" in html
        has_call = "renderMathInElement" in js or "renderMathInElement" in html
        if not has_css:
            fails.append("用了 $ 公式但未引入 katex.min.css → 公式不渲染")
        if not has_js:
            fails.append("用了 $ 公式但未引入 katex.min.js → 公式不渲染")
        if not has_auto:
            fails.append("用了 $ 公式但未引入 KaTeX auto-render（contrib/auto-render.min.js）")
        if not has_call:
            fails.append("引入了 KaTeX 但未调用 renderMathInElement(...) → 公式不渲染")
        if not fails:
            oks.append(f"KaTeX 公式：$ 配对正常、CDN 齐全、已调用 renderMathInElement")

    # ---------- id 引用一致性 ----------
    ids = set(re.findall(r'\bid\s*=\s*["\']([^"\']+)["\']', html))
    refs = set(re.findall(r'getElementById\(\s*["\']([^"\']+)["\']\s*\)', js))
    refs |= set(re.findall(r'querySelector(?:All)?\(\s*["\']#([\w\-]+)', js))
    missing = sorted(r for r in refs if r not in ids)
    if missing:
        fails.append(f"JS 引用了不存在的 id：{missing}（getElementById 会得到 null → 报错）。HTML 里的 id 有：{sorted(ids)}")
    elif refs:
        oks.append(f"id 引用一致（{len(refs)} 个引用都有对应元素）")

    # 引用的 class 是否存在（拼写检查，WARN）
    cls_refs = set(re.findall(r'querySelector(?:All)?\(\s*["\']\.([\w\-]+)', js))
    cls_have = set(re.findall(r'class\s*=\s*["\']([^"\']+)["\']', html))
    cls_have = {c for group in cls_have for c in group.split()}
    cls_missing = sorted(c for c in cls_refs if c not in cls_have)
    if cls_missing:
        warns.append(f"JS 用 querySelector 引用了 HTML 里没有的 class：{cls_missing}（可能拼写错）")

    # ---------- canvas + draw ----------
    has_canvas = bool(re.search(r"<canvas\b", html, re.I))
    uses_ctx = "getContext(" in js
    if uses_ctx and not has_canvas:
        fails.append("JS 调用了 getContext 但 HTML 没有 <canvas> 元素")
    if has_canvas:
        draw_defined = bool(re.search(r"function\s+draw\b", js) or re.search(r"\bdraw\s*=\s*(function|\()", js))
        draw_called = bool(re.search(r"\bdraw\s*\(\s*\)", js))
        if not draw_defined:
            warns.append("没找到 draw() 的定义（若你用了别的绘制函数名可忽略）")
        if draw_defined and not draw_called:
            warns.append("draw() 似乎从未被调用（应在 load/resize/控件变化时调用）")
        if not uses_ctx:
            warns.append("有 <canvas> 但 JS 未 getContext，画布可能是空的")
        if draw_defined and draw_called and uses_ctx:
            oks.append("canvas 绘制链路完整（getContext + 定义并调用 draw）")
        # 高清/自适应
        if "addEventListener('resize'" not in js and 'addEventListener("resize"' not in js:
            warns.append("未监听 resize：窗口缩放后画布可能模糊或不自适应（建议加 resize 重绘）")

    # ---------- 控件交互 ----------
    n_range = len(re.findall(r'type\s*=\s*["\']range["\']', html))
    n_buttons = len(re.findall(r"<button\b", html, re.I))
    has_input_listener = bool(re.search(r"""addEventListener\(\s*['"]input['"]""", js))
    has_click_listener = bool(re.search(r"""addEventListener\(\s*['"]click['"]""", js))
    if n_range > 0 and not has_input_listener:
        fails.append(f"有 {n_range} 个滑块(range)，但没有任何 input 事件监听 → 拖动滑块不会有反应")
    if n_buttons > 0 and not has_click_listener:
        warns.append(f"有 {n_buttons} 个按钮，但没有 click 事件监听（若按钮仅装饰可忽略）")
    if n_range + n_buttons == 0:
        warns.append("没有发现任何滑块/按钮 —— 交互网页至少要有 1 个真正影响图形的交互控件")
    elif (n_range and has_input_listener) or (n_buttons and has_click_listener):
        oks.append(f"交互控件已绑定事件（range={n_range}, button={n_buttons}）")

    # ---------- 布局规范（单列居中 + 先交互后讲解）----------
    body = re.search(r"<body\b[^>]*>(.*)</body>", html, flags=re.S | re.I)
    body_txt = body.group(1) if body else html
    has_wrap = bool(re.search(r'class\s*=\s*["\'][^"\']*\bwrap\b', body_txt))
    pos_stage = body_txt.find('class="stage"')
    if pos_stage < 0:
        pos_stage = re.search(r'class\s*=\s*["\'][^"\']*\bstage\b', body_txt)
        pos_stage = pos_stage.start() if pos_stage else -1
    pos_explain = body_txt.find('class="explain"')
    if pos_explain < 0:
        m = re.search(r'class\s*=\s*["\'][^"\']*\bexplain\b', body_txt)
        pos_explain = m.start() if m else -1
    if not has_wrap:
        warns.append("没找到 .wrap 居中容器（布局规范：单列居中，见 interactive-web-guide §4）")
    if pos_stage >= 0 and pos_explain >= 0 and pos_stage > pos_explain:
        warns.append("交互区 .stage 出现在讲解 .explain 之后 → 不是“先交互后讲解”，请调整顺序")
    # 交互区限宽（尺寸偏小）
    if re.search(r"\.stage\b[^{]*\{[^}]*max-width", html) or re.search(r"canvas\b[^{]*\{[^}]*max-width", html):
        oks.append("交互区有 max-width 限宽（尺寸适中、不铺满）")
    else:
        warns.append("交互区 .stage/canvas 未设 max-width，可能铺满整页（建议限到 ~420–560px 居中）")

    # ---------- 可选：node 做 JS 语法检查 ----------
    if shutil.which("node") and js.strip():
        try:
            with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False, encoding="utf-8") as f:
                f.write(js); tmp = f.name
            r = subprocess.run(["node", "--check", tmp], capture_output=True, text=True)
            os.unlink(tmp)
            if r.returncode != 0:
                fails.append("内联 JS 有语法错误（node --check）：\n    " + (r.stderr.strip().splitlines() or [""])[0])
            else:
                oks.append("内联 JS 语法检查通过（node --check）")
        except Exception:
            pass
    else:
        warns.append("未做 JS 语法检查（系统无 node）。建议安装 node 以便 `node --check` 抓语法错。")

    # ---------- 汇总 ----------
    for o in oks:
        print(f"{GREEN}[ ok ]{RST} {o}")
    for w in warns:
        print(f"{YEL}[warn]{RST} {w}")
    for fL in fails:
        print(f"{RED}[FAIL]{RST} {fL}")
    print()
    if fails:
        print(f"{RED}[FAIL]{RST} 共 {len(fails)} 个会导致功能失效的问题，修复后重查。")
        return 1
    print(f"{GREEN}[PASS]{RST} 无致命问题" + (f"（{len(warns)} 条建议可酌情优化）" if warns else "。"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
