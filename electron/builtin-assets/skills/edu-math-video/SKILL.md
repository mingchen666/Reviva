---
name: edu-math-video
description: Use when asked to make an explainer / walkthrough video (讲解视频、解题视频、板书视频、例题精讲、微课) for a math problem (数学题, geometry, algebra, functions, motion/行程 problems), from a problem screenshot or text, with Chinese voice-over — delivered as a browser preview (HTML) first, MP4 export only if the user wants it. Five visual templates — hand-drawn canvas animation (bilingual zh+en subtitles) or one of four board styles (粉笔黑板 chalk / 几何实验室 lab / 白板 whiteboard / 方格本 notebook, auto-rotating 3D figures) — and a choice of TTS engine (智谱 GLM-TTS, 豆包 Doubao, MiniMax, or free edge-tts / macOS say).
version: 1.0.0
allowed-tools:
  - file_read
  - file_write
  - vision_analyze
  - exec_command
---

# 数学题讲解视频 (edu-math-video)

把一道数学题做成 16:9、1920×1080、带中文配音的讲解视频：**先生成能直接在浏览器里播放的网页预览，用户看过后再问要不要导出 MP4**。**五种画面模板、五种配音引擎可选**（配音在第 0 步定；板书风格自动选，预览页里可随时切换；只有导出 MP4 时才问用哪种风格）。

| 模板 | 画面 | 做法 | 适合 |
|---|---|---|---|
| `handdrawn` 手绘动画 | 手绘笔记本风 canvas 动画，中英双语字幕，背景音乐+音效 | 每题手写 `anim.js`，动作最自由（滑动重合、展开、拼接、动点） | 推理要靠"动"才看得懂的题、行程/动点、需要英文字幕 |
| `chalk` 粉笔黑板 | 黑板粉笔字、圈画强调、公式用 LaTeX（KaTeX）排版 | 写声明式 `lesson.json`，引擎自动排版 | 通用、老师讲题感 |
| `lab` 几何实验室 | 深色发光、步骤条、缓慢摆动的 3D 图 | 同上 | 高中立体几何、函数图像 |
| `whiteboard` 白板马克笔 | 白板、红色标签、便利贴提示 | 同上 | 初中 |
| `notebook` 方格本 | 方格纸、猫头鹰助教、印章 | 同上 | 小学、初一 |

四种板书模板共用 `lesson/` 引擎（同一份 lesson.json 随时切换风格），立体图自动旋转并实时计算虚实线。**板书模板比手绘快得多**（写几百行 JSON，而不是从零写动画），是默认推荐。

配音引擎（两种流水线共用 `shared/tts.py`，见 [reference/tts-setup.md](reference/tts-setup.md)）：`glm` 智谱 GLM-TTS（`GLM_API_KEY`）、`doubao` 豆包语音合成 2.0（`DOUBAO_API_KEY`，带逐字时间戳）、`minimax` MiniMax（`MINIMAX_API_KEY`，带逐字时间戳）、兜底 `edge`（免费）/ `say`（macOS 离线）。

## 文件与约定

- `lesson/`：板书模板引擎、构建脚本（`scripts/make.mjs`）、lesson.json 文档（`lesson/reference/`）和范例（`lesson/examples/`）。
- `template/` + `examples/cone-parallel/` + `scripts/`：手绘模板的项目模板、示例和工具。
- `shared/tts.py`（五种配音引擎）、`shared/pron.py` + `pron.json`（读音控制，两种模板共用）。
- 本技能自带全部代码，不要从别的项目复制文件。

## MindSpace 路径与执行规则

本 Skill 运行在 MindSpace 桌面端，通过 `exec_command` 工具执行命令。命令参数一律使用虚拟路径：

- `SKILL` = `/skills/edu-math-video/`（只读，本 Skill 目录）
- `WS` = 当前 Agent 的输出目录：`/agents/<当前Agent英文名>/outputs/<系统提供的真实日期>/`，视频文件夹建在这里，mp4/srt 也输出到这里
- `PROJ` = `WS/<ascii_folder_name>/`（本视频的项目文件夹）
- `PY` = `python`（MindSpace 内置 Python 环境；缺包时见下文依赖规则）

尖括号只用于说明路径结构。实际工具调用必须使用系统提供的真实 Agent 目录名和真实日期，不能把占位符原样写入。**不要因为别的目录已经有 `.env`、`node_modules`、`pron.json` 就把 WS 换过去。**

### 命令执行

- bash 脚本通过 `exec_command` 以 `cmd: "bash", args: ["/skills/edu-math-video/scripts/xxx.sh", ...]` 形式运行。
- Python 脚本通过 `cmd: "python", args: ["/skills/edu-math-video/scripts/xxx.py", ...]` 或 `cmd: "python", args: ["/skills/edu-math-video/shared/tts.py", ...]` 运行。
- 在 `PROJ` 下执行命令时，用 `cwd` 指定项目文件夹虚拟路径。
- 不要调用 `open`、`start` 等命令启动浏览器或 GUI；预览方式见各模板流程的交付步骤。

### 依赖与安装

本 Skill 依赖 Python 包（numpy、requests、pypinyin、pillow）和 Node 包（playwright、ffmpeg-static）。缺包时把需要的安装命令展示给用户，**等待用户明确确认后**才执行 `python -m pip install ...` 或 `npm install`。不要静默安装、不要自动切换解释器。脚本检测到缺包时只报告，不自动安装。

### 预览与交付

板书模板生成 `preview.html`，手绘模板生成 `index.html`，均写到 `PROJ`（即 WS 下的项目文件夹）。交付时把 HTML 的虚拟路径告诉用户，请用户在浏览器中打开。不要启动 localhost 服务。MP4 导出后同样把虚拟路径告诉用户。

## 通用规则

1. **退出码不是 0 就是没完成。** 检查报错、warnings、截图里有问题，都不能写"只是警告、不影响"然后继续。修好再往下走。
2. **API Key 只能由用户提供，只放在 `WS/.env`，在第 0 步就检查。** 所选引擎缺 key 时：`bash /skills/edu-math-video/scripts/init_env.sh "<WS>" <引擎>` 建好 `.env`，告诉用户填哪一行、去哪申请，**然后结束这一轮，等用户填好回来**（详见 [reference/tts-setup.md](reference/tts-setup.md#key-放在哪里)）。用户不想配，可以换已配置的引擎或兜底引擎。不要编造 key、模型名、音色或接口地址，不要把 key 打印出来或写进项目文件夹。
3. **先预览再花钱。** 两种模板都有不调 TTS 的预览模式，版面和读音没问题再生成真配音。
4. **看图验证，但先看拼图。** 截图审查先看一张拼图（`sheet.png`），有疑问再打开单张原图；汇报时写你实际看到了什么。能由程序报告的问题（文字出界、标签重叠）以命令输出为准，不必逐张找。
5. **命令输出只读汇总。** 构建脚本只打印问题和一行汇总，完整报告在文件里，需要时再看。
6. **MP4 是可选项，不要默认导出。** 生成网页预览（板书 `preview.html`、手绘 `index.html`）并打开给用户看之后，用 AskUserQuestion 只问"要不要导出 MP4？"，用户选导出才渲染（板书这时再问导出用哪种风格）。**交付内容（路径、时长、答案、请用户试听）在打开预览的那条消息里就说完**；用户选不导出，任务就此结束，不再跑命令、不再重复交付。用户在请求里已明确要 MP4 文件（要发给别人、上传）时才可以直接导出。
7. **板书里的公式一律写成 LaTeX（`$…$`）。** 根号、分数、上下标、向量、希腊字母都不要用纯文本符号（`4√3`、`x²`、`n₁`、`1/2`、`θ`）；构建会报 `公式请用 $…$` 并拒绝通过。

## 步骤

### 第 0 步：定配音，并确认配音 key 可用（最先做，未通过前不做别的）
**这一步通过之前不要读题解题、不要建项目、不要写 lesson.json / script.json 或任何代码**（`init_env.sh` 建的 `.env` 除外）。key 缺了就在这一步停下等用户，免得做完一大半才发现不能配音。**这一步不问画面风格**：风格在第 1 步自动定，预览页里可以随时切换，只有导出 MP4 时才问。

1. 在 WS 下跑 `python /skills/edu-math-video/shared/tts.py info`（读 `WS/.env`）：显示会用的配音引擎、哪些 key 已配置（只显示 set/-），以及用户保存的默认模板 `VIDEO_TEMPLATE`。
2. **定配音引擎。** 用户在请求里指定了，或 `.env` 有 `TTS_ENGINE`，或只配了一家的 key，就直接用，不要问。否则用 AskUserQuestion 问一个问题，推荐项放第一位并标注"（推荐）"：
   - 已配置 key 的引擎排前面并推荐；没配的也列出；最后是免费的 edge / say。
   - **一个 key 都没配**（`info` 里三个都是 `-`）时，选项就是："填写 key（推荐）"（选了再问用哪家）和"用系统自带的 say"（装了 edge-tts 时再加"用 edge-tts"）。兜底选项的说明里要写清**效果可能不太好**：机械感明显，断句和读音不如 GLM / 豆包 / MiniMax，只适合先看效果。
3. **检查 key：** `python /skills/edu-math-video/shared/tts.py check --tts <选定的引擎>`（在 WS 下运行）。
   - 打印 `READY` 且退出码 0：通过，进入第 1 步。
   - 退出码 1（缺 key）：`bash /skills/edu-math-video/scripts/init_env.sh "<WS>" <引擎>` 建好 `WS/.env`，告诉用户 `.env` 的完整路径、填哪一行、去哪申请（[reference/tts-setup.md](reference/tts-setup.md#key-放在哪里)），**然后结束这一轮**。用户回来说填好了，再跑一次 `check`，`READY` 才进入第 1 步；还不行就请用户检查（等号后面、没有多余空格或引号、已保存）。
4. 选定的引擎记下来，第 2 步起写进项目：手绘写 `episode.json` 的 `"tts"`，板书写 `lesson.json` 的 `meta.tts`（选了兜底更要写，否则配音脚本会停下要求再问）。
- 用户是被问了才选的：交付时顺带告诉用户，可以在 `WS/.env` 加 `TTS_ENGINE=<引擎>`，以后就不再问（`VIDEO_TEMPLATE=<模板>` 可固定模板/风格）。
- **通过标准：** 引擎已确定，且 `tts.py check --tts <引擎>` 打印 `READY`。

### 第 1 步：弄清题目，自己先把题解对，再定模板
- 拿到题目文字（有截图就先读图）。**先自己完整解一遍并验算**，写下：已知条件清单、所求、关键思路（1~2 个）、每一步计算、最终答案、验算方法。
- 答案不确定或题目看不清时，问用户，不要猜。
- **定模板（一般不问）：**
  - 用户在请求里指定了模板/风格，或 `.env` 有 `VIDEO_TEMPLATE`，就用它。
  - 否则默认用**板书**，风格按题自动选：小学/初一 `notebook`，初中 `whiteboard`，高中立体几何/函数 `lab`，其他 `chalk`。**不要问风格**——四种板书共用同一份 lesson.json，预览页右下角能即时切换；只有用户要导出 MP4 时才问用哪种（lesson-flow.md 的 L6）。
  - 只有推理非靠图形运动才讲得清（动点、行程、图形平移/旋转重合、展开拼接），或用户要英文字幕时，才用 AskUserQuestion 问一句"板书（推荐，快）/ 手绘动画（动作更自由，但制作慢得多）"。板书和手绘是两条流水线，换的话要重做，所以这一项必须在动手前定。
- **通过标准：** 你能用 3~6 个"幕"讲完，每一幕一句话说清目的；答案已验算；模板已定。

### 第 2 步起：按模板走对应流程
- 板书模板（chalk / lab / whiteboard / notebook）：**[reference/lesson-flow.md](reference/lesson-flow.md)**。
- 手绘模板（handdrawn）：**[reference/handdrawn-flow.md](reference/handdrawn-flow.md)**。
- 只读你选的那一份，另一份不用看。

## 参考文件
- [reference/tts-setup.md](reference/tts-setup.md)：五种配音引擎的 key、`.env`、音色、语速、报错处理。**引导用户配置时读这个。**
- [reference/lesson-flow.md](reference/lesson-flow.md)：板书模板流程；格式细节在 `lesson/reference/`。
- [reference/handdrawn-flow.md](reference/handdrawn-flow.md)：手绘模板流程（第 2~11 步、常见错误），以及它用到的 script-writing / pronunciation / visual-design / animation / troubleshooting。
