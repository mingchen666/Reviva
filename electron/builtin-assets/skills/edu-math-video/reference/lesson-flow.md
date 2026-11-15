# 板书模板流程（chalk / lab / whiteboard / notebook）

选了四种板书模板之一时，按本文件做（SKILL.md 的第 0 步定配音、第 1 步解题和定模板照常）。
`LESSON` = `SKILL/lesson`，`PROJ` = `WS/<ascii_folder_name>`（用户当前目录下的视频文件夹）。

与手绘模板的区别：不写 anim.js，而是写一个声明式的 `lesson.json`（讲稿 + 板书 + 图形动作），引擎自动排版、擦黑板、算立体图虚实线、转视角；字幕只有中文（逐字高亮），没有背景音乐；同一份 lesson.json 四种风格随时切换。

## L1. 环境

1. `LESSON/node_modules` 不存在 → **先问用户**，同意后在 `LESSON` 执行 `npm install`（playwright、katex、字体，约 100 MB，只装一次）。
2. 有 `ffmpeg`（系统安装，或工作区 `node_modules/ffmpeg-static`）；有 Chrome（没有就 `cd LESSON && npx playwright install chromium`）。
3. 配音 key 已在 SKILL.md 第 0 步用 `tts.py check` 确认过（`READY`）；没做就先回去做，key 不通过不要写 lesson.json。**不要打印或回显密钥。**

## L2. 写讲稿 `PROJ/lesson.json`

格式见 [../lesson/reference/lesson-schema.md](../lesson/reference/lesson-schema.md)，讲法见 [../lesson/reference/teaching-guide.md](../lesson/reference/teaching-guide.md)，图形见 [../lesson/reference/figures.md](../lesson/reference/figures.md)。完整范例：`LESSON/examples/prism-de/lesson.json`（高中立体几何，两问）、`examples/parabola`（函数图像）、`examples/triangle`（平面几何）。

- **先写 `intro`（开头读题）**：按原文分段，每个小问一段，`show` 照抄原文（公式用 `$…$`），`say` 读原文。格式见 lesson-schema.md 的"intro"一节。没有 intro 构建不通过。
- `meta.style` 写第 1 步自动选的风格（只是初始值，用户最后可以换），`meta.tts` 写选的配音引擎，`meta.problem` / `meta.answer` 记录题目和答案。
- 每小问一个 scene；scene 内按"审题 → 思路 → 板书 → 小结"组织 beats。
- 一个 beat = 一句口播（`say`）+ 这句话期间发生的动作（`do`）。动作用 `"at": "关键词"` 对齐到口播里的词。
- 板书每行 ≤ 22 个汉字左右；结论行用 `!!…!!` 并跟 `{"emph": "last"}`。
- **公式全部用 LaTeX `$…$`**（KaTeX 渲染）：`$B=(4\\sqrt3,-4,0)$`、`$\\vec n_1=\\vec{PC}\\times\\vec{PD}$`、`$\\cos\\theta=\\dfrac{|\\vec n_1\\cdot\\vec n_2|}{|\\vec n_1||\\vec n_2|}$`。只写点名/线段名时用 `{BC1}` 即可。JSON 里反斜杠要写两个（`\\sqrt`）。`say` 里不要放 `$…$`，根式、分数的读法写在 `speak`。细则见 lesson-schema.md 的"公式"一节。
- 需要空间想象时用 `cam` 动作转动视角（`"cam": "face"` 会自动选出正对某个面的最佳角度），讲完转回 `home`。
- 几何题作图坐标：直角顶点放原点、棱沿坐标轴、数值取第 1 步算出的真实值，这样图与题完全吻合。

## L3. 免费预览：版面 + 读音（不调 TTS）

```bash
node LESSON/scripts/make.mjs PROJ/lesson.json --preview
```
- 按估算时长构建无声的 `preview.html` 并截图，不花钱。
- 输出 JSON 的 `warnings`（锚点没找到、`读音未固定` 等）和 `layout` 必须清零，退出码 3 = 还有问题：
  - `overflow-x` / `overflow-y`：板书行太长 / 一页写不下 → 拆行、精简。
  - `label-overlap`（两个图形标签重叠）、`label-under-board` / `label-under-tip` / `label-under-caption`（标签被板书、提示框、字幕盖住）、`label-outside`（出画）→ 换 `camera.home` 或 `cam` 角度、调 `figure.zoom`、减少同时显示的线，或把 `tip` 挪到别的句子。这些是程序量出来的，不用靠看图找。
  - `读音未固定`：直接在 `say` 里给该字标音 `当[dāng]`（字幕会自动去掉标注）。
  - `公式请用 $…$（KaTeX）写`：把那一行的根号、分数、上下标、向量、希腊字母改成 LaTeX。
- 然后**只看拼图 `sheets`**（每张 12 帧，左上角是时间）：确认关键线清楚、旋转角度能说明问题、图与题意一致。拼图上看不清的那一帧再打开 `check/` 里的单张原图。完整报告在 `check/report.json`，一般不用读。

## L4. 真正配音 + 检查

```bash
node LESSON/scripts/make.mjs PROJ/lesson.json          # 真配音 + preview.html，不导出 MP4；--tts <引擎> 可临时覆盖 meta.tts
```
- `warnings` / `layout` 仍须为 0。板书内容和图形不随时长变化，所以**只要这两项为 0 就不用再看一遍拼图**；不为 0 时修完再看对应的那几帧。
- 每句配音按文本缓存在 `PROJ/build/tts/`，改了某句只会重新合成那一句。

## L5. 打开预览 + 交付，只问要不要导出 MP4

`open PROJ/preview.html`。**这一条消息就是交付**（用户选不导出就直接结束，不再补充），写清：
- `PROJ/preview.html` 已在浏览器打开：点画面或 ▶ 播放/暂停，拖进度条跳转，←/→ 快退/快进 5 秒，**右下角下拉框可即时切换四种板书风格**（只是看，不需要重建）；字幕文件 `PROJ/subtitles.srt`。
- 视频时长、当前风格、配音引擎（音色）、题目最终答案。
- **你无法听音频，请用户试听读音**，列出你标注过读音的字。

然后用 AskUserQuestion **只问一个问题**："要不要导出 MP4？"（**这里不问风格**）
- "不导出"：`preview.html` 就是成品，可以直接播放；但它依赖本机的技能字体和同目录的 `audio.wav`，**只能在这台电脑上看**。
- "导出 MP4"：需要大约视频时长 2～3 倍的时间，适合发给别人、上传平台、在手机上看。
- 用户在请求里已经明确要 MP4 文件 / 要发给别人 / 要上传，就不问，直接进 L6；说了只要预览就不问。

`make.mjs` 默认不导出 MP4，不要加 `--render`。想换成手绘模板则要按 handdrawn-flow.md 重做（先告诉用户要重做）。

## L6. 按回答收尾

- **不导出：任务结束。** 不再运行任何命令、不再检查、不再重复交付内容；回一句"好的，preview.html 就是成品，以后要 MP4 随时说"即可。
- **导出 MP4**：
  1. **先问导出用哪种风格**（AskUserQuestion）：当前风格放第一位标"（当前）"，其余三种列出，提醒可以先在预览右下角切换比较。用户在请求里已指定风格、或 `.env` 有 `VIDEO_TEMPLATE` 时不问，直接用。
  2. 选了别的风格：把 `lesson.json` 的 `meta.style` 改成新风格，然后
     ```bash
     node LESSON/scripts/make.mjs PROJ/lesson.json
     ```
     四种风格的板书区宽高不同，**预览里切换不会重新做排版检查**，所以必须重建一次：`warnings` / `layout` 为 0 才算通过（不为 0 就按 L3 修，再看对应的那几帧）。配音有缓存，不重新花钱，约一分钟。
  3. 渲染：
     ```bash
     node LESSON/scripts/render.mjs PROJ
     ```
     4 路并行渲染。完成后用 `ffprobe` 确认时长与分辨率（1920×1080），并抽 2～3 帧用 Read 查看。最后只告诉用户 `PROJ/video.mp4`、`PROJ/cover.png` 的路径和所用风格（L5 说过的不再重复），结束。

## 故障处理

| 现象 | 处理 |
|---|---|
| `XXX_API_KEY is missing` | 按 tts-setup.md 引导用户配置，或换引擎 |
| `TTS 失败（shared/tts.py 退出码 1）` | 看上方输出是哪一句、哪个错误码（tts-setup.md 报错表）；其余句子有缓存 |
| `找不到装了 requests + pypinyin 的 python` | `PY -m pip install --user requests pypinyin`，或 `PY=/path/to/python3 node ...` |
| `这是 --preview 构建（没有配音）` | 去掉 `--preview` 重新构建再渲染 |
| `锚点未找到` | 锚点词要逐字出现在 `say` 中（字母大小写一致），或改用数字秒数 |
| `overflow-x` | 该行太长：拆成两行或精简 |
| 标签重叠 / 图太挤 | 换 `camera.home` 角度、减少同时出现的辅助线、`figure.zoom` 调到 0.7 |
| 测试 | `cd LESSON && npm test`（编译器/图形/读法的单元测试） |
