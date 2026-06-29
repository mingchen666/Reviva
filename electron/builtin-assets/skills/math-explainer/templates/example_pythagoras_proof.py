"""黄金范例：用「重排/面积法」真正证明勾股定理 —— 让画面本身就是推理过程。

这是给其他模型看的标杆：好的数学讲解视频，必须让观众仅凭画面就能看懂
「为什么 a²+b²=c²」，而不是只把结论和漂亮图形摆出来。

证明思路（重排法，无需 LaTeX）：
  两个一模一样的大正方形（边长都是 a+b，面积相等）。
  各自塞进 4 个完全相同的直角三角形：
    左边的放法 → 空出两个正方形 a² 和 b²
    右边的放法 → 空出一个正方形 c²
  大正方形相等、扣掉的三角形相等 ⇒ 剩下的面积相等 ⇒ a²+b²=c²

渲染：
  bash .cursor/skills/math-explainer/scripts/render.sh <这个文件> PythagorasProof s
  bash .cursor/skills/math-explainer/scripts/render.sh <这个文件> PythagorasProof m
"""
from manim import *
import numpy as np

ZH = "PingFang SC"

A, B = 1.6, 2.4          # 两条直角边（取不同值，便于看出 a²、b² 不同）
L = A + B                # 大正方形边长 = a + b
SQ = 3.2                 # 大正方形在画面里的边长（manim 单位）
U = SQ / L               # 数学坐标 -> 画面单位 的缩放系数

# 两个大正方形的中心
cL = np.array([-3.2, -0.3, 0.0])
cR = np.array([3.2, -0.3, 0.0])
oL = cL + LEFT * SQ / 2 + DOWN * SQ / 2   # 左方形左下角
oR = cR + LEFT * SQ / 2 + DOWN * SQ / 2   # 右方形左下角


def P(x, y, origin):
    """把 [0,L]×[0,L] 里的点映射到以 origin 为左下角的画面坐标。"""
    return origin + RIGHT * (x * U) + UP * (y * U)


class PythagorasProof(Scene):
    def construct(self):
        self.cap = None
        self.intro()
        self.build_two_squares()
        self.fill_left()
        self.fill_right()
        self.compare_and_conclude()

    # ---- 字幕管理：底部一句话，随镜头替换 ----
    def say(self, text, wait=2.0):
        new = Text(text, font=ZH).scale(0.5)
        if new.width > 12.6:
            new.scale_to_fit_width(12.6)
        new.to_edge(DOWN, buff=0.35)
        if self.cap is None:
            self.play(FadeIn(new, shift=UP * 0.2))
        else:
            self.play(FadeOut(self.cap, shift=UP * 0.2), FadeIn(new, shift=UP * 0.2))
        self.cap = new
        self.wait(wait)

    # ====== 提出问题：先把 a、b、c 说清楚 ======
    def intro(self):
        title = Text("勾股定理：为什么 a² + b² = c²", font=ZH, weight=BOLD).scale(0.7).to_edge(UP)
        self.play(Write(title))
        self.title = title

        p0 = np.array([-1.1, -0.5, 0]); p1 = np.array([1.3, -0.5, 0]); p2 = np.array([-1.1, 1.3, 0])
        tri = Polygon(p0, p1, p2, color=WHITE).set_fill(BLUE, 0.35)
        ra = RightAngle(Line(p0, p2), Line(p0, p1), length=0.3, color=YELLOW)
        la = Text("a", font=ZH).scale(0.6).next_to(Line(p0, p2), LEFT, buff=0.15)
        lb = Text("b", font=ZH).scale(0.6).next_to(Line(p0, p1), DOWN, buff=0.15)
        lc = Text("c", font=ZH).scale(0.6).next_to(Line(p1, p2).get_center(), UR, buff=0.05)
        self.play(Create(tri), Create(ra))
        self.play(Write(la), Write(lb), Write(lc))
        self.say("一个直角三角形：两条直角边 a、b，斜边 c。我们要弄清它们为什么满足 a²+b²=c²。", 2.4)
        self.play(FadeOut(VGroup(tri, ra, la, lb, lc)))

    # ====== 第一步：两个相等的大正方形 ======
    def build_two_squares(self):
        self.outerL = Polygon(P(0, 0, oL), P(L, 0, oL), P(L, L, oL), P(0, L, oL),
                              color=WHITE, stroke_width=3)
        self.outerR = Polygon(P(0, 0, oR), P(L, 0, oR), P(L, L, oR), P(0, L, oR),
                              color=WHITE, stroke_width=3)
        labL = Text("边长 a+b", font=ZH).scale(0.4).next_to(self.outerL, DOWN, buff=0.15)
        labR = Text("边长 a+b", font=ZH).scale(0.4).next_to(self.outerR, DOWN, buff=0.15)
        self.play(Create(self.outerL), Create(self.outerR))
        self.play(Write(labL), Write(labR))
        self.side_labels = VGroup(labL, labR)
        self.say("先画两个一模一样的大正方形，边长都是 a+b —— 它们面积相等。", 2.2)

    # ====== 第二步：左边放法 → 空出 a² 和 b² ======
    def fill_left(self):
        triA = VGroup(
            Polygon(P(B, 0, oL), P(L, 0, oL), P(L, B, oL)),
            Polygon(P(B, 0, oL), P(L, B, oL), P(B, B, oL)),
            Polygon(P(0, B, oL), P(B, B, oL), P(0, L, oL)),
            Polygon(P(B, B, oL), P(B, L, oL), P(0, L, oL)),
        ).set_fill(BLUE, 0.6).set_stroke(WHITE, 1.5)
        self.play(LaggedStart(*[GrowFromCenter(t) for t in triA], lag_ratio=0.25))

        self.sq_b = Polygon(P(0, 0, oL), P(B, 0, oL), P(B, B, oL), P(0, B, oL)).set_fill(ORANGE, 0.6).set_stroke(WHITE, 2)
        self.sq_a = Polygon(P(B, B, oL), P(L, B, oL), P(L, L, oL), P(B, L, oL)).set_fill(GREEN, 0.6).set_stroke(WHITE, 2)
        lab_b = Text("b²", font=ZH).scale(0.6).move_to(P(B / 2, B / 2, oL))
        lab_a = Text("a²", font=ZH).scale(0.55).move_to(P((B + L) / 2, (B + L) / 2, oL))
        self.play(FadeIn(self.sq_b), FadeIn(self.sq_a))
        self.play(Write(lab_b), Write(lab_a))
        self.say("左边塞进 4 个直角三角形，剩下两块正方形：面积是 a² 和 b²。", 2.4)
        self.leftover_a_b = VGroup(self.sq_a, self.sq_b, lab_a, lab_b)

    # ====== 第三步：右边放法（同样 4 个三角形）→ 空出 c² ======
    def fill_right(self):
        triB = VGroup(
            Polygon(P(0, 0, oR), P(B, 0, oR), P(0, A, oR)),
            Polygon(P(L, 0, oR), P(L, B, oR), P(B, 0, oR)),
            Polygon(P(L, L, oR), P(A, L, oR), P(L, B, oR)),
            Polygon(P(0, L, oR), P(0, A, oR), P(A, L, oR)),
        ).set_fill(BLUE, 0.6).set_stroke(WHITE, 1.5)
        self.play(LaggedStart(*[GrowFromCenter(t) for t in triB], lag_ratio=0.25))

        self.sq_c = Polygon(P(B, 0, oR), P(L, B, oR), P(A, L, oR), P(0, A, oR)).set_fill(YELLOW, 0.55).set_stroke(WHITE, 2)
        lab_c = Text("c²", font=ZH).scale(0.7).move_to(P(L / 2, L / 2, oR))
        self.play(FadeIn(self.sq_c))
        self.play(Write(lab_c))
        self.say("同样的 4 个三角形，换个放法，右边只剩一块正方形：面积是 c²（它的边正好是斜边 c）。", 2.6)
        self.leftover_c = VGroup(self.sq_c, lab_c)

    # ====== 第四步：比较 → 得出结论（推理的关键，不能省） ======
    def compare_and_conclude(self):
        self.say("关键一步：两个大正方形一样大，各自扣掉的 4 个三角形也完全相同。", 2.6)
        self.play(Indicate(self.leftover_a_b, color=WHITE, scale_factor=1.08),
                  Indicate(self.leftover_c, color=WHITE, scale_factor=1.08), run_time=2)
        self.say("那么剩下的面积必然相等 —— 左边的 a²+b²，就等于右边的 c²。", 2.6)

        keep = {self.title}
        self.play(*[FadeOut(m) for m in self.mobjects if m not in keep])
        self.cap = None

        steps = VGroup(
            Text("① 两个大正方形面积相等（边长都是 a+b）", font=ZH),
            Text("② 各扣掉 4 个完全相同的直角三角形", font=ZH),
            Text("③ 剩下的面积相等：a² + b² = c²", font=ZH),
        ).scale(0.55).arrange(DOWN, aligned_edge=LEFT, buff=0.45)
        self.play(LaggedStart(*[FadeIn(s, shift=RIGHT * 0.3) for s in steps], lag_ratio=0.5))
        self.wait(1.5)

        conclusion = Text("a² + b² = c²", font=ZH, weight=BOLD).scale(1.4).set_color(YELLOW)
        conclusion.next_to(steps, DOWN, buff=0.6)
        box = SurroundingRectangle(conclusion, color=YELLOW, buff=0.25)
        self.play(Write(conclusion), Create(box))
        self.wait(2)
