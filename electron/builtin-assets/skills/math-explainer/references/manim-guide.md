# Manim 实操指南（Community v0.20+）

写视频前读这份。它聚焦“弱模型最容易写错的地方”。不确定就回来查。

---

## 1. 心智模型（30 秒看懂）

- 一个**视频 = 一个 `Scene` 子类**，动画逻辑全写在 `construct(self)` 里。
- **Mobject**（数学对象）= 屏幕上的东西：`Circle`、`Square`、`Text`、`MathTex`、`Axes`、`Line`…
- **Animation**（动画）= 让 Mobject 动起来的方式：`Create`、`Write`、`FadeIn/Out`、`Transform`…
- 三个核心方法：
  - `self.add(mobj)` 直接放到屏幕（无动画）。
  - `self.play(Anim(...), run_time=2)` 播放动画。
  - `self.wait(t)` 停留 t 秒（**给观众读字幕的时间，别省**）。

最小可运行例子：
```python
from manim import *

class Demo(Scene):
    def construct(self):
        c = Circle(color=BLUE).set_fill(BLUE, opacity=0.5)
        self.play(Create(c))
        self.wait(1)
```
渲染：`bash render.sh demo.py Demo s`（先看图）→ `... Demo m`（出视频）。

---

## 2. 必备 API 速查

**形状**：`Circle, Square, Rectangle, Triangle, RegularPolygon(n), Line(a,b), Arrow(a,b), DoubleArrow, Dot(point), Polygon(*pts), Ellipse, Arc, Angle(l1,l2), RightAngle(l1,l2)`

**文字与公式**：`Text("中文", font="PingFang SC")`、`MathTex(r"a^2+b^2=c^2")`（需 LaTeX）、`Tex(r"...")`（需 LaTeX）、`MarkupText`（富文本）。

**坐标系/图像**：`Axes`, `NumberPlane`, `NumberLine`, `ThreeDAxes`；画函数用 `axes.plot(lambda x: x**2)`。

**组合与排版**：`VGroup(a, b, c)`、`.arrange(DOWN, buff=0.4)`、`Brace(mobj, DOWN)`。

**颜色常量**：`BLUE, RED, GREEN, YELLOW, ORANGE, PURPLE, PINK, TEAL, GOLD, MAROON, WHITE, GREY, BLACK`，还有 `BLUE_A..BLUE_E` 等深浅档。设色：`mobj.set_color(RED)`、`mobj.set_fill(RED, opacity=0.6)`、`mobj.set_stroke(WHITE, width=2)`。

**常用动画**：
- 出现：`Create`（描边类）、`Write`（文字/公式）、`FadeIn`、`GrowFromCenter`、`DrawBorderThenFill`、`SpiralIn`。
- 消失：`FadeOut`、`Uncreate`、`Unwrite`。
- 变换：`Transform(a,b)`（a 变成 b 的形状）、`ReplacementTransform(a,b)`（用 b 替换 a）、`TransformMatchingTex`（公式分项对齐变换）。
- 移动/强调：`mobj.animate.shift(RIGHT)`、`Rotate(mobj, PI/4)`、`Indicate`、`Circumscribe`、`Flash`、`Wiggle`、`FocusOn`。
- 同时播放：`self.play(Create(a), FadeIn(b))`；错峰：`LaggedStart(*anims, lag_ratio=0.2)`。

**`.animate` 语法**：把任意修改方法变成动画。`self.play(sq.animate.shift(UP).set_color(RED))`。注意：旋转 180° 用 `.animate` 会“原地不动”（首末态相同），这种情况改用 `Rotate(sq, PI)`。

---

## 3. 布局与防重叠纪律（最重要，弱模型必看）

画面坐标：中心是原点 `ORIGIN=[0,0,0]`；方向常量 `UP/DOWN/LEFT/RIGHT/UL/UR/DL/DR`。默认画面宽约 14.2、高 8 个单位。`config.frame_width≈14.2, frame_height=8`。

**铁律：**
1. **切换知识点前清屏。** 用助手把不再需要的对象淡出：
```python
def clear_screen(self, *keep):
    trash = [m for m in self.mobjects if m not in keep]
    if trash:
        self.play(*[FadeOut(m) for m in trash])
```
2. **标题固定在顶部**：`title.to_edge(UP)`；正文不要压到标题。
3. **相对定位优于绝对坐标**：`b.next_to(a, RIGHT, buff=0.5)`、`b.to_edge(DOWN)`、`b.move_to(a)`、`group.arrange(DOWN, buff=0.4)`。
4. **多个对象用 `VGroup().arrange()` 自动排开**，别手动堆 `shift`。
5. **怕出界就缩放贴合**：`mobj.scale_to_fit_width(12)`、`scale_to_fit_height(6)`、或 `mobj.scale(0.8)`。整组也行：`VGroup(...).scale(0.7)`。
6. **公式/文字别太长**：超过画面宽就 `.scale()` 或拆成多行 `VGroup`。
7. **每屏渲染静帧自检**（`render.sh ... s`）→ 读图确认没有重叠/出界。这是发现布局问题最快的方法。

排版示例：
```python
title = Text("勾股定理", font="PingFang SC").to_edge(UP)
formula = MathTex(r"a^2 + b^2 = c^2").scale(1.2)
note = Text("直角三角形两直角边平方和等于斜边平方", font="PingFang SC").scale(0.5)
body = VGroup(formula, note).arrange(DOWN, buff=0.5).next_to(title, DOWN, buff=0.8)
self.play(Write(title)); self.play(Write(formula)); self.play(FadeIn(note))
```

---

## 3.5 没有视觉能力？用「约束 + 文字化检查」代替“看图”（重要）

你（执行模型）很可能看不到渲染出来的画面。不要假设自己能“看一眼调整”。靠下面三层保证效果，全程只读**文字**：

**① 机械布局（照做基本不会出错）—— 用 `templates/mathviz.py` 的 `SafeScene`：**
```python
from mathviz import SafeScene, fit_content, frow, ZH
class MyScene(SafeScene):
    def construct(self):
        self.title_bar("标题")                 # 自动落在安全的标题区
        body = VGroup(a, b, c).arrange(DOWN, buff=0.4)
        fit_content(body)                       # ★ 防出界：超大自动缩放进内容区
        self.play(Write(body))
        self.caption("一句旁白")                # 自动落字幕区 + 自动布局检查
        self.clear_screen()                     # ★ 切知识点前清屏，防重叠
```
规则：**每段内容先 `VGroup().arrange()` 再 `fit_content()`**；标题/字幕用 `title_bar()/caption()`；切镜头前 `clear_screen()`；带下标符号（aₙ/Sₙ）用 `frow()`。把 `mathviz.py` 和 `scene.py` 放同一目录。

**② 自动布局检查（读渲染日志，不用眼睛）：** `SafeScene` 每次 `wait()` 自动检查，日志里会出现：
```
[layout][wait] ok                                  ← 这一屏没问题
[layout][wait] WARN 出界: Text('a²+b²') x[-6.0,16.0] … → 用 fit_content() 缩放或 .to_edge() 归位
[layout][wait] WARN 文字重叠: Text('…') 与 Text('…') → 切镜头前 clear_screen()
[layout] DONE 共发现 N 处布局问题
```
**渲染后必须在日志里搜 `[layout]`，确认 `DONE 共发现 0 处`。** 有 WARN 就按它给的提示改，再渲，直到 0 处。这就是“看图”的文字替代品。

**③ 字体字形检查（防方框 □）：** 写完先跑（PASS 才继续）：
```bash
python3 .cursor/skills/math-explainer/scripts/check_text.py <主题>/scene.py
```
它按你用的字体逐字符检查，缺字形的字符会被列出来（如 `'ₙ'(U+2099)`）。

> 有视觉能力的模型，可以额外渲一张静帧 `render.sh ... s` 读 PNG 做二次确认；但**没有视觉能力，靠以上三层也能做出不出界、不重叠、不方框的视频**。

---

## 3.6 让画面生动起来（配色 + 动效，机械可执行）

默认黑底、单色、满屏文字会很“干”。下面是**不靠审美、照做即可**的清单（基于 `mathviz.py`）：

**配色（用 `mathviz` 调色板，别只用黑白蓝）：**
- 开场调 `self.add_backdrop()`（深蓝底 + 角落柔光，立刻有层次）。
- 用调色板：`C_MAIN/C_SUB/C_OK/C_ACCENT/C_WARM/C_PURP`。**颜色用来区分“不同对象/角色”**（如：基准线灰、主曲线蓝、标注金），同类元素同色、对比元素用对比色。
- **单一主体用固定颜色**：同一个对象（比如那条主曲线）自始至终用同一种颜色，**不要让它的颜色随参数连续变化**（那样会显得花、也容易喧宾夺主）。要表达“量在变”，靠形状/位置/动效，不靠给主体染色。
- **不要在旁白/字幕里讲解装饰性的颜色**（如“颜色变暖、变珊瑚色”）——颜色只是辅助，旁白只讲数学本身。
- 标题/纯标题文字可用 `set_color_by_gradient(C_MAIN, C_SUB)`；形状用「描边 + 低透明度填充」更通透：`.set_stroke(C_SUB, 4).set_fill(C_SUB, 0.12)`。

**动效（用动画“做”出过程，而不是直接出结果）：**
- 入场别只用 `FadeIn/Write`：几何用 `GrowFromCenter / DrawBorderThenFill / SpiralIn`；多个元素用 `LaggedStart(*anims, lag_ratio=0.2)` 错峰出现。
- 过程要可见地变：`mobj.animate.shift/scale/set_color`、`Transform`、`ValueTracker + always_redraw`（连续变化/动点/逼近）、`MoveAlongPath`。
- 关键步骤至少来一次强调：`self.emphasize(m)`（Indicate）或 `self.flash_on(m)`（Circumscribe）；也可 `Flash/Wiggle`。
- 曲线/关键图形加柔光：`self.add(with_glow(graph, C_SUB))`。
- 让“量”活起来：动点用 `always_redraw(lambda: Dot(axes.c2p(1, t.get_value()), color=C_ACCENT))` + 一圈半透明大点做光晕。

**量化底线（机械判断，逐条过）：**
- [ ] 调了 `add_backdrop()`；用到 ≥3 种配色。
- [ ] 每个镜头 ≥1 个有动感的入场/变化动画（不是纯 FadeIn 文字）。
- [ ] 整片 ≥3 处强调动画（emphasize/flash_on/Flash）。
- [ ] 适用时 ≥1 处连续/动点演示（ValueTracker / always_redraw）。
- [ ] 关键曲线/结论用 `with_glow()` 或加框定格。

**别过度**：动效要服务理解，不要无意义旋转/乱飞粒子；**一次只动一处**，避免抢注意力。字幕用 `caption()`（已上移、带底衬），不要自己把文字贴到画面最底。

**⚠️ 防“残留方框/残留副本”（高频坑）：** 辉光、底衬、阴影这类**装饰副本**如果单独 `self.add(...)`，之后却只移动/淡出主体，装饰副本会被孤立、留在原地。两条规则避免：
- **转场统一用 `clear_screen()`**（它会淡出所有非保留元素，包括装饰副本）；不要手动只 `FadeOut` 个别主体。
- 装饰与主体**编进同一个 `VGroup`**，整组一起 `move/FadeOut`：
```python
box = SurroundingRectangle(ans, color=C_ACCENT)
glow = box.copy().set_stroke(C_ACCENT, 22, opacity=0.22).set_fill(opacity=0)
grp = VGroup(glow, box, ans)          # ★ 一起编组
self.play(FadeIn(glow), Write(ans), Create(box))
# 之后 self.play(grp.animate...) 或 self.play(FadeOut(grp))，辉光跟着走，不残留
```

---

## 4. 无 LaTeX 时怎么写公式（高频救命）

如果 `check_env.py` 报 LaTeX 不可用，**绝对不要用 `MathTex`/`Tex`**，否则必报 `latex failed`。改用 `Text` + Unicode：

```python
# 想要 a² + b² = c²
Text("a² + b² = c²", font="PingFang SC")
# 常用上标: ² ³ ; 下标数字: ₁ ₂ ₅ ; 符号: × ÷ ≤ ≥ ≠ ≈ → ∞ √ ∫ Σ ∑ π θ Δ ° ± ⋅
Text("∫ f(x) dx", font="...")
Text("x₁ + x₂ = -b/a", font="...")
```
分数/根号等复杂排版可用 `VGroup` 拼：分子、分数线 `Line`、分母上下排列。能力不够就退化成线性写法 `(a+b)/c`。

> ⚠️ **下标字母会变方框！** 中文字体（如 PingFang SC）通常有**下标数字** `₀-₉`（所以 `a₁`、`a₅`、`x₂` 没问题），但**没有下标字母** `ₙ`(U+2099)、`ₖ`、`ᵢ` 等的字形 → `aₙ`、`Sₙ` 会显示成 `a■`、`S■`。同理多数上标字母也缺。三种解法：
> 1. 句子/字幕里**改措辞避开**：用「首项+末项」「前 n 项和 S」「第 n 项」代替 `a₁+aₙ`、`Sₙ`、`aₙ`。
> 2. 需要显示 `aₙ`/`Sₙ` 公式时，用 **VGroup 把下标拼出来**（正常字符缩小并下移）：
> ```python
> def frow(spec, scale=0.8, color=WHITE):
>     parts = []
>     for it in spec:                      # 字符串=正常字；("a","n")=带下标
>         if isinstance(it, tuple):
>             b = Text(it[0], font=ZH).scale(scale)
>             s = Text(it[1], font=ZH).scale(scale*0.6)
>             s.next_to(b, RIGHT, buff=0.03).align_to(b, DOWN).shift(DOWN*scale*0.12)
>             parts.append(VGroup(b, s))
>         else:
>             parts.append(Text(it, font=ZH).scale(scale))
>     return VGroup(*parts).arrange(RIGHT, buff=0.12).set_color(color)
> # 用法：frow([("S","n"), " = n（", ("a","1"), " + ", ("a","n"), "）/ 2"], scale=0.9)
> ```
> 3. 装了 LaTeX 的话，直接 `MathTex(r"S_n = \frac{n(a_1+a_n)}{2}")` 最省事。
> **网页里不受影响**：KaTeX 能正常渲染 `S_n`、`a_n`（浏览器字体齐全），放心用 `$S_n$`。

> ⚠️ **不止 MathTex 会触发 LaTeX！** 这些常见用法在无 LaTeX 环境也会报 `FileNotFoundError: latex`：
> - `Axes(..., axis_config={"include_numbers": True})` —— 坐标轴数字用 LaTeX
> - `axes.get_axis_labels(...)` —— 轴标签默认是 `MathTex`
> - `DecimalNumber(...)` / `Integer(...)` / `Variable(...)` —— 数字用 LaTeX
> - `BarChart`、`NumberLine(include_numbers=True)`、`add_coordinates()` 等带数字的组件
>
> **无 LaTeX 时的坐标系写法**（用 Text 自己标数字和轴名）：
> ```python
> axes = Axes(x_range=[-3,3,1], y_range=[-6,8,2], x_length=7, y_length=5.4, tips=False)  # 不要 include_numbers
> xlab = Text("x", font=ZH).scale(0.5).next_to(axes.x_axis.get_end(), DR, buff=0.12)
> ylab = Text("y", font=ZH).scale(0.5).next_to(axes.y_axis.get_end(), UL, buff=0.12)
> ticks = VGroup(*[Text(str(v), font=ZH).scale(0.35).next_to(axes.c2p(v,0), DOWN, buff=0.12)
>                  for v in [-2,-1,1,2]])
> # 实时数值用 Text（内容随帧变），不要用 DecimalNumber：
> readout = always_redraw(lambda: Text(f"n = {t.get_value():+.1f}", font=ZH).scale(0.6).to_corner(UR))
> ```
> 完整可运行示例见 `cookbook` 的「无 LaTeX 坐标系 + 动态曲线」配方。

> 想要漂亮公式又没装 LaTeX → 建议先装 LaTeX（见 setup 脚本末尾），再用 `MathTex`。两条路二选一，别混。

**中文显示**：`Text` 默认字体可能不含中文 → 方框。务必指定中文字体：
```python
Text("你好，世界", font="PingFang SC")   # macOS
# 其他可选: "Heiti SC", "STHeiti", "Songti SC"; Linux 常用 "Noto Sans CJK SC"
```
`MathTex` 里中文要用 `\text{}` 且需中文 LaTeX 环境，**不推荐**；中文一律用 `Text`。

---

## 5. 新旧 API 对照表（用错就报错/告警）

| 旧（别用） | 新（用这个） |
|------------|--------------|
| `ShowCreation` | `Create` |
| `TextMobject("..")` | `Text("..")` 或 `Tex("..")` |
| `TexMobject("..")` | `MathTex("..")` |
| `axes.get_graph(f)` | `axes.plot(f)` |
| `axes.get_graph_label` | `axes.get_graph_label`（仍在，但常用 `axes.plot` + `MathTex` 手动放） |
| `CecheckCheckmark`/手写勾 | 用 `Text("✓")` 或 `Checkmark`（若有） |
| `get_axis_labels()` 旧签名 | `axes.get_axis_labels(x_label="x", y_label="y")` |
| `self.play(ApplyMethod(m.shift, UP))` | `self.play(m.animate.shift(UP))` |
| `CONFIG = {...}` 类变量配置 | 直接用 `__init__` 参数或实例属性 |
| `VMobject.set_color_by_gradient` | 仍可用；新写法 `set_color(color)` / `set_fill` |

不确定某 API 是否存在 → 在已安装环境里 `python -c "from manim import X"` 试一下，或查 https://docs.manim.community 。

---

## 6. 动态动画：ValueTracker + always_redraw

让数值驱动图形连续变化（调参数、动点、扫角度）：
```python
t = ValueTracker(0)
dot = always_redraw(lambda: Dot(axes.c2p(t.get_value(), func(t.get_value())), color=YELLOW))
self.add(dot)
self.play(t.animate.set_value(5), run_time=3, rate_func=linear)
```
- `always_redraw(fn)`：每帧用 `fn()` 重建对象，适合“跟随某个值变化”的东西。
- 也可给对象加 updater：`mobj.add_updater(lambda m: m.next_to(dot, UP))`，用完 `mobj.clear_updaters()`。
- `axes.c2p(x, y)`（coords→point）把数学坐标转成屏幕点；反向 `p2c`。

---

## 7. 坐标系与函数图像

```python
axes = Axes(
    x_range=[-3, 3, 1], y_range=[-1, 9, 2],
    x_length=8, y_length=5,
    axis_config={"include_numbers": True},
).to_edge(DOWN)
labels = axes.get_axis_labels(x_label="x", y_label="y")
graph = axes.plot(lambda x: x**2, color=BLUE)
self.play(Create(axes), Write(labels))
self.play(Create(graph))
# 切线/面积/竖线等：
area = axes.get_area(graph, x_range=[0, 2], color=GREEN, opacity=0.4)
v_line = axes.get_vertical_line(axes.c2p(2, 4))
```
- 指定函数域避免发散：`axes.plot(f, x_range=[0.1, 3])`。
- 离散点：`axes.plot_line_graph(x_values=[...], y_values=[...])`。

---

## 8. 镜头运动（可选，进阶）

要平移/缩放镜头，用 `MovingCameraScene`：
```python
class Demo(MovingCameraScene):
    def construct(self):
        ...
        self.play(self.camera.frame.animate.scale(0.5).move_to(dot))
```
3D 用 `ThreeDScene` + `self.set_camera_orientation(phi=70*DEGREES, theta=45*DEGREES)`。非必要不用 3D，调试成本高。

---

## 9. 常见错误速查（详版）

| 报错/现象 | 根因 | 解决 |
|-----------|------|------|
| 安装时 `Failed to build pycairo` / `Dependency lookup for cairo failed` / `pkg-config ... not found` | 缺系统原生库 | mac: `brew install cairo pango pkg-config`；linux: `apt-get install libcairo2-dev libpango1.0-dev pkg-config`（setup 脚本已含，手动装后重跑） |
| `manim` 命令找不到 / `No module named manim`（明明装过） | 没激活 venv（manim 装在 `~/.cache/manim-explainer-venv`） | 用 `render.sh`/`check_env.py`（会自动激活），或 `source ~/.cache/manim-explainer-venv/bin/activate` |
| `LaTeX compilation error` / `latex failed` | 没装 LaTeX 却用了 `MathTex`/`Tex` | 装 LaTeX，或改 `Text`（见 §4） |
| `FileNotFoundError: 'latex'`，但代码里没写 MathTex | 用了 `include_numbers=True` / `get_axis_labels` / `DecimalNumber` / `Integer` / `Variable`（都依赖 LaTeX） | 改用 Text 自己标数字与轴名（见 §4 的无 LaTeX 坐标系写法） |
| 曲线下方出现一大片半透明色块 | 对 `axes.plot(...)` 用了 `set_opacity()`，连带把 fill 设了透明度 | 曲线只设描边：`.set_stroke(GREY, width=2.5, opacity=0.6)`，必要时 `.set_fill(opacity=0)` |
| 转场/结尾残留一个淡框或副本 | 辉光/底衬等装饰副本被单独 add，之后只移动/淡出了主体 | 转场统一用 `clear_screen()`；或把装饰与主体编进同一 `VGroup` 整组一起动（见 §3.6） |
| `RuntimeError: latex was not found` | 同上 | 同上 |
| 公式里某符号报错 | LaTeX 语法错/缺宏包 | 简化公式；用原始字符串 `r"..."`；转义反斜杠 |
| `NameError: name 'ShowCreation'` | 旧 API | 见 §5 对照表 |
| `AttributeError: 'Axes' object has no attribute 'get_graph'` | 旧 API | 用 `axes.plot` |
| 渲染成功但没 mp4 | 用了 `-s`（只出图）/Scene 名错/异常被吞 | render.sh 传 `m`；核对类名大小写 |
| 中文变方框 | 字体不含中文 | `font="PingFang SC"` |
| `aₙ`/`Sₙ` 里下标变方框（`a■`） | 中文字体缺下标字母 `ₙ` 等字形（下标数字 ₁₂ 没问题） | 改措辞避开，或用 VGroup 拼下标（见 §4 `frow`），或装 LaTeX 用 MathTex |
| 元素重叠/出界 | 没清屏/没排版/没缩放 | 见 §3 铁律 |
| `.animate` 旋转 180° 没动 | 首末态相同被插值 | 改 `Rotate(m, PI)` |
| 渲染极慢/卡住 | 高质量或对象太多/updater 太重 | 调试用 `s`/`l`；减少 `always_redraw` 频率 |
| `c2p`/`p2c` 坐标错位 | 在 `add` 坐标系前就调用 | 先 `self.add(axes)` 或确保 axes 已定位 |
| 颜色不生效 | 只设了 stroke 没设 fill | `set_fill(color, opacity>0)` |

排查顺序：① 看 traceback 最后一行 → ② 对照本表 → ③ 仍不懂就最小化复现（删到只剩报错那几行）。

---

## 10. 进阶（按需，非必须）

**多段拼接**：分别渲染多个 Scene 得到多个 mp4，再用 ffmpeg 合并：
```bash
printf "file '%s'\n" media/videos/scene/720p30/*.mp4 > list.txt
ffmpeg -f concat -safe 0 -i list.txt -c copy final.mp4
```
（更稳的做法：把所有镜头写进**一个** Scene，天然连贯，优先这样。）

**配音（旁白）**：安装 `manim-voiceover` 插件，用 `with self.voiceover(text="...") as tracker:` 让动画时长跟随语音。这是可选增强，核心流程不依赖它。

**导出 GIF**：渲染加 `--format gif`，或对 mp4 用 ffmpeg 转。

**导出最后一帧/某帧图片**：`-s` 出最后一帧；要中间帧可临时把后续动画注释掉再 `-s`。

---

参考：官方文档 https://docs.manim.community ，示例库 https://docs.manim.community/en/stable/examples.html ，源码 https://github.com/ManimCommunity/manim 。
