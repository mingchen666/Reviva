---
name: edu-chem-video
description: Use when asked to make an explainer / walkthrough video (讲解视频、解题视频、例题精讲、微课) for a chemistry problem (化学题: 氧化还原配平 双线桥 电子守恒, 物质的量计算, 化学平衡 三段式 平衡常数 转化率 反应速率, 离子反应, 电化学, 溶液 滴定, 工业流程), from a problem screenshot or text, with Chinese voice-over (GLM-TTS / 智谱 TTS), bilingual zh+en subtitles and chalkboard-style canvas animation built around the chemical equation — delivered as a browser preview (index.html) first, MP4 export only if the user wants it.
version: 1.0.0
allowed-tools:
  - file_read
  - file_write
  - vision_analyze
  - exec_command
---

# 化学题讲解视频 (edu-chem-video)

把一道化学题做成 16:9、1920×1080、带中文配音 + 中英双语字幕 + **黑板粉笔风格**动画的讲解视频（先给浏览器预览，用户要时再导出 MP4）。流水线与 edu-math-video / edu-physics-video 相同（配音、字幕、检查、渲染），区别在**解题方法**和**画面**：
- 解题：化学题的主线是"**守恒 + 以物质的量为中心**"：写对并配平方程式（电子守恒 → 原子守恒 → 电荷守恒）→ 找关系（系数比、守恒、关系式）→ 以 n 为中心计算 / 三段式 → 守恒复查。
- 画面：墨绿黑板 + 粉笔线；**顶部常驻方程式条**，下面左边演示、右边石板。化合价在数轴上升降、电子一组组长到相等、系数从电子行飞进方程式、原子计数条打 ✓、双线桥上电子流动、分子盒按系数比反应、三段式逐行填写。和数学（米色笔记本）、物理（深蓝蓝图）一眼能分开。

```
script.json ──build_audio.py──► build/timeline.json + build/mix.wav + ../<name>.srt
     (旁白)     (GLM-TTS + 合成音乐)          │
anim.js + chem.js + engine.js ◄───────────────┘ (按旁白时间点驱动动画)
     ├──open index.html ──► 浏览器直接播放（预览）
     └──node render.mjs video──► ../<name>.mp4（用户要时才导出）
```

**核心原则：方程式在讲题，守恒被"数"出来。** 每句旁白都有一个动作把这句化学推理演出来；所有比例、数量都从配平后的方程式取（系数飞出去成为比例 / 转化量）；每个动画用 `S.at(k, f)` 定时，绝不写死秒数。

**本技能自带全部代码**，不要从别的项目复制文件：
- `template/`：可直接运行的完整示例（铜与稀硝酸：标化合价 → 电子守恒配平 → 双线桥 → 物质的量计算 → 区分被还原的硝酸）。`engine.js` 通用引擎（黑板主题 + 方程式条版面，不改），`chem.js` 化学道具库（化学式自动下标、`equation`、`valence`、`bridge`、`eFlow`、`tally`、`molMap`、`iceTable`、`molecule`、`particles`、`beaker`、`graph`），`anim.js` / `script.json` / `episode.json` / `storyboard.md` / `problem.png` 每道题重写。
- `examples/equilibrium/`：化学平衡完整示例（三段式、分子盒按比例反应、c-t 曲线、K、转化率）。平衡 / 速率题先读它。
- `scripts/chem_check.py`：**零依赖的方程式配平与核对**（系数、原子 / 电荷守恒、摩尔质量），第 1 步必用。
- `shared/pron.py` + `shared/pron.json`：读音控制，已收录化学常见多音词（还原、反应、物质的量、足量、化合价、转化率……）和元素名。
- `scripts/`：另有 `new_video.sh`、`setup_check.sh`、`make_problem_png.py`（化学式、单位不会被折行拆开）、`problem_boxes.py`、`contact_sheet.py`。

## MindSpace 路径与执行规则

本 Skill 运行在 MindSpace 桌面端，通过 `exec_command` 工具执行命令。命令参数一律使用虚拟路径：

- `SKILL` = `/skills/edu-chem-video/`（只读，本 Skill 目录）
- `WS` = 当前 Agent 的输出目录：`/agents/<当前Agent英文名>/outputs/<系统提供的真实日期>/`，视频文件夹建在这里，mp4/srt 也输出到这里
- `PROJ` = `WS/<ascii_folder_name>/`（本视频的项目文件夹）
- `PY` = `python`（MindSpace 内置 Python 环境；缺包时见下文依赖规则）

尖括号只用于说明路径结构。实际工具调用必须使用系统提供的真实 Agent 目录名和真实日期，不能把占位符原样写入。**不要因为别的目录已经有 `.env`、`node_modules`、`pron.json` 就把 WS 换过去**。

### 命令执行

- bash 脚本通过 `exec_command` 以 `cmd: "bash", args: ["/skills/edu-chem-video/scripts/xxx.sh", ...]` 形式运行。
- Python 脚本通过 `cmd: "python", args: ["/skills/edu-chem-video/scripts/xxx.py", ...]` 运行。
- 在 `PROJ` 下执行命令时，用 `cwd` 指定项目文件夹虚拟路径。
- 不要调用 `open`、`start` 等命令启动浏览器或 GUI；预览方式见第 11 步。

### 依赖与安装

本 Skill 依赖 Python 包（numpy、requests、pypinyin、pillow）和 Node 包（playwright、ffmpeg-static）。缺包时把需要的安装命令展示给用户，**等待用户明确确认后**才执行 `python -m pip install ...` 或 `npm install`。不要静默安装、不要自动切换解释器。脚本检测到缺包时只报告，不自动安装。

### 预览与交付

`index.html` 直接写到 `PROJ`（即 WS 下的项目文件夹）。交付时把 `PROJ/index.html` 的虚拟路径告诉用户，请用户在浏览器中打开。不要启动 localhost 服务。MP4 导出后同样把虚拟路径告诉用户。

## 必须遵守的规则

**退出码不是 0 就是没完成。** `--check` 退出码 1（哪怕只剩一个 ⚠ 多音字）、`motion` 退出码 1、`chem_check.py check` 退出码 1、截图有问题，都要修好再往下走。

1. **严格按下面第 0~11 步顺序做，每步的"通过标准"满足了才能进入下一步。**
2. **先按化学方法解对题。** 第 1 步写出解题卡（反应类型、限量物质、配平过程、关系、计算、守恒验算），见 [reference/chemistry-solving.md](reference/chemistry-solving.md)；方程式必须用 `chem_check.py` 核对。
3. **先讲清楚题目。** 第一幕展示原题图片，旁白逐条读条件（"足量""标准状况""2 L 容器"都要读出来并框出）。
4. **`tts` 只能是能念出来的中文，化学式一律换成名称。** `HNO3` → 硝酸，`SO4^{2-}` → 硫酸根离子，`0.2 mol·L^{-1}` → 零点二摩尔每升，`+5` → 正五价（对照表见 [reference/script-writing.md](reference/script-writing.md)）。字幕 `zh` 照常写化学式（`Cu(NO3)2`、`Fe^{3+}`），会自动排成下标 / 上标。
5. **读音必须固定。** 调 TTS 之前 `--check` 必须显示 `未固定读音的生僻字/多音字: 0` 且 `script errors: 0`。标注写在字**后面**：`还[huán]原`、`盛[chéng]有`。
6. **API Key 只能由用户提供，在第 0 步就检查（`check_key.sh`）。** 缺 `GLM_API_KEY` 时**用 AskUserQuestion 问用户**："填写 key（推荐）"，还是"用系统自带的 say"（装了 edge-tts 时再加"用 edge-tts"）；兜底选项的说明里要写清**效果可能不太好**（机械感明显，断句和读音不如 GLM，见 [reference/glm-tts-setup.md](reference/glm-tts-setup.md#没有-glm-key-时兜底引擎)）。选填 key 就按 init_env.sh 流程等用户回来；选兜底就在 `<WS>/.env` 加 `TTS_ENGINE=say`（或 edge）。没有明确选择时配音脚本会停下要求先问。不要编造 key、模型名或接口地址，不要打印 key。
7. **化学画面必须正确。** 化合价、系数、双线桥的起止元素与电子数、单位、分子盒里的数量（写明每个分子代表多少 mol）都要与解题卡一致；颜色约定：失电子 / 升价蓝，得电子 / 降价红。
8. **版面**：方程式条 y 140~300（`eqStrip` + `equation(spec, 960, EQY)`）；演示区 x 60~900、y 310~860；石板用 `board()` + `bm()`（第 0~8 行）；一切在 y ≤ 860。
9. **先写分镜，再写动画**：`storyboard.md` 顶部写解题卡 + 图形清单，每句规划"指/动/留"，按 [reference/visual-design.md](reference/visual-design.md) 的化学动作表选动作；`node render.mjs motion` 必须通过。
10. **先预览再花钱**（`--preview` + `stills auto`），**看图验证**（每次都打开 `build/sheet*.png`，汇报你实际看到了什么）。
11. **不要修改 `engine.js`**；通用化学道具加在 `chem.js`，只属于这道题的图形写在 `anim.js`。不要把 `node_modules`、`package*.json` 复制进视频文件夹。

## 11 个步骤

### 第 0 步：先确认配音可用（最先做，未通过前不做别的）
**这一步通过之前不要解题、不要建项目、不要写任何文件**（`init_env.sh` 建的 `.env` 除外）——免得做完一大半才发现不能配音。
```text
bash /skills/edu-chem-video/scripts/check_key.sh "<WS>"
```
- 打印 `READY`（退出码 0）：进入第 1 步。
- `NOT READY`（退出码 1）：按它的提示用 AskUserQuestion 问用户——"填写 key（推荐）"，还是"用系统自带的 say（macOS）或 edge-tts"（说明里写清**效果可能不太好**：机械感明显，断句和读音不如 GLM）。选填 key：`init_env.sh` 建好 `.env`，告诉用户完整路径和要填的 `GLM_API_KEY=` 那一行，**然后结束这一轮**，用户回来再跑 `check_key.sh`；选兜底：在 `<WS>/.env` 加 `TTS_ENGINE=say`（macOS）或 `TTS_ENGINE=edge` 后再跑一次。
- **通过标准：** `check_key.sh` 打印 `READY`。

### 第 1 步：按化学方法解题，写解题卡
读 [reference/chemistry-solving.md](reference/chemistry-solving.md)。写下：反应类型与限量物质；方程式及配平过程（氧化还原：变价元素、升降数、最小公倍数）；已知量与所求量之间的关系（系数比 / 守恒 / 关系式）；以 n 为中心的每一步计算（单位带着）；平衡题的三段式；守恒验算与易错点。
```text
python /skills/edu-chem-video/scripts/chem_check.py balance "Cu + HNO3 -> Cu(NO3)2 + NO + H2O"
python /skills/edu-chem-video/scripts/chem_check.py check "3Cu + 8HNO3 = 3Cu(NO3)2 + 2NO + 4H2O"
```
- 题目看不清、产物不确定（浓 / 稀、量的多少）时问用户，不要猜。
- **通过标准：** 解题卡完整；`chem_check.py` 通过；能用 4~7 幕讲完。

### 第 2 步：建项目、查环境
```text
bash /skills/edu-chem-video/scripts/new_video.sh "<WS>" <ascii_folder_name>
bash /skills/edu-chem-video/scripts/setup_check.sh <WS>/<ascii_folder_name>
```
- `new_video.sh` 链接共享词表和已有的 `node_modules`；找不到才在 `WS` 下 `npm install`。python 包：`python -m pip install --user numpy requests pypinyin pillow（需用户确认后执行）`。
- 配音 key 已在第 0 步确认过；`setup_check.sh` 这里还报缺 key（比如用户后来改了 `.env`），就回到第 0 步处理。key 只放 `<WS>/.env`，不要去别的目录找。
- **通过标准：** `setup_check.sh` 输出 `ALL OK`。

### 第 3 步：测试 TTS
```bash
cd <PROJ> && python build_audio.py --say "你好，我们来看一道化学题。"
```
- **通过标准：** 生成了 wav（第一次给这个用户做视频时请用户试听音色）。

### 第 4 步：准备题目图片 `problem.png` 和高亮框
- **只有文字**：`python /skills/edu-chem-video/scripts/make_problem_png.py --text "完整题目" --mark "条件1" ... --out <PROJ>/problem.png`（化学式用 Unicode 下标 `HNO₃` 显示更好；小问前用换行）。
- **有截图**：`problem_boxes.py crop / grid / check`（见 [reference/animation.md](reference/animation.md#题目图片与高亮框)）。
- **通过标准：** 打开了 `*.preview.png` / `*.check.png`，文字完整，框准确。

### 第 5 步：写 `episode.json` 和 `script.json`
按 [reference/script-writing.md](reference/script-writing.md)。幕的顺序照解题流程：`intro` 读题 → 方程式 / 化合价 → 配平 → （双线桥）→ 计算 / 三段式 → （复查、易错点）→ `outro`。每句 ≤ 36 字宽，一句一件事，数值带单位。
- **通过标准：** JSON 合法；每一幕都有计划好的画面。

### 第 6 步：写分镜 `storyboard.md`
**先读 [reference/visual-design.md](reference/visual-design.md)**，按 `template/storyboard.md` 格式：顶部解题卡 + 图形清单（方程式、化合价、桥、计数、表格、分子盒……），再每句一行 `| 幕id 句号 | 旁白要点 | 指 | 动 | 留 | 板书 |`。"动"从化学动作表选，不能只写"出现/显示/高亮"。
- **通过标准：** 每句一行；每幕至少一个连续运动。

### 第 7 步：读音与脚本检查，修到 0
```bash
cd <PROJ> && python build_audio.py --check ; cat build/pron_report.txt
```
- 按 [reference/pronunciation.md](reference/pronunciation.md) 处理 ⚠（化学多音字表在里面）。
- **通过标准：** `未固定读音的生僻字/多音字: 0` 且 `script errors: 0`。

### 第 8 步：写 `anim.js`
先通读 `template/anim.js`，API 见 [reference/animation.md](reference/animation.md)（engine.js + chem.js 速查）。结构：`PROBLEM`、`TAGS`；**化学常量区**（方程式 spec、系数、用同样式子算出的数值，如 `const N_NO = N_CU * 2 / 3`）；`eqDraw()`；每幕 `SC.<id>`。
- 每幕：`eqStrip(1)` + 方程式（先 `{p: 0}` 取版面 → glow 提到的物质 → 正式画）；演示区做动作；`board()` + `bm()` 写板书；答案 `bbox` + `stamp`。
- **通过标准：** `--check` 无 ERROR。

### 第 9 步：免费预览：动作检查 + 版面检查
```text
cd <PROJ> && python build_audio.py --preview && node render.mjs motion && node render.mjs stills auto && python /skills/edu-chem-video/scripts/contact_sheet.py .
```
- `motion`：`STATIC` 必须修，每幕至少一句 `MOVE`。
- 打开 `build/sheet_*.png` 逐张检查（[审查清单](reference/animation.md#审查清单)）：不重叠、不出界、桥和化合价不撞标签；**化学正确**：化合价、系数、桥、电子数、单位、分子数量。
- **通过标准：** `motion check passed`；截图检查通过（逐幕说明你看到了什么）。

### 第 10 步：生成配音，自动听写核对，再检查一次画面
```text
cd <PROJ> && python build_audio.py && python build_audio.py --asr && node render.mjs stills auto && python /skills/edu-chem-video/scripts/contact_sheet.py .
```
- **通过标准：** `mix + srt written`；`字母读错的句子: 0`（无 GLM key 时 `ASR SKIPPED`，交付时说明）；截图检查通过。

### 第 11 步：打开预览并交付，再问要不要导出 MP4
```
- 不要调用 `open` 命令。把 `PROJ/index.html` 的虚拟路径告诉用户，请用户在浏览器中打开。
- `index.html` 在浏览器里直接播放（带配音和背景音乐）：点画面或空格 播放/暂停，拖进度条跳转，←/→ 快退/快进 5 秒；画面与导出的 MP4 一致。
- **打开预览的这条消息就是交付**：`PROJ/index.html`（直接播放）和 srt 路径、时长、各幕内容、答案；**说明你无法听音频，请用户试听读音**，列出标注过读音的字和化学名称。然后再问要不要导出。
- **MP4 是可选项，不要默认导出。** 用户在请求里已经明确要 MP4 文件（发给别人、上传）就直接导出；否则用 AskUserQuestion 问"要不要导出 MP4？"——"先不导出"（`index.html` 依赖项目文件夹里的文件，只能在这台电脑上看）/"导出 MP4"（约需视频时长的 2～3 倍，适合分享、上传、手机上看）。
- **用户选"先不导出"：任务结束。** 不再运行任何命令、不再重复交付内容，回一句"好的，index.html 就是成品，以后要 MP4 随时说"即可。
- 用户选导出：
  ```text
  cd <PROJ> && node render.mjs video 6      # 6 = 并行浏览器页数（不是帧率！帧率固定 30）
  ```
  输出 `WS/<output_name>.mp4`；完成后只告诉用户 mp4 路径（前面说过的不再重复），结束。

## 常见错误

| 错误做法 | 正确做法 |
|---|---|
| 方程式没配平（或凭印象配平）就开始算 | 先 `chem_check.py balance / check`，系数进 anim.js 常量区 |
| 配平只讲"观察法"，不讲为什么 | 氧化还原：标价 → 电子守恒定关键系数 → 原子守恒补全，每一步画出来 |
| tts 写 `HNO3`、`SO4^{2-}`、`mol/L` | 硝酸、硫酸根离子、摩尔每升 |
| 双线桥连了不同元素 / 方向反了 | 双线桥连**同种元素**，从反应物指向生成物；失电子蓝、得电子红 |
| 被还原的硝酸 = 参加反应的硝酸 | 分清作用：被还原的 n = 生成 NO 的 n；画 2 + 6 分流 |
| K 用了物质的量 | 三段式后先除以体积得平衡浓度，再代入 K |
| 分子盒数量随便画 | 写明每个分子代表多少 mol，数量与三段式一致，按系数比转化 |
| 离子电荷写 `Fe3+` | `Fe^{3+}`（否则 3 变成下标） |
| 双线桥标签撞到左上角标签 | 桥放到方程式下方（`side: 1`）或减小 `h` |
| 从别的视频文件夹复制代码 / 用物理或数学技能的 engine.js | 用本技能的 `new_video.sh` 建项目 |
| 编造 `GLM_MODEL`、接口地址 | 只需用户提供 `GLM_API_KEY` |
| `--check` 还有 ⚠ 就调 TTS | 修到 0 |
| 渲染完不看画面就交付 | 每次都看 `build/sheet*.png` |

## 参考文件
- [reference/chemistry-solving.md](reference/chemistry-solving.md)：**化学解题方法**：五步流程、守恒法 / 三段式 / 关系式 / 差量法、`chem_check.py`、把解变成画面的要求、常见题型的幕结构。第 1 步必读。
- [reference/visual-design.md](reference/visual-design.md)：讲解动画设计：黑板风格与版面、化学配色、化学 → 动画动作表。写分镜前必读。
- [reference/animation.md](reference/animation.md)：engine.js + chem.js API、版面坐标、题目图片与高亮框、审查清单。
- [reference/script-writing.md](reference/script-writing.md)：`script.json` 格式、幕的设计、化学式 / 离子 / 单位的口语写法对照表。
- [reference/pronunciation.md](reference/pronunciation.md)：读音控制、化学常见多音字。
- [reference/glm-tts-setup.md](reference/glm-tts-setup.md)：智谱 GLM-TTS 注册、API Key、音色、兜底引擎。
- [reference/troubleshooting.md](reference/troubleshooting.md)：报错与处理。
