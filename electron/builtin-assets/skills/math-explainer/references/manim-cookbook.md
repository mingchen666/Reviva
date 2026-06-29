# Manim 配方手册

按主题分类的**可直接复制**的 Scene 片段。用法：找最接近的配方，复制进 `scene.py`，把主题/数值/文案换成你的分镜内容。

约定：
- 公式默认用 `MathTex`（需 LaTeX）。**没装 LaTeX 就把 `MathTex(r"...")` 换成 `Text("...", font=ZH)` 并用 Unicode 写**（见 manim-guide §4）。
- 中文字体统一用变量：每个文件顶部加 `ZH = "PingFang SC"`（mac）。
- 所有片段都假定文件开头有 `from manim import *`。

---

## 0. 通用助手（贴在每个 Scene 类里复用）

```python
ZH = "PingFang SC"

class _Helpers(Scene):
    def title_bar(self, text):
        t = Text(text, font=ZH).scale(0.8).to_edge(UP)
        self.play(Write(t))
        return t

    def clear_screen(self, *keep):
        trash = [m for m in self.mobjects if m not in keep]
        if trash:
            self.play(*[FadeOut(m) for m in trash])
```
（实际用时把这两个方法直接写进你的 Scene，不必继承。）

---

## 1. 封面 / 标题镜头

```python
class Cover(Scene):
    def construct(self):
        ZH = "PingFang SC"
        title = Text("勾股定理", font=ZH, weight=BOLD).scale(1.6)
        subtitle = Text("一个面积证明", font=ZH).scale(0.7).set_color(GREY_B)
        group = VGroup(title, subtitle).arrange(DOWN, buff=0.4)
        self.play(FadeIn(title, shift=UP*0.5))
        self.play(Write(subtitle))
        self.wait(1)
        self.play(group.animate.scale(0.6).to_edge(UP))  # 收到顶部当标题
```

---

## 2. 公式逐步推导（重点：用 TransformMatchingTex 平滑变形）

```python
class Derive(Scene):
    def construct(self):
        eq1 = MathTex("(a+b)^2", "=", "a^2 + 2ab + b^2")
        eq2 = MathTex("a^2 + 2ab + b^2", "=", "c^2 + 2ab")  # 示意
        eq1.scale(1.2)
        self.play(Write(eq1))
        self.wait(1)
        eq2.scale(1.2).move_to(eq1)
        self.play(TransformMatchingTex(eq1, eq2))  # 相同子串平滑移动，新项淡入
        self.wait(1)
```
逐项高亮某部分：`self.play(Indicate(eq1[2]))`（按索引取子公式）。

无 LaTeX 版（线性写）：
```python
ZH = "PingFang SC"
step1 = Text("(a+b)² = a² + 2ab + b²", font=ZH)
step2 = Text("a² + b² = c²", font=ZH)
VGroup(step1, step2).arrange(DOWN, buff=0.6)
self.play(Write(step1)); self.wait(1); self.play(FadeIn(step2, shift=UP*0.3))
```

---

## 3. 几何证明：勾股定理（面积法，最经典）

> ⚠️ 下面只是“在边上画正方形”的展示片段，**本身不构成证明**。真正讲清“为什么”的完整重排/面积法证明见 `templates/example_pythagoras_proof.py`，做证明类视频请以它为准（见 pedagogy §0 红线）。

```python
class PythagorasArea(Scene):
    def construct(self):
        ZH = "PingFang SC"
        title = Text("a² + b² = c²", font=ZH).to_edge(UP)
        self.play(Write(title))

        # 直角三角形
        A, B, C = LEFT*2+DOWN, RIGHT*2+DOWN, LEFT*2+UP
        tri = Polygon(A, B, C, color=WHITE).set_fill(BLUE, 0.3)
        ra = RightAngle(Line(A, C), Line(A, B), length=0.4, color=YELLOW)
        a_lab = Text("a", font=ZH).scale(0.7).next_to(Line(A, C), LEFT)
        b_lab = Text("b", font=ZH).scale(0.7).next_to(Line(A, B), DOWN)
        c_lab = Text("c", font=ZH).scale(0.7).next_to(Line(B, C).get_center(), UR, buff=0.1)
        self.play(Create(tri), Create(ra))
        self.play(*map(Write, [a_lab, b_lab, c_lab]))
        self.wait(1)

        # 在两直角边上各作正方形（用 Square + 定位 + 标注面积）
        sq_a = Square(side_length=3).set_fill(GREEN, 0.3).next_to(Line(A, C), LEFT, buff=0)
        sq_b = Square(side_length=4).set_fill(ORANGE, 0.3).next_to(Line(A, B), DOWN, buff=0)
        self.play(GrowFromCenter(sq_a))
        self.play(Write(Text("a²", font=ZH).scale(0.7).move_to(sq_a)))
        self.play(GrowFromCenter(sq_b))
        self.play(Write(Text("b²", font=ZH).scale(0.7).move_to(sq_b)))
        self.wait(2)
```
> 提示：真正严谨的“拼接证明”需要精确坐标，先用 `s` 静帧反复校准位置，别凭感觉。

---

## 4. 函数图像 + 导数/切线的几何意义

> ⚠️ 下面用了 `include_numbers=True` 和 `get_axis_labels`，**这两者依赖 LaTeX**。无 LaTeX 环境请改用 §11 的无 LaTeX 坐标系写法。

```python
class Tangent(Scene):
    def construct(self):
        ax = Axes(x_range=[-1, 4, 1], y_range=[-1, 9, 2], x_length=8, y_length=5,
                  axis_config={"include_numbers": True}).to_edge(DOWN)
        f = lambda x: x**2
        graph = ax.plot(f, x_range=[-1, 3], color=BLUE)
        self.play(Create(ax), Create(graph))

        x0 = ValueTracker(0.5)
        # 切点 + 切线随 x0 移动
        dot = always_redraw(lambda: Dot(ax.c2p(x0.get_value(), f(x0.get_value())), color=YELLOW))
        def tangent_line():
            x = x0.get_value(); slope = 2*x
            return ax.plot(lambda t: f(x) + slope*(t - x), x_range=[x-1.2, x+1.2], color=RED)
        tan = always_redraw(tangent_line)
        self.add(dot, tan)
        self.play(x0.animate.set_value(2.5), run_time=4, rate_func=smooth)
        self.wait(1)
```

---

## 5. 数列 / 极限逼近（点列趋近水平线）

```python
class LimitApproach(Scene):
    def construct(self):
        ax = Axes(x_range=[0, 10, 1], y_range=[0, 2, 1], x_length=9, y_length=4,
                  axis_config={"include_numbers": True}).to_edge(DOWN)
        target = DashedLine(ax.c2p(0, 1), ax.c2p(10, 1), color=YELLOW)
        self.play(Create(ax), Create(target))
        # a_n = 1 - 1/n
        dots = VGroup(*[Dot(ax.c2p(n, 1 - 1/n), color=BLUE) for n in range(1, 11)])
        self.play(LaggedStart(*[FadeIn(d, scale=0.5) for d in dots], lag_ratio=0.2))
        self.wait(2)
```

---

## 6. 向量加法（平行四边形 / 首尾相接）

```python
class VectorAdd(Scene):
    def construct(self):
        plane = NumberPlane(x_range=[-1, 6], y_range=[-1, 5]).add_coordinates()
        v1 = Arrow(plane.c2p(0, 0), plane.c2p(3, 1), buff=0, color=BLUE)
        v2 = Arrow(plane.c2p(0, 0), plane.c2p(1, 3), buff=0, color=GREEN)
        self.play(Create(plane))
        self.play(GrowArrow(v1), GrowArrow(v2))
        # 平移 v2 到 v1 末端，画合向量
        v2b = Arrow(plane.c2p(3, 1), plane.c2p(4, 4), buff=0, color=GREEN)
        vsum = Arrow(plane.c2p(0, 0), plane.c2p(4, 4), buff=0, color=YELLOW)
        self.play(TransformFromCopy(v2, v2b))
        self.play(GrowArrow(vsum))
        self.wait(1)
```

---

## 7. 概率 / 柱状图

```python
class Bars(Scene):
    def construct(self):
        ZH = "PingFang SC"
        chart = BarChart(values=[3, 7, 5, 9, 4], bar_names=["1", "2", "3", "4", "5"],
                         y_range=[0, 10, 2], x_length=8, y_length=4.5)
        self.play(Create(chart))
        self.play(Write(Text("掷骰子频数", font=ZH).scale(0.7).to_edge(UP)))
        # 动态更新
        self.play(chart.animate.change_bar_values([5, 5, 5, 5, 6]))
        self.wait(1)
```

---

## 8. 数轴 / 区间 / 不等式

```python
class NumberLineDemo(Scene):
    def construct(self):
        nl = NumberLine(x_range=[-5, 5, 1], length=10, include_numbers=True)
        self.play(Create(nl))
        a, b = nl.n2p(-2), nl.n2p(3)   # number→point
        seg = Line(a, b, color=YELLOW, stroke_width=8)
        self.play(Create(seg))
        self.play(FadeIn(Dot(a, color=RED)), FadeIn(Dot(b, color=RED)))
        self.wait(1)
```

---

## 9. 圆与 π（弧长/旋转）

```python
class CirclePi(Scene):
    def construct(self):
        circle = Circle(radius=2, color=BLUE)
        radius = Line(circle.get_center(), circle.point_at_angle(0), color=YELLOW)
        self.play(Create(circle), Create(radius))
        self.play(Rotate(radius, angle=TAU, about_point=circle.get_center()), run_time=3)
        self.wait(1)
```

---

## 10. 收尾 / 总结镜头

```python
class Outro(Scene):
    def construct(self):
        ZH = "PingFang SC"
        points = VGroup(
            Text("• 直角三角形三边满足 a²+b²=c²", font=ZH),
            Text("• 可用面积拼接直观证明", font=ZH),
            Text("• 逆命题可判定直角三角形", font=ZH),
        ).scale(0.6).arrange(DOWN, aligned_edge=LEFT, buff=0.4)
        self.play(LaggedStart(*[FadeIn(p, shift=RIGHT*0.3) for p in points], lag_ratio=0.4))
        self.wait(2)
        self.play(points.animate.set_opacity(0.3))
        thanks = Text("谢谢观看", font=ZH).scale(1.2)
        self.play(FadeIn(thanks, scale=1.2))
        self.wait(2)
```

---

## 11. 无 LaTeX 坐标系 + 动态曲线（参数效应，ValueTracker）

演示“某参数变化时曲线如何变”的标准模式（已在 `videos/parabola_n` 验证）。要点：**坐标数字/轴名/实时数值全用 Text**，曲线只设描边，`always_redraw` 跟随参数重画，并动态裁剪 x 范围防止出框。

```python
ZH = "PingFang SC"

def x_bound(n, head_up=7.4, head_down=5.4):  # 让曲线不冲出坐标系
    if abs(n) < 1e-3:
        return 3.0
    head = head_up if n > 0 else head_down
    return min(3.0, (head / abs(n)) ** 0.5)

class ParamCurve(Scene):
    def construct(self):
        axes = Axes(x_range=[-3,3,1], y_range=[-6,8,2], x_length=7.2, y_length=5.4, tips=False)
        xlab = Text("x", font=ZH).scale(0.5).next_to(axes.x_axis.get_end(), DR, buff=0.12)
        ylab = Text("y", font=ZH).scale(0.5).next_to(axes.y_axis.get_end(), UL, buff=0.12)
        ticks = VGroup(*[Text(str(v), font=ZH).scale(0.35).next_to(axes.c2p(v,0), DOWN, buff=0.12)
                         for v in [-2,-1,1,2]],
                       *[Text(str(v), font=ZH).scale(0.35).next_to(axes.c2p(0,v), LEFT, buff=0.12)
                         for v in [-4,-2,2,4,6]])
        self.play(Create(axes), Write(VGroup(xlab, ylab)), FadeIn(ticks))

        n = ValueTracker(1.0)
        base = axes.plot(lambda x: x*x, x_range=[-x_bound(1), x_bound(1), 0.05])
        base.set_stroke(GREY, width=2.5, opacity=0.6).set_fill(opacity=0)   # 只设描边，避免色块
        graph = always_redraw(lambda: axes.plot(
            lambda x: n.get_value()*x*x,
            x_range=[-x_bound(n.get_value()), x_bound(n.get_value()), 0.05], color=BLUE))
        readout = always_redraw(lambda: Text(f"n = {n.get_value():+.1f}", font=ZH)
                                .scale(0.6).set_color(YELLOW).to_corner(UR))
        self.play(Create(base)); self.add(graph, readout)
        self.play(n.animate.set_value(3.0), run_time=2.5)     # 变陡
        self.play(n.animate.set_value(-1.0), run_time=2.5)    # 翻向下
        self.wait(1)
```

加“机制点”解释为什么（x=1 处 y=n，可视化参数的直接含义）：
```python
dot = always_redraw(lambda: Dot(axes.c2p(1, n.get_value()), color=YELLOW))
vline = always_redraw(lambda: DashedLine(axes.c2p(1,0), axes.c2p(1, n.get_value()), color=YELLOW))
self.add(dot, vline)
```

---

## 组合成一个完整视频

把多个镜头写进**一个** Scene 的 `construct` 里，镜头之间用 `self.clear_screen(保留项)` 过渡。这样旁白连贯、无需拼接。模板 `templates/scene_template.py` 已给出这种结构，按分镜往里填即可。
