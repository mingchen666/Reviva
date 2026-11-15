# 报错与处理

| 现象 / 报错 | 原因 | 处理 |
|---|---|---|
| `ModuleNotFoundError: numpy`（或 requests / pypinyin） | 用错了 python | 用 `setup_check.sh` 报告的 PY；macOS 一般是 `/usr/bin/python3`；或 `PY -m pip install --user numpy requests pypinyin pillow` |
| `pron.py not found in this folder or any parent` | 工作区根目录没有 pron.py/pron.json | `ln -s SKILL/shared/pron.py SKILL/shared/pron.json WS/`（new_video.sh 会自动做） |
| 视频输出到了别的目录 | WS 设错了 | WS 必须是用户当前目录；删掉错放的项目，用 `new_video.sh "$PWD" 名字` 重建 |
| `ffmpeg not found` | 没装共享依赖 | `cd WS && npm install`（package.json 由 new_video.sh 生成） |
| `Cannot find package 'playwright'` | 同上，或项目不在 WS 下面 | 视频文件夹必须是 WS 的子目录；`cd WS && npm install` |
| `browserType.launch: Executable doesn't exist` | 没有 Chrome 也没有 Playwright Chromium | `cd WS && npx playwright install chromium` |
| `GLM_API_KEY is missing` | 没配 key | 见 glm-tts-setup.md，引导用户 |
| `TTS failed (401/403/400/429)` | 见 glm-tts-setup.md 报错表 | |
| `Resolve the pronunciation report before TTS` | 还有未固定读音 | 第 7 步，修到 0 |
| `json.decoder.JSONDecodeError`（script.json / episode.json） | 编辑工具把 JSON 的直引号 `"` 变成了中文弯引号 `“ ”`，或少了逗号 | 用 `PY -m json.tool script.json` 找行号；JSON 语法用的引号必须是英文 `"`（字符串内容里用中文引号没关系）；实在改不好就用 heredoc `cat > script.json <<'EOF'` 整个重写 |
| 题目图片里有 ☒ / □ 方框 | 字体缺符号 | 用最新的 make_problem_png.py（自动换字体）；截图题不会有这个问题 |
| `ERROR [...] tts text has 3 = ...` | tts 里有数字/符号 | 按 script-writing.md 对照表改成中文 |
| `ERROR [xxx] anim.js has no SC.xxx` | script.json 的幕 id 在 anim.js 里没有场景函数 | 加 `SC.xxx = (lt, S) => {...}`，或改幕 id 使两边一致 |
| `Preview-only timeline: generate real audio before exporting video.` | 最后一次跑的是 `--preview` | 先 `PY build_audio.py`（真实配音），再渲染视频 |
| `PAGE ERROR ...` / `FAILED: n page error(s)` | anim.js 有 JS 错误 | 看报错里的函数名/变量名，修 anim.js；`node --check anim.js` 可查语法错误 |
| 截图是空白或只有背景 | 场景函数开头就抛异常，或 `SC` 里的 id 与 timeline 不符 | 同上 |
| 字体不对（方块、默认黑体） | `fonts/` 目录没复制 | new_video.sh 会复制；手工补 `SKILL/template/fonts/` |
| 题目图片没显示 | 文件名不对 / 图片不在 PROJ | 检查 `PROBLEM.src` 和文件 |
| 高亮框位置整体偏移 | `srcW/srcH` 与图片真实尺寸不符 | `problem_boxes.py grid` 会打印真实尺寸 |
| 视频有画面没声音 | mix.wav 是旧的/预览模式 | 重跑 `PY build_audio.py` 再渲染 |
| 改了一句旁白，画面对不上 | 场景用了写死的秒数 | 全部改用 `S.at(k, f)` |
| 渲染很慢 | 正常：每帧都要截屏 | `node render.mjs video 8`（更多并行）；只在最后渲染一次视频 |
| `storyboard.md missing` / `storyboard 动 is empty` | 没写分镜或某句没有动作 | 第 6 步，按 visual-design.md 补上 |
| `motion` 报 STATIC / 某幕没有 MOVE | 图在这句里没变化 / 整幕只有出现没有运动 | 按分镜加"指"（glow+bump）和动作；见 visual-design.md 动作表 |
| 用户说某字读错 | TTS 猜错 | pronunciation.md 的"用户说某个字读错了" |
| 字幕折成 2~3 行、盖住图形 | 句子太长 | 拆成两句（`--check` 的 warn 会提示） |
| 字幕里出现 `HNO_3` 或下标没变 | engine.js 不是本技能的版本，或 chem.js 没加载 | 用本技能 template 的 engine.js + chem.js；index.html 里 `chem.js` 在 `engine.js` 之后、`anim.js` 之前 |
| 数字被错当成下标（如 `pH7`、`第2步`后跟字母） | 自动下标规则：字母 / `)` 后的数字变下标 | 在数字前加空格（`pH 7`），或该处 `mtx(..., {plain: true})` |
| 离子电荷显示成下标（`Fe3+` → Fe₃+） | 电荷没用 `^` | 写 `Fe^{3+}`、`SO4^{2-}` |
| `ERROR ... tts text has 3` 且句子里有化学式 | tts 里写了 `SO3`、`HNO3` | 换成中文名称（三氧化硫、硝酸），见 script-writing.md |
| `no molecule preset 'X'` | MOLS 里没有这个分子 | 在 anim.js 顶部 `MOLS.X = [['C', 0, 0], ['O', 1.2, 0], ...]` |
| 双线桥标签碰到左上角标签 | 桥太高 | 减小 `h`，或把这条桥放到方程式下方（`side: 1`） |
| `arrow is not a function` | 自己的代码里用 `arrow` 作变量名，遮住了 engine 的 `arrow()` | 改变量名 |
