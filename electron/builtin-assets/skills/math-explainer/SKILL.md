---
name: math-explainer
description: >-
  Generate math explanation videos (animated with Manim) and interactive web
  pages from a user's request. Use when the user asks to explain, teach,
  visualize, or animate a math/physics concept, wants a "math video", "讲解视频",
  "数学动画", "动画演示", a Manim animation, an interactive math demo, an
  interactive webpage/可视化/网页演示, or to turn a formula/theorem/problem into a
  visual explainer. By default produces BOTH a Manim-rendered MP4 video and a
  paired self-contained interactive HTML page sharing the same concept, notation,
  parameters, and palette. Covers planning the script, writing Manim scenes,
  rendering to MP4, and building the interactive HTML.
---

# Math Explainer — 数学讲解视频 + 交互式网页生成

把一个数学/物理概念，**同时**变成两件互补的产物：
- **讲解视频**（用 Manim 渲染成 MP4）：线性讲清「为什么」，带观众走完推导主线。
- **交互式网页**（自包含 HTML）：让观众**自己拖参数、即时看变化**，动手探索同一个概念。

> **默认两件都做**（除非用户明确只要其中一个）。两者共享同一套设计（同一概念、记号、参数、配色），互为补充：视频负责讲明白，网页负责玩明白。

参考实现：[ManimCommunity/manim](https://github.com/ManimCommunity/manim)（本 Skill 基于 Manim Community v0.20+ 编写）。

> 给执行者的提醒：**严格按阶段顺序走，不要跳步。** 每个阶段都有“做什么 / 怎么做 / 如何自检”。不确定 API 就去读 `references/manim-guide.md`，不要凭记忆瞎写。能渲染一张静帧用眼睛看的地方，一定先看再继续。

---

## 0. 核心心法（必读，照做）

1. **默认同时产出视频 + 交互网页**，且二者**共享同一套设计**（概念、记号、参数与取值范围、配色、关键视觉）。先在分镜里把这套“共享设计规范”定下来，视频和网页都照它做，确保观感与符号一致。
2. **讲「为什么」，不要只展示「是什么」（最高红线）。** 必须让观众**看着结论被推导出来**，而不是把结论和漂亮图形摆出来就完事。流畅 ≠ 讲清楚。推导/论证要占全片 ≥ 50%。详见 `references/pedagogy-and-storyboard.md` §0，证明范例见 `templates/example_pythagoras_proof.py`。
3. **先设计，后编码。** 没有分镜脚本（storyboard）就不要写代码。见阶段 B。
4. **一屏只讲一件事。** 进入下一个知识点前，把上一屏不需要的东西 `FadeOut` 掉。**永远不要让元素重叠或飘出画面。**
5. **没有视觉能力也要保证效果（视频 + 网页都有文字化检查）。** 不要依赖“看图调整”。
   - 视频：① 用 `templates/mathviz.py` 的 `SafeScene` + `fit_content()/arrange()/clear_screen()` 机械排版；② 渲染后搜日志 `[layout]`，确认 `DONE 共发现 0 处`；③ 跑 `check_text.py` 防方框。详见 `manim-guide.md` §3.5。
   - 网页：写完跑 `check_web.py`，必须 `[PASS]`（查公式/id/滑块/canvas/布局/JS 语法）。
   有视觉能力可额外读 PNG / 浏览器查看做二次确认；没有也能靠上述文字结果交付。
6. **用模板，别从零写。** 复制 `templates/` 里的骨架再改，能避开 90% 的低级错误。
7. **失败先查表。** 报错先翻 `references/manim-guide.md` 的「常见错误速查」，不要乱试。
8. **交付前自检。** 视频要确认 MP4 存在且能播、且**遮住旁白也能看懂推理**；网页要确认在浏览器能打开、公式能渲染、交互有效。

---

## 1. 阶段总览（先复制这个清单跟踪进度）

```
进度跟踪（默认两件产物都要做）：
- [ ] A. 明确需求（主题/受众/时长/语言/风格）—— 默认“视频 + 网页”都做
- [ ] B. 写分镜 storyboard.md，并在其中定下「共享设计规范」（概念/记号/参数+范围/配色/关键视觉）
- [ ] C. 准备环境（仅视频需要；运行 setup + check_env）
- [ ] D1. 视频：按分镜写 Scene → 静帧自检 → 完整渲染 → 验证 MP4
- [ ] D2. 网页：套用模板 → 按同一套设计填内容/交互 → 浏览器验证
- [ ] E. 交付（两件产物路径 + 如何查看 + 一致性确认 + 后续可调项）
```

所有产物放在**同一个主题文件夹** `<主题英文短名>/` 下，便于配套交付。**两件成品（网页 + 视频）都放在文件夹根目录**，用户打开文件夹一眼就能找到：
```
<主题英文短名>/
├── index.html        # ← 交互网页成品（双击打开）
├── <SceneName>.mp4   # ← 讲解视频成品（render.sh 渲染后自动复制到这里）
├── storyboard.md     # 分镜 + 共享设计规范
├── scene.py          # 视频源码
└── media/            # Manim 渲染中间产物（可忽略，可不交付）
```

---

## 2. 阶段 A — 明确需求

先确认下面几项。**用户没说清的，用合理默认值并在交付时说明，不要反复追问。**

| 维度 | 要点 | 默认值 |
|------|------|--------|
| 主题 | 具体到一个概念/定理/题目（如“勾股定理的面积证明”） | 必须问清，太宽就收窄 |
| 形式 | 视频 / 交互网页 / 两者 | **两者都做**（默认） |
| 受众 | 小学 / 初高中 / 大学 / 科普 | 初高中 |
| 时长/篇幅 | 视频建议 30s–3min；网页单页 | 视频 ~60–90s |
| 语言 | 中文 / 英文（含字幕与旁白文字） | 跟随用户语言（中文） |
| 风格 | 深色背景(默认) / 浅色；配色 | 深色 + 高对比 |

**关于“形式”：默认同时产出视频 + 交互网页，不要让用户二选一。** 只有当用户明确说“只要视频”或“只要网页”时，才做其中一个。

两者如何分工（同一概念的两个侧面）：
- **视频**承担推导主线：把“为什么成立”一步步讲清（证明、变换、极限逼近的过程）。
- **网页**承担动手探索：把概念里**可变的量**做成滑块，让观众即时看到变化（调斜率/样本量/角度/参数 n…）。
- 几乎任何主题都能这样拆：视频讲清原理，网页让人把玩同一组参数。若某主题实在没有可调量，网页就做成“分步可点选”的讲解（点一下推进一步）。

---

## 3. 阶段 B — 写分镜脚本（最重要的一步）

读 `references/pedagogy-and-storyboard.md`（**务必先读 §0 致命红线 和 §7 推导策略库**），然后复制 `templates/storyboard.md` 到工作区填写。

一个合格分镜必须包含：
- **学习目标**：看完观众能回答的 1 个问题。
- **共享设计规范（视频和网页共用，必填）**：
  - 核心概念一句话；统一记号（如统一用 `n`、`a/b/c`，别视频用 k 网页用 m）。
  - **可交互参数 + 取值范围 + 步长**（网页滑块用；视频里这些参数的关键取值就是镜头）。
  - 配色（背景/主色/辅色/文字）；关键视觉元素（坐标系范围、基准曲线、机制标注等）。
- **推导主线（核心，不可省）**：先从 §7 选定一种推导/证明路径，拆成 3–6 个原子步骤，**每步对应一次“因为…所以…”的逻辑前进**，占镜头一半以上。
- **镜头清单**：每个镜头写明「① 画面里有什么 ② 旁白/字幕一句话 ③ 用什么动画切到下一镜」。
- **收尾**：一句话总结 + 画面定格。

**分镜硬性关卡（不过则重写，别进阶段 D）：**
- [ ] 有明确的推导主线，不是“直接展示结论”。
- [ ] 遮住所有旁白，仅凭画面能复述推理关键步骤。
- [ ] 推导每一步都能回答“凭什么这步成立”，没有逻辑断层。
- [ ] 已写明共享设计规范：记号统一、可交互参数及范围已定（视频与网页将共用）。

> 不要在没有分镜的情况下进入阶段 D。分镜是视频和网页**共同**的“施工图”。

把分镜写成 `<主题英文短名>/storyboard.md`，视频（D1）与网页（D2）都严格照它做。

---

## 4. 阶段 C — 准备环境（视频需要；网页不依赖它，可并行进行）

> 脚本位于项目内 `.cursor/skills/math-explainer/scripts/`。下面命令默认**在项目根目录执行**。`render.sh` 会自动 `cd` 到 scene 文件所在目录，所以路径只要相对项目根写对即可。

按顺序执行，**每一步都要看输出**：

1. 安装（幂等，已装会跳过）：
```bash
bash .cursor/skills/math-explainer/scripts/setup_manim.sh
```

2. 体检（必须全部 OK 才能继续）：
```bash
python3 .cursor/skills/math-explainer/scripts/check_env.py
```
- 若 `manim` 或 `ffmpeg` 缺失 → 回到第 1 步或按报错提示装。
- 若 `LaTeX` 显示不可用 → **不要用 `MathTex`/`Tex`**，改用 `Text` + Unicode（见 `manim-guide.md` 的“无 LaTeX 时怎么写公式”）。这是弱模型最常踩的坑。

---

## 5. 阶段 D1 — 制作视频（Manim）

读 `references/manim-guide.md`（API 纪律、布局、防重叠、新旧 API、排错）。常用现成片段在 `references/manim-cookbook.md`。

**逐步执行：**

1. **进入主题文件夹** `<主题英文短名>/`（阶段 B 已建）。
2. **复制骨架**：把 `templates/scene_template.py` 复制成 `<主题>/scene.py`，并把 `templates/mathviz.py` 一起复制到 `<主题>/`（scene 要 `from mathviz import ...`）。骨架基于 `SafeScene`，已内置安全区布局、`fit_content`、`title_bar/caption/clear_screen`、`frow`、以及**自动布局检查**。
3. **按分镜填 Scene**：每段内容先 `VGroup().arrange()` 再 `fit_content()`；标题/字幕用 `title_bar()/caption()`；切镜头前 `clear_screen()`；带下标符号用 `frow()`。配色与记号**严格用共享设计规范**。**先实现一两个镜头就去渲染自检，不要一口气写完。**
4. **字体字形检查（防方框，必过）**：
```bash
python3 .cursor/skills/math-explainer/scripts/check_text.py <主题>/scene.py
```
   必须 `[PASS]`。若 `[FAIL]` 列出缺字形字符（如 `'ₙ'`），按提示改（改措辞 / 用 `frow()` 拼下标）。
5. **布局自检（关键反馈闭环，无需视觉）**：
```bash
bash .cursor/skills/math-explainer/scripts/render.sh <主题>/scene.py SceneName s
# -s 出静帧；construct 全程执行，SafeScene 会在日志打印 [layout] 检查结果
```
   **在输出里搜 `[layout]`**：必须看到 `DONE 共发现 0 处布局问题`。若有 `WARN 出界/文字重叠`，按提示改（`fit_content()` / `clear_screen()`），再渲，直到 0 处。
   （有视觉能力可额外打开 PNG 二次确认；没有也能靠 `[layout]` 文字结果判断。）
6. **完整渲染**（草稿用低/中质量，定稿用高质量）：
```bash
bash .cursor/skills/math-explainer/scripts/render.sh <主题>/scene.py SceneName m   # m=720p草稿, h=1080p定稿
```
7. **验证 MP4**：`render.sh` 渲染后会**把成片复制到主题文件夹根目录** `<主题>/<SceneName>.mp4`（和 `index.html` 并排）。脚本会打印这个路径——确认文件存在且大小>0，并确认渲染日志里 `[layout] DONE 0 处`。`media/` 是中间产物，可忽略。

> 多个镜头可以写成一个长 Scene（推荐，旁白连贯），也可拆成多个 Scene 分别渲染后用 ffmpeg 拼接（见 cookbook）。优先单 Scene。

**视频质量底线（自检，逐条过）：**
- [ ] **讲清了为什么**：遮住旁白只看画面，能复述推导关键步骤（最重要，不过则重做）。
- [ ] 推导/论证占全片 ≥ 50%，不是开场炫技、推导一笔带过。
- [ ] `check_text.py` 为 `[PASS]`（无方框）。
- [ ] 渲染日志 `[layout] DONE 共发现 0 处布局问题`（无出界/重叠）。
- [ ] 配色对比足够；每屏停留时间够读完字幕（`caption()`/`self.wait()` 给足）、公式正确、结尾有定格。

---

## 6. 阶段 D2 — 制作交互式网页（与视频配套）

读 `references/interactive-web-guide.md`。复制 `templates/interactive_template.html` 成 `<主题>/index.html`。

**核心原则：网页是视频的“可玩版”，不是另起炉灶。** 同一概念、同一记号、同一配色，把视频里讲过的**那些参数**做成滑块。

**逐步执行：**

1. 复制模板为 `<主题>/index.html`。模板已内置：**单列居中布局（交互区在页面中间、尺寸偏小，先交互后讲解）**、KaTeX 公式渲染、`<canvas>` 绘图、滑块控件与重绘循环、深色主题。
2. **交互参数照搬分镜的「共享设计规范」**：视频里变化的量（斜率 a、样本数 n、角度 θ…）→ 每个对应一个滑块，范围/步长保持一致。
3. **实现绘制函数** `draw()`：读取当前参数 → 清空画布 → 重绘。滑块变化即调用 `draw()`。把视频里的“机制标注”（如 x=1 处 y=n 的点）也画上，强化和视频的呼应。
4. **写解释文字 + 公式**：用视频同一套讲解措辞与 KaTeX 公式；可加一句“想看完整推导，见配套视频”。
5. **配色与视频一致**：背景/主色/辅色对齐共享设计规范（默认深色主题与视频相同）。
6. **无视觉自动检查（必过）**：
```bash
python3 .cursor/skills/math-explainer/scripts/check_web.py <主题>/index.html
```
   必须 `[PASS]`。它查：$ 公式配对、KaTeX 齐全且被调用、`getElementById` 的 id 都存在、滑块绑了 input 事件、canvas/draw 链路、单列居中 + 先交互后讲解、JS 语法（有 node 时）。有 `[FAIL]` 按提示改到 0。
7. **二次确认（有视觉能力时可选）**：浏览器查看（macOS `open <主题>/index.html`），确认公式渲染、滑块联动、不溢出。没有视觉能力靠第 6 步 `[PASS]` 即可。

**网页质量底线：** `check_web.py` 为 `[PASS]`；单文件可双击打开；公式正确渲染；至少 1 个真正影响图形的交互；**单列居中、交互区在中间且尺寸适中、先交互后讲解**；**记号/配色与视频一致**。

---

## 7. 阶段 E — 交付

给用户一份简短交付说明，**两件产物一起交付**，包含：
- 两个产物路径（都在主题文件夹**根目录**，并排好找）：视频 `<主题>/<SceneName>.mp4` 和交互网页 `<主题>/index.html`，外加分镜 `<主题>/storyboard.md`。
- 如何使用：**先看视频理解原理，再打开网页动手探索**（视频用播放器；网页双击或 `open <主题>/index.html`）。
- **一致性确认**：视频与网页用了同一概念、同一记号、同一参数范围、同一配色（这是配套交付的关键）。
- 用了什么默认值（受众、时长、风格、是否用了 Text 代替 LaTeX）。
- 可继续打磨的点（改配色、加旁白配音、延长某镜头、网页加更多可调参数或预设）。

可选进阶（按需，读 `references/manim-guide.md` 末尾）：加真人/TTS 配音（manim-voiceover）、加背景音乐、导出 GIF。

---

## 8. 常见错误速查（先看这里，再翻详细文档）

| 现象 | 原因 | 处理 |
|------|------|------|
| `latex failed` / `No module named latex` | 没装 LaTeX 还用了 `MathTex`/`Tex` | 装 LaTeX，或全部改用 `Text`（见 manim-guide） |
| `NameError: ShowCreation` 等 | 用了旧版 API | 查 manim-guide 的“新旧 API 对照表”，`ShowCreation→Create` 等 |
| 渲染成功但没视频 | 用了 `-s`（只出图）或 Scene 名拼错 | 用 render.sh 传 `m`/`h`；核对类名 |
| 元素叠在一起/飞出画面 | 没清屏、没排版 | 切镜头前 `FadeOut`；用 `.arrange()`/`.to_edge()`/`scale_to_fit_*` |
| `axes.get_graph` 报错 | 旧 API | 用 `axes.plot(func)` |
| 中文显示成方框 | 字体不支持中文 | `Text("你好", font="PingFang SC")`（mac）或换系统中文字体 |
| 渲染很慢 | 用了高质量调试 | 调试用 `-s` 或 `l`，定稿才用 `h` |

完整排错见 `references/manim-guide.md`。

---

## 资源索引

- `references/pedagogy-and-storyboard.md` — 怎么把概念讲清楚 + 分镜方法
- `references/manim-guide.md` — Manim API 纪律、布局、防重叠、新旧 API、排错、进阶（配音/拼接）
- `references/manim-cookbook.md` — 按主题分类的可复制 Scene 配方（坐标系/函数图像/几何证明/向量/数列极限/概率…）
- `references/interactive-web-guide.md` — 自包含交互网页的结构、KaTeX、canvas、控件
- `templates/scene_template.py` — Manim 场景骨架（基于 SafeScene，以“推导”为核心）
- `templates/mathviz.py` — **护栏模块**：SafeScene(自动布局检查) + fit_content/title_bar/caption/clear_screen/frow（和 scene.py 一起复制到主题文件夹）
- `templates/example_pythagoras_proof.py` — **黄金范例**：真正证明勾股定理（重排/面积法），做推导类视频前先读它
- `templates/interactive_template.html` — 交互网页骨架（单列居中、先交互后讲解）
- `templates/storyboard.md` — 分镜脚本模板
- `scripts/setup_manim.sh` / `scripts/check_env.py` / `scripts/render.sh` — 环境与渲染脚本
- `scripts/check_text.py` — 视频字体字形检查（防方框，无需视觉）
- `scripts/check_web.py` — 网页无视觉自动检查（公式/id/滑块/canvas/布局/JS 语法）
