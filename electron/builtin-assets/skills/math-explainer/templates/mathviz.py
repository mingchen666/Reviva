"""mathviz.py —— 数学讲解视频的公用护栏 + 生动化工具（给没有视觉能力的模型用）。

两类能力：
  A) 机械布局护栏（防出界/重叠/方框）+ 自动布局检查（日志打印 [layout] WARN）；
  B) 生动化（让画面不“干巴巴”）：深色蓝底 + 渐变标题 + 辉光 + 强调动画 + 带底衬且上移的字幕，
     并提供 with_glow()/emphasize()/pop() 等助手——按 manim-guide §3.6 的清单机械地用即可。

用法：把本文件和 scene.py 放同一目录，scene 继承 SafeScene：
    from mathviz import SafeScene, fit_content, frow, with_glow, ZH, C_MAIN, C_ACCENT, C_OK, C_SUB
    class MyScene(SafeScene):
        def construct(self):
            self.add_backdrop()                 # 深色蓝底 + 角落柔光（生动）
            self.title_bar("标题")              # 渐变标题 + 强调下划线
            body = VGroup(...).arrange(DOWN); fit_content(body)
            self.play(GrowFromCenter(body))     # 用有动感的入场
            self.emphasize(body[0])             # 关键处来一下强调
            self.caption("一句旁白")            # 带底衬、已上移的字幕
            self.clear_screen()
"""
import sys
import numpy as np
from manim import *

ZH = "PingFang SC"

# ---- 丰富配色（十六进制，比默认命名色更通透）----
C_BG = "#0b1020"        # 深蓝底（替代纯黑，立刻不“干”）
C_MAIN = "#5b9cff"      # 主色 蓝
C_ACCENT = "#ffd166"    # 强调 金
C_OK = "#3ddc97"        # 正向 绿
C_SUB = "#2dd4bf"       # 辅助 青
C_WARM = "#ff7a5c"      # 暖 珊瑚
C_PURP = "#b794f6"      # 紫
C_GREY = "#9aa4b2"
GRAD_TITLE = [C_MAIN, C_SUB]      # 标题渐变
GRAD_COOL = [C_SUB, C_MAIN]
GRAD_WARM = [C_ACCENT, C_WARM]
PALETTE = [C_MAIN, C_SUB, C_OK, C_ACCENT, C_WARM, C_PURP]

# ---- 安全区（frame 宽≈14.22, 高=8）----
SAFE_X, SAFE_Y = 6.8, 3.8
CONTENT_MAX_W, CONTENT_MAX_H = 12.6, 5.0   # 略缩内容高，给上移后的字幕让位


def fit_content(mobj, max_w=CONTENT_MAX_W, max_h=CONTENT_MAX_H):
    """把内容缩放进内容区——防出界的核心，建议每段内容都调一次。"""
    if mobj.width > max_w:
        mobj.scale_to_fit_width(max_w)
    if mobj.height > max_h:
        mobj.scale_to_fit_height(max_h)
    return mobj


def frow(spec, scale=0.8, color=WHITE, font=ZH):
    """拼带下标的公式（中文字体没有下标字母 ₙ 的字形会变方框，故用 VGroup 拼）。
    spec 元素：字符串=正常字；("a","n")=带下标。例：frow([("S","n")," = …"])"""
    parts = []
    for it in spec:
        if isinstance(it, tuple):
            b = Text(it[0], font=font).scale(scale)
            s = Text(it[1], font=font).scale(scale * 0.6)
            s.next_to(b, RIGHT, buff=0.03).align_to(b, DOWN).shift(DOWN * scale * 0.12)
            parts.append(VGroup(b, s))
        else:
            parts.append(Text(it, font=font).scale(scale))
    return VGroup(*parts).arrange(RIGHT, buff=0.12).set_color(color)


def with_glow(mobj, color=None, width=18, opacity=0.18):
    """给线条/形状加柔和辉光：在其后叠一份加粗、半透明的副本。返回 VGroup(辉光, 原件)。

    ⚠️ 防残留：辉光是 mobj 的一个【副本】。**用返回的整组**，不要让主体和辉光分离。
       - 在 always_redraw(lambda: with_glow(g)) 里用：安全（每帧重建）。
       - 静态用且之后要转场：把整组编进你的 VGroup 一起 move/FadeOut，或转场用 clear_screen()。
       反例：self.add(with_glow(box)) 后只移动/淡出 box → 辉光副本会留在原地变成“残留方框”。"""
    glow = mobj.copy().set_stroke(color or mobj.get_color(), width=width, opacity=opacity)
    glow.set_fill(opacity=0)
    return VGroup(glow, mobj)


def _ignore(m):
    return getattr(m, "_mv_ignore", False)


def _has_size(m):
    try:
        return len(m.family_members_with_points()) > 0
    except Exception:
        return False


def _bbox(m):
    return (m.get_left()[0], m.get_right()[0], m.get_bottom()[1], m.get_top()[1])


def _area(m):
    l, r, b, t = _bbox(m)
    return max(0.0, r - l) * max(0.0, t - b)


def _overlap(a, b):
    al, ar, ab, at = _bbox(a); bl, br, bb, bt = _bbox(b)
    return max(0.0, min(ar, br) - max(al, bl)) * max(0.0, min(at, bt) - max(ab, bb))


def _desc(m):
    return f"Text('{m.text[:14]}')" if getattr(m, "text", None) else type(m).__name__


class SafeScene(Scene):
    ZH = ZH

    def setup(self):
        # 默认深蓝底（比纯黑更耐看、不“干”）
        try:
            self.camera.background_color = C_BG
        except Exception:
            pass
        self._title = None
        self._cap = None
        self._warn_total = 0

    # ---------- 生动化：背景 ----------
    def add_backdrop(self):
        """深色背景 + 两团角落柔光（低透明度大圆），增加色彩层次。装饰元素不参与布局检查。"""
        blobs = VGroup(
            Circle(radius=5).set_fill(C_MAIN, 0.06).set_stroke(width=0).move_to([-5, 3, 0]),
            Circle(radius=5).set_fill(C_PURP, 0.05).set_stroke(width=0).move_to([5.5, -3, 0]),
            Circle(radius=4).set_fill(C_SUB, 0.05).set_stroke(width=0).move_to([5, 3.5, 0]),
        )
        for b in blobs:
            b._mv_ignore = True
        blobs._mv_ignore = True
        self.add(blobs)
        return blobs

    # ---------- 布局助手 ----------
    def title_bar(self, text, scale=0.72):
        t = Text(text, font=self.ZH, weight=BOLD).scale(scale)
        if t.width > CONTENT_MAX_W:
            t.scale_to_fit_width(CONTENT_MAX_W)
        t.set_color_by_gradient(*GRAD_TITLE)
        underline = Line(t.get_left(), t.get_right(), stroke_width=3).set_color(C_ACCENT)
        underline.next_to(t, DOWN, buff=0.12).set_opacity(0.9)
        grp = VGroup(t, underline).to_edge(UP, buff=0.35)
        if self._title is None:
            self.play(Write(t), GrowFromCenter(underline)); self._title = grp
        else:
            self.play(Transform(self._title, grp))
        return self._title

    def caption(self, text, scale=0.5, wait=2.0, color=None):
        """带底衬、已上移的字幕（lower-third 风格）。"""
        txt = Text(text, font=self.ZH).scale(scale)
        if txt.width > CONTENT_MAX_W - 0.8:
            txt.scale_to_fit_width(CONTENT_MAX_W - 0.8)
        bar = RoundedRectangle(width=txt.width + 0.8, height=txt.height + 0.4,
                               corner_radius=0.14, stroke_width=0).set_fill("#0e1828", 0.72)
        txt.move_to(bar)
        accent = RoundedRectangle(width=0.09, height=txt.height + 0.18, corner_radius=0.04,
                                  stroke_width=0).set_fill(color or C_ACCENT, 1.0)
        accent.move_to(bar.get_left()).shift(RIGHT * 0.18)
        grp = VGroup(bar, accent, txt).to_edge(DOWN, buff=0.6)   # ← 字幕上移
        if self._cap is None:
            self.play(FadeIn(grp, shift=UP * 0.25))
        else:
            self.play(FadeOut(self._cap, shift=UP * 0.2), FadeIn(grp, shift=UP * 0.25))
        self._cap = grp
        self.wait(wait)
        return grp

    def clear_screen(self, *keep):
        keep = set(keep) | ({self._title} if self._title is not None else set())
        trash = [m for m in self.mobjects if m not in keep and not _ignore(m)]
        if trash:
            self.play(*[FadeOut(m) for m in trash])
        if self._cap not in keep:
            self._cap = None

    # ---------- 生动化：强调动画 ----------
    def emphasize(self, m, color=None, scale_factor=1.15):
        self.play(Indicate(m, color=color or C_ACCENT, scale_factor=scale_factor))

    def flash_on(self, m, color=None):
        self.play(Circumscribe(m, color=color or C_ACCENT))

    # ---------- 自动布局检查（文字反馈，无需视觉）----------
    def wait(self, *args, **kwargs):
        super().wait(*args, **kwargs)
        self.layout_check()

    def checkpoint(self, label="checkpoint"):
        self.layout_check(label)

    def layout_check(self, label="wait"):
        problems = []
        tops = [m for m in self.mobjects if not _ignore(m) and _has_size(m) and _area(m) > 1e-4]
        for m in tops:
            l, r, b, t = _bbox(m)
            if r > SAFE_X or l < -SAFE_X or t > SAFE_Y or b < -SAFE_Y:
                problems.append(
                    f"出界: {_desc(m)} x[{l:.1f},{r:.1f}] y[{b:.1f},{t:.1f}]"
                    f"（安全区 |x|<={SAFE_X} |y|<={SAFE_Y}）→ fit_content() 或 .to_edge()")
        texts = []
        for m in self.mobjects:
            if _ignore(m):
                continue
            for sub in m.get_family():
                if isinstance(sub, (Text, MarkupText)) and _has_size(sub) and _area(sub) >= 0.4:
                    texts.append(sub)
        for i in range(len(texts)):
            for j in range(i + 1, len(texts)):
                mn = min(_area(texts[i]), _area(texts[j]))
                if mn > 0 and _overlap(texts[i], texts[j]) > 0.6 * mn:
                    problems.append(f"文字重叠: {_desc(texts[i])} 与 {_desc(texts[j])} → clear_screen()/.arrange()")
        if problems:
            self._warn_total += len(problems)
            for p in problems:
                print(f"[layout][{label}] WARN {p}", file=sys.stderr)

    def tear_down(self, *a, **k):
        print(f"[layout] DONE 共发现 {self._warn_total} 处布局问题"
              + ("（请修复后重渲）" if self._warn_total else "（无问题）"), file=sys.stderr)
        try:
            super().tear_down(*a, **k)
        except Exception:
            pass
