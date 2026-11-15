---
name: edu-physics-video
description: Use when asked to make an explainer / walkthrough video (讲解视频、解题视频、例题精讲、微课) for a physics problem (物理题: mechanics/力学 受力分析 牛顿定律 斜面 传送带 板块 平抛 圆周 能量 动量, optics/光学 折射, electromagnetism/电磁 带电粒子), from a problem screenshot or text, with Chinese voice-over (GLM-TTS / 智谱 TTS), bilingual zh+en subtitles and blueprint-style canvas animation where the motion follows the real solution — delivered as a browser preview (index.html) first, MP4 export only if the user wants it.
version: 1.0.0
allowed-tools:
  - file_read
  - file_write
  - vision_analyze
  - exec_command
---

# 物理题讲解视频 (edu-physics-video)

把一道物理题做成 16:9、1920×1080、带中文配音 + 中英双语字幕 + 蓝图风格动画的讲解视频（先给浏览器预览，用户要时再导出 MP4）。流水线与 edu-math-video 相同，区别在**解题方法**和**画面**：先按物理解题流程（建模 → 分段 → 受力 → 选规律 → 求解 → 验算）解对，再让画面把物理过程真实地演出来——力箭头按比例从作用点长出、物体按解析解运动、v-t 图同步生长、摩擦力随运动反向而转向。

```
script.json ──build_audio.py──► build/timeline.json + build/mix.wav + ../<name>.srt
     (旁白)     (GLM-TTS + 合成音乐)          │
anim.js + phys.js + engine.js ◄───────────────┘ (按旁白时间点驱动动画)
     ├──open index.html ──► 浏览器直接播放（预览）
     └──node render.mjs video──► ../<name>.mp4（用户要时才导出）
```

**核心原则：画面跟着旁白走，物理过程在图上真的发生。** 每句旁白都有一个动作把这句物理演出来；每个动画用"第 k 句旁白开始的时刻"`S.at(k, f)` 定时，绝不写死秒数；物体的位置只来自解析解 `x(t)`，用 `simT()` 线性映射时间（可以慢放，不能缓动）。

**本技能自带全部代码**，不要从别的项目复制文件：
- `template/`：可直接运行的完整示例项目（斜面往返：受力分析 + 牛顿第二定律 + 两段运动 + v-t 图）。`engine.js` 是通用引擎（蓝图主题，不改），`phys.js` 是物理道具库（力、斜面、物块、弹簧、光线、图像、场），`anim.js` / `script.json` / `episode.json` / `storyboard.md` / `problem.png` 是每道题都要重写的。
- `examples/laser-curvature/`：几何光学竞赛题完整示例（anim.js + script.json + storyboard.md + problem.png）：光线传播、平行玻璃砖侧移、折射定律小角近似、屏幕正视图分解位移、切线/圆心角。光学、几何味重、或题目截图带装置图时先读它。
- `shared/pron.py` + `shared/pron.json`：读音控制（GLM-TTS 没有 SSML/拼音输入），已收录物理常见多音词。
- `scripts/`：`new_video.sh`（建项目）、`setup_check.sh`（查环境）、`make_problem_png.py`（文字题→图片+高亮框，公式/单位不会被折行拆开）、`problem_boxes.py`（截图→高亮框坐标）、`contact_sheet.py`（截图拼图审查）。

## MindSpace 路径与执行规则

本 Skill 运行在 MindSpace 桌面端，通过 `exec_command` 工具执行命令。命令参数一律使用虚拟路径：

- `SKILL` = `/skills/edu-physics-video/`（只读，本 Skill 目录）
- `WS` = 当前 Agent 的输出目录：`/agents/<当前Agent英文名>/outputs/<系统提供的真实日期>/`，视频文件夹建在这里，mp4/srt 也输出到这里
- `PROJ` = `WS/<ascii_folder_name>/`（本视频的项目文件夹）
- `PY` = `python`（MindSpace 内置 Python 环境；缺包时见下文依赖规则）

尖括号只用于说明路径结构。实际工具调用必须使用系统提供的真实 Agent 目录名和真实日期，不能把占位符原样写入。**不要因为别的目录已经有 `.env`、`node_modules`、`pron.json` 就把 WS 换过去**，缺什么由 `new_video.sh` 和第 2 步补齐。

### 命令执行

- bash 脚本通过 `exec_command` 以 `cmd: "bash", args: ["/skills/edu-physics-video/scripts/xxx.sh", ...]` 形式运行。
- Python 脚本通过 `cmd: "python", args: ["/skills/edu-physics-video/scripts/xxx.py", ...]` 运行。
- 在 `PROJ` 下执行命令时，用 `cwd` 指定项目文件夹虚拟路径。
- 不要调用 `open`、`start` 等命令启动浏览器或 GUI；预览方式见第 11 步。

### 依赖与安装

本 Skill 依赖 Python 包（numpy、requests、pypinyin、pillow）和 Node 包（playwright、ffmpeg-static）。缺包时把需要的安装命令展示给用户，**等待用户明确确认后**才执行 `python -m pip install ...` 或 `npm install`。不要静默安装、不要自动切换解释器。脚本检测到缺包时只报告，不自动安装。

### 预览与交付

`index.html` 直接写到 `PROJ`（即 WS 下的项目文件夹）。交付时把 `PROJ/index.html` 的虚拟路径告诉用户，请用户在浏览器中打开。不要启动 localhost 服务。MP4 导出后同样把虚拟路径告诉用户。

## 必须遵守的规则

**退出码不是 0 就是没完成。** `--check` 退出码 1（哪怕只剩一个 ⚠ 多音字）、`motion` 退出码 1、截图里有问题，都不能写"只是警告、不影响"然后继续。修好再往下走。

1. **严格按下面第 0~11 步顺序做，每步的"通过标准"满足了才能进入下一步。**
2. **先按物理方法解对题。** 第 1 步必须写出解题卡（研究对象、过程分段、每段受力、所用规律、答案、验算），见 [reference/physics-solving.md](reference/physics-solving.md)。多段过程、符号答案用 sympy 验算。
3. **先讲清楚题目。** 第一幕展示原题图片，旁白逐条读条件，每读一条就在图上框出那一条。
4. **`tts` 字段只能是能念出来的中文。** 不能有阿拉伯数字、`= + − × ÷ / ^ √ ° ( )` 等符号，**单位要读出来**：`v₀ = 10 m/s` 写成 `v零等于十米每秒`，`2 m/s²` 写成 `二米每二次方秒`；sin/cos 写成 正弦/余弦；希腊字母按 pronunciation.md 的表写（θ 西塔、φ 菲）。字幕 `zh` 保留正常物理写法（`v_0`、`d_A`、`m/s^2`）。
5. **读音必须固定。** 调 TTS 之前 `--check` 必须显示 `未固定读音的生僻字/多音字: 0` 且 `script errors: 0`。多音字的标注写在该字**后面**：`长[cháng]`、`调[tiáo]节`。
6. **API Key 只能由用户提供，在第 0 步就检查（`check_key.sh`）。** 缺 `GLM_API_KEY` 时**用 AskUserQuestion 问用户**："填写 key（推荐）"，还是"用系统自带的 say"（装了 edge-tts 时再加"用 edge-tts"）；兜底选项的说明里要写清**效果可能不太好**（机械感明显，断句和读音不如 GLM，见 [reference/glm-tts-setup.md](reference/glm-tts-setup.md#没有-glm-key-时兜底引擎)）。选填 key 就按 init_env.sh 流程等用户回来；选兜底就在 `<WS>/.env` 加 `TTS_ENGINE=say`（或 edge）。没有明确选择时配音脚本会停下要求先问。不要编造 key、模型名或接口地址，不要把 key 打印出来或写进项目文件夹。
7. **物理画面必须正确。** 力的方向（摩擦力与相对运动相反、弹力垂直接触面）、力箭头按同一比例 `FS`、物体位置来自解析解、特殊角用课本近似值（sin37° = 0.6）与答案一致；小角度放大画时注明 `notToScale()`。
8. **所有画面内容在 y ≤ 860 以内**（y≈914~1044 是字幕框）。图形放左半边 x 60~900，推导写在右边 `board()` 上，用 `bm()`（支持 `v_0^2` 上下标）。
9. **先写分镜，再写动画。** `storyboard.md` 顶部写解题卡 + 图形清单，再给每句旁白规划"指/动/留"，按 [reference/visual-design.md](reference/visual-design.md) 的物理动作表选动作；`node render.mjs motion` 必须通过。
10. **先预览再花钱**（`--preview` + `stills auto`），**看图验证**（每次都打开 `build/sheet*.png`，汇报你实际看到了什么）。
11. **不要修改 `engine.js`**；通用物理道具加在 `phys.js`，只属于这道题的图形写在 `anim.js`。不要把 `node_modules`、`package*.json` 复制进视频文件夹。

## 11 个步骤

### 第 0 步：先确认配音可用（最先做，未通过前不做别的）
**这一步通过之前不要解题、不要建项目、不要写任何文件**（`init_env.sh` 建的 `.env` 除外）——免得做完一大半才发现不能配音。
```bash
bash /skills/edu-physics-video/scripts/check_key.sh "<WS>"
```
- 打印 `READY`（退出码 0）：进入第 1 步。
- `NOT READY`（退出码 1）：按它的提示用 AskUserQuestion 问用户——"填写 key（推荐）"，还是"用系统自带的 say"（说明里写清**效果可能不太好**：机械感明显，断句和读音不如 GLM）。选填 key：`init_env.sh` 建好 `.env`，告诉用户完整路径和要填的 `GLM_API_KEY=` 那一行，**然后结束这一轮**，用户回来再跑 `check_key.sh`；选 say：在 `<WS>/.env` 加 `TTS_ENGINE=say` 后再跑一次。
- **通过标准：** `check_key.sh` 打印 `READY`。

### 第 1 步：按物理方法解题，写解题卡
读 [reference/physics-solving.md](reference/physics-solving.md)。拿到题目（有截图先读图），写下：
- 研究对象与模型；过程分段（每段的起止条件与**分段判据**：速度为零、共速、能否滑回、是否脱离……）；每段受力（大小、方向）；每段所用规律及理由；符号解 → 数值答案（带单位）；验算（量纲、极限、能量/动量另算一遍）。
- 多段过程或符号答案：用 sympy 写脚本算一遍。答案不确定或题目看不清时问用户，不要猜。
- **通过标准：** 解题卡完整；能用 4~7 个"幕"讲完（一般一段过程一幕）；答案已验算。

### 第 2 步：建项目、查环境
```bash
bash /skills/edu-physics-video/scripts/new_video.sh "<WS>" <ascii_folder_name>
bash /skills/edu-physics-video/scripts/setup_check.sh <WS>/<ascii_folder_name>
```
- `new_video.sh` 会把 `pron.py`/`pron.json` 链接到技能自带的共享词表，并在找得到时把 `node_modules` 链接到已有安装；找不到才需要在 `WS` 下 `npm install`。python 包用 `python -m pip install --user numpy requests pypinyin pillow（需用户确认后执行）`。
- 配音 key 已在第 0 步确认过；`setup_check.sh` 这里还报缺 key（比如用户后来改了 `.env`），就回到第 0 步处理。key 只放 `<WS>/.env`，不要去别的目录找。
- **通过标准：** `setup_check.sh` 输出 `ALL OK`。

### 第 3 步：测试 TTS
```bash
cd <PROJ> && python build_audio.py --say "你好，我们来看一道物理题。"
```
- 成功打印 `WROTE build/say_xxxx.wav`。401/403 = key 错或没余额，告诉用户，不要反复重试。第一次给这个用户做视频时，把 wav 路径给用户试听确认音色。
- **通过标准：** 生成了 wav。

### 第 4 步：准备题目图片 `problem.png` 和高亮框
二选一（细节见 [reference/animation.md](reference/animation.md#题目图片与高亮框)）：
- **只有文字**：`python /skills/edu-physics-video/scripts/make_problem_png.py --text "完整题目" --mark "条件1" ... --out <PROJ>/problem.png`。问题 (1)(2)(3) 前用换行 `\n` 分行。
- **有截图**（物理题常带装置图）：复制到 `PROJ/`，必要时 `problem_boxes.py crop`；`problem_boxes.py grid` 读坐标；`problem_boxes.py check` 确认。截图很高时在 anim.js 里 `Object.assign(FRAME, { y0: 110, y1: 880 })` 放大卡片。
- 把尺寸和框填进 `anim.js` 顶部的 `PROBLEM`。
- **通过标准：** 打开了 `*.preview.png` 或 `*.check.png`，文字完整（没有 ☒/□），每个框恰好罩住对应文字。

### 第 5 步：写 `episode.json` 和 `script.json`
按 [reference/script-writing.md](reference/script-writing.md) 写（含物理式子、单位、希腊字母的口语对照表）。
- 幕的顺序照解题流程：`intro` 读题 → 受力/建模 → 每段过程 → 分段判断/临界 → （验算）→ `outro` 回顾 + 报答案。
- 每句 ≤ 36 个汉字宽，一句只讲一件事；数值与解题卡完全一致，带单位。
- **通过标准：** JSON 合法；每一幕的 id 都有计划好的画面。

### 第 6 步：写分镜 `storyboard.md`
**先读 [reference/visual-design.md](reference/visual-design.md)**，按 `template/storyboard.md` 的格式：顶部写**解题卡**和**图形清单**（所有物体、接触面、力、已知量、所求量、图像），再每句一行 `| 幕id 句号 | 旁白要点 | 指 | 动 | 留 | 板书 |`。
- "动"从物理动作表选：力从作用点长出、分解、复制品叠放比较大小、摩擦力转向、物体按解真实运动、v-t 曲线生长、面积着色、光线传播……不能只写"出现/显示/高亮"。每幕至少一个连续运动。
- **通过标准：** 每句都有一行；图形清单完整；你能说出每一幕里"最能让人看懂物理"的那个动作。

### 第 7 步：读音与脚本检查，修到 0
```bash
cd <PROJ> && python build_audio.py --check ; cat build/pron_report.txt
```
- `ERROR` 行按提示改；`⚠ 多音/生僻` 按 [reference/pronunciation.md](reference/pronunciation.md) 处理（物理常见多音字、希腊字母表都在里面）。
- **通过标准：** `未固定读音的生僻字/多音字: 0` 且 `script errors: 0`，退出码 0。

### 第 8 步：写 `anim.js`
先通读 `template/anim.js`，API 见 [reference/animation.md](reference/animation.md)（engine.js + phys.js 速查）。结构保持一致：
- `PROBLEM`、`TAGS`；**物理解常量区**（课本近似值、分段解析解 `sPos(t)`、`vel(t)`）；几何（`incline` / `block` 等用 `p: 0` 只算几何）；比例常量 `FS`（px/N）、`VS`（px per m/s）；`SC.<id>` 每幕一个。
- 每句：`glow(..., bump(lt, at(k)))` 指 → 动作 → 留下标记；右侧 `board()` + `bm(...)` 逐行写推导（与图同色），答案用 `bbox` + `stamp`。
- **通过标准：** `python build_audio.py --check` 无 ERROR。

### 第 9 步：免费预览：动作检查 + 版面检查
```bash
cd <PROJ> && python build_audio.py --preview && node render.mjs motion && node render.mjs stills auto && python /skills/edu-physics-video/scripts/contact_sheet.py .
```
- `motion`：`STATIC` 必须修，每幕至少一句 `MOVE`。
- 打开 `build/sheet_*.png` 逐张检查（[审查清单](reference/animation.md#审查清单)）：不重叠、不出界、不压字幕、同步；**物理正确**：力的方向与比例、物体停下/反向的位置与时刻、图像与运动一致。需要中间帧：`node render.mjs stills 12.5,13`。
- **通过标准：** `motion check passed`；截图检查通过（在回复里逐幕说明你看到了什么）。

### 第 10 步：生成配音，自动听写核对，再检查一次画面
```bash
cd <PROJ> && python build_audio.py && python build_audio.py --asr && node render.mjs stills auto && python /skills/edu-physics-video/scripts/contact_sheet.py .
```
- `--asr` 字母序列对不上的句子标 ✗（退出码 1）：按 pronunciation.md 的"字母"一节修改后重跑。
- 真实时长与预览不同，重新看一遍 sheet（慢放倍率也会变）。
- **通过标准：** `mix + srt written`；`字母读错的句子: 0`（无 GLM key 时 `ASR SKIPPED`，交付时列出含字母的句子请用户重点听）；截图检查通过。

### 第 11 步：打开预览并交付，再问要不要导出 MP4
```
- 不要调用 `open` 命令。把 `PROJ/index.html` 的虚拟路径告诉用户，请用户在浏览器中打开。
- `index.html` 在浏览器里直接播放（带配音和背景音乐）：点画面或空格 播放/暂停，拖进度条跳转，←/→ 快退/快进 5 秒；画面与导出的 MP4 一致。
- **打开预览的这条消息就是交付**：`PROJ/index.html`（直接播放）和 srt 路径、时长、各幕内容、答案；**说明你无法听音频，请用户试听读音**，列出你标注过读音的字和希腊字母。然后再问要不要导出。
- **MP4 是可选项，不要默认导出。** 用户在请求里已经明确要 MP4 文件（发给别人、上传）就直接导出；否则用 AskUserQuestion 问"要不要导出 MP4？"——"先不导出"（`index.html` 依赖项目文件夹里的文件，只能在这台电脑上看）/"导出 MP4"（约需视频时长的 2～3 倍，适合分享、上传、手机上看）。
- **用户选"先不导出"：任务结束。** 不再运行任何命令、不再重复交付内容，回一句"好的，index.html 就是成品，以后要 MP4 随时说"即可。
- 用户选导出：
  ```bash
  cd <PROJ> && node render.mjs video 6      # 6 = 并行浏览器页数（不是帧率！帧率固定 30）
  ```
  输出 `WS/<output_name>.mp4`；完成后只告诉用户 mp4 路径（前面说过的不再重复），结束。

## 常见错误

| 错误做法 | 正确做法 |
|---|---|
| 直接列公式算答案，不讲研究对象和过程分段 | 解题卡先行；幕结构 = 解题流程，分段判据单独一幕讲 |
| 摩擦力按"速度方向的反方向"画，物体反向后忘了改 | 按相对运动（趋势）方向；运动反向时让 f 箭头绕作用点转 180° |
| 物体位置用 `lerp(a, b, eio(...))` 滑过去 | `sPos(simT(lt, t0, dur, T))`：解析解 + 线性时间，屏幕注明"慢放 ×k" |
| 力箭头长度随手画，8 N 比 12 N 还长 | 一幕一个比例 `FS`，长度 = 大小 × FS |
| `Math.sin(37 * PI / 180)` | 课本近似 `SIN = 0.6, COS = 0.8`，与答案一致 |
| tts 写 `mg sinθ`、`sin i`、`μ = 0.5` | `重力沿斜面的分力` / `m g乘正弦西塔`、`正弦i`、`动摩擦因数零点五` |
| tts 里的单位省略或写 `m/s` | `十米每秒`、`二米每二次方秒`，单位一定要读 |
| 希腊字母写 `斐`、`伽马` | `菲`、`嘎马`（见 pronunciation.md 希腊字母表） |
| 板书用 `bl('v0^2 ...')` | `bm('v_0^2 / 2a_1 ...')` 渲染上下标 |
| 装置图画到右边板子上 | 缩小比例，或该幕 `ctx.translate` 左移（board/bm 在 translate 外） |
| 从别的视频文件夹复制代码 | 用 `new_video.sh` 从本技能 `template/` 建项目 |
| 编造 `GLM_MODEL`、接口地址 | 模型只有 `glm-tts`，地址已写在 build_audio.py；只需用户提供 `GLM_API_KEY` |
| `node render.mjs video 24` 以为是 24fps | 参数是并行数；预览版面用 `stills auto` |
| `--check` 还有 ⚠ 就调 TTS | 修到 0 |
| 渲染完不看画面就交付 | 每次都看 `build/sheet*.png` |

## 参考文件
- [reference/physics-solving.md](reference/physics-solving.md)：**物理解题方法**：六步流程、分段判据、sympy 验算、把解变成动画的要求、常见题型的幕结构。第 1 步必读。
- [reference/visual-design.md](reference/visual-design.md)：讲解动画设计：指→动→留→连、物理配色、物理→动画动作表、真实运动写法。写分镜前必读。
- [reference/animation.md](reference/animation.md)：engine.js + phys.js API、场景写法、版面坐标、题目图片与高亮框、审查清单。
- [reference/script-writing.md](reference/script-writing.md)：`script.json` 格式、幕的设计、物理式子/单位的口语写法对照表。
- [reference/pronunciation.md](reference/pronunciation.md)：读音控制、物理常见多音字、希腊字母读法。
- [reference/glm-tts-setup.md](reference/glm-tts-setup.md)：智谱 GLM-TTS 注册、API Key、`.env`、音色、兜底引擎。
- [reference/troubleshooting.md](reference/troubleshooting.md)：报错与处理。
