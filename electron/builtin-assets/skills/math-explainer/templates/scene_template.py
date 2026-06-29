"""数学讲解视频骨架（以「推导」为核心 + 给无视觉模型的护栏）。

⚠️ 你（执行模型）很可能看不到画面。本骨架基于 mathviz.SafeScene：
   - 每次 self.caption()/self.wait() 会自动做布局检查，把问题打印成
       [layout][...] WARN 出界/文字重叠 ...
     渲染后请在日志里搜 `[layout]`，有 WARN 就按提示修，无 WARN 才算过。
   - 三条机械规则，照做基本不会出问题：
       1) 每段内容先组成一个 VGroup，用 .arrange() 排开，再 fit_content() 缩放防出界；
       2) 标题用 title_bar()，旁白用 caption()，它们自动落在安全的标题区/字幕区；
       3) 切到下一个知识点前调 clear_screen()，避免与上一屏重叠。

⚠️ 最高红线：必须让观众「看着结论被推导出来」。证明类视频请先读 example_pythagoras_proof.py。

用法：把本文件【和 mathviz.py 一起】复制到 <主题>/，改 TITLE 后按分镜填各 derive_step。
渲染：
  bash .cursor/skills/math-explainer/scripts/check_text.py <主题>/scene.py     # 先查字体方框
  bash .cursor/skills/math-explainer/scripts/render.sh   <主题>/scene.py MathExplainer s   # 静帧
  bash .cursor/skills/math-explainer/scripts/render.sh   <主题>/scene.py MathExplainer m   # 草稿
"""
from manim import *
from mathviz import (SafeScene, fit_content, frow, with_glow,
                     ZH, C_MAIN, C_ACCENT, C_OK, C_SUB, C_WARM)

TITLE = "示例：<主题>"


class MathExplainer(SafeScene):
    def construct(self):
        self.add_backdrop()          # 生动：深蓝底 + 角落柔光
        self.title_bar(TITLE)        # 渐变标题 + 强调下划线
        self.intro_question()
        # —— 推导主线（视频核心，占一半以上时长）——
        self.derive_step_1()
        self.derive_step_2()
        self.derive_step_3()
        self.conclude()

    # 提出问题
    def intro_question(self):
        q = Text("我们要弄清：<把要推导的问题写在这里>", font=ZH).scale(0.7)
        q.set_color_by_gradient(C_MAIN, C_SUB)        # 生动：渐变文字
        fit_content(q)
        self.play(FadeIn(q, shift=UP * 0.4, scale=1.05))
        self.emphasize(q)                              # 关键处强调
        self.caption("先抛出问题，制造“想知道答案”的张力。", wait=1.8)
        self.clear_screen()

    # 推导第1步（用具体图形/构造来“做”出这一步，配色鲜明）
    def derive_step_1(self):
        # TODO: 换成你分镜里的图形。这里用一个带辉光的示意图形演示“生动”做法。
        shape = Circle(radius=1.3).set_stroke(C_SUB, 4).set_fill(C_SUB, 0.12)
        label = Text("推导第①步：<画面在做什么>", font=ZH).scale(0.55).set_color(C_OK)
        body = VGroup(shape, label).arrange(DOWN, buff=0.5)
        fit_content(body)
        self.play(GrowFromCenter(shape, rate_func=smooth), run_time=1.0)   # 有动感的入场
        self.add(with_glow(shape, C_SUB))                                  # 柔光
        self.play(Write(label))
        self.caption("旁白：为什么可以这样做 / 这步得到了什么。")
        self.clear_screen()

    # 推导第2步（在上一步基础上推进，用动画体现“变化过程”）
    def derive_step_2(self):
        sq = Square(side_length=2.2).set_stroke(C_MAIN, 4).set_fill(C_MAIN, 0.12)
        body = VGroup(sq, Text("推导第②步：<逻辑推进>", font=ZH).scale(0.55).set_color(C_MAIN)).arrange(DOWN, buff=0.5)
        fit_content(body)
        self.play(DrawBorderThenFill(sq))
        self.play(sq.animate.set_fill(C_WARM, 0.18).set_stroke(C_WARM, 4),
                  rate_func=there_and_back, run_time=1.2)                   # 用动效体现变化
        self.play(Write(body[1]))
        self.caption("旁白：这一步因为…所以…")
        self.clear_screen()

    # 推导第3步（导出结论）
    def derive_step_3(self):
        body = Text("推导第③步：由前两步必然得到结论", font=ZH).scale(0.62).set_color(C_ACCENT)
        fit_content(body)
        self.play(Write(body))
        self.flash_on(body)                                                # 强调
        self.caption("旁白：于是我们得到了结论。", wait=2.2)
        self.clear_screen()

    # 收尾（结论加框 + 辉光定格）
    def conclude(self):
        result = frow([("S", "n"), " = <结论公式>"], scale=1.1, color=C_ACCENT)
        box = SurroundingRectangle(result, color=C_ACCENT, buff=0.3, corner_radius=0.12)
        glow = box.copy().set_stroke(C_ACCENT, 22, opacity=0.22).set_fill(opacity=0)
        grp = VGroup(glow, box, result)   # ★ 辉光等装饰必须和主体编进同一组，转场整组一起动，避免残留
        fit_content(grp)
        self.play(FadeIn(glow), Write(result), Create(box))
        self.emphasize(result)
        self.caption("一句话总结推理主线。", wait=2.0)
