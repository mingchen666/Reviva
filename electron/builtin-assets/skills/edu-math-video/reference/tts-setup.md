# 配音引擎配置（GLM / 豆包 / MiniMax / 兜底）

两条流水线（手绘 `build_audio.py`、板书 `lesson/scripts/build.mjs`）共用技能里的 `shared/tts.py`：同一份 key、同一套缓存、同一套读音控制。**只需要用户提供 key（音色可选）**；接口地址、模型、参数都写在 `tts.py` 里，不要改，也不要编造。

## 选哪个引擎

| 引擎 | 需要 | 特点 | 音色变量（默认） |
|---|---|---|---|
| `glm` 智谱 GLM-TTS | `GLM_API_KEY` | 已长期使用，读音规则（pron.json）都是对它调出来的；**`--asr` 核对也用这个 key** | `GLM_VOICE`（chuichui） |
| `doubao` 豆包语音合成 2.0 | `DOUBAO_API_KEY` | 自然度高；**返回逐字时间戳**，板书模板的锚点 `at` 精确到字 | `DOUBAO_VOICE`（zh_male_youyoujunzi_uranus_bigtts） |
| `minimax` MiniMax T2A | `MINIMAX_API_KEY` | 音色多；**返回逐字时间戳** | `MINIMAX_VOICE`（Chinese_casual_instructor_nv1） |
| `edge` | `PY -m pip install --user edge-tts`（先问用户），免费、联网 | 兜底，微软非官方接口，可能失效 | `EDGE_VOICE`（zh-CN-XiaoxiaoNeural） |
| `say` | macOS 自带，离线 | 机械感明显，只适合预览 | `SAY_VOICE`（Tingting） |

**选择顺序**：命令行 `--tts` > 项目里记录的选择（手绘：`episode.json` 的 `"tts"`；板书：`lesson.json` 的 `meta.tts`）> `.env` 的 `TTS_ENGINE` > 自动（有 key 的第一个：glm → doubao → minimax，然后 edge、say）。

**一个 key 都没有时不会悄悄用兜底引擎**：自动选到 edge / say 时，配音脚本会停下，要求先问用户"填写 key（推荐），还是用系统自带的配音"，并提醒兜底**效果可能不太好**（机械感明显，断句和读音不如付费引擎）。用户选了兜底，就写进 `episode.json` 的 `"tts"` / `lesson.json` 的 `meta.tts`（或 `.env` 的 `TTS_ENGINE`），之后不再问。

查看当前会用哪个引擎、哪些 key 已配置（不显示 key 的值）：
```bash
PY SKILL/shared/tts.py info              # 或 --tts minimax 看指定引擎
```

## key 放在哪里

**只放在当前工作目录 `WS/.env`**（用户正在用的目录；视频文件夹在它下面，会自动找到）。没有全局配置文件。查找顺序：环境变量 > `WS/.env`。

**在第 0 步、动手做视频之前**就用 `PY SKILL/shared/tts.py check --tts <引擎>`（在 WS 下运行）检查；退出码 1 说明 key 没配，按这个流程（**不要跳过，不要自己去别处找 key**）：

1. 建 `.env`：
   ```bash
   bash SKILL/scripts/init_env.sh "$PWD" <引擎>      # glm | doubao | minimax
   ```
   它会在 `WS/.env` 写好所有引擎的空位（`GLM_API_KEY=`、`DOUBAO_API_KEY=`、`MINIMAX_API_KEY=`、默认音色、注释里的申请地址），已有的值一律不动、不打印；`chmod 600`；WS 是 git 仓库时把 `.env` 加进 `.gitignore`。
2. 告诉用户：`.env` 的完整路径、要填哪一行（如 `DOUBAO_API_KEY=` 等号后面）、去哪里申请（见下面对应引擎的"引导用户"）。**然后结束这一轮对话，等用户填好回来**，不要继续往下做，也不要轮询文件。
3. 用户说填好了：在 WS 下再跑 `PY SKILL/shared/tts.py check --tts <引擎>`，打印 `READY` 才继续；还是 `-` 就请用户检查（填在等号后面、没有多余空格或引号、保存了文件）。

规则：
- **让用户自己填 key**。如果用户直接把 key 发给你，可以替他写进 `WS/.env` 对应那一行，但不要在回复里复述 key，不要写进视频文件夹、脚本或任何会被分享的文件。
- **不要从别的项目目录拷贝或读取 `.env`**，也不要为了用到别处的 key 而把视频建在别的目录。
- 如果 `WS` 是 git 仓库，确认 `.gitignore` 里有 `.env`，没有就加上。

## 智谱 GLM-TTS

| 项 | 值 |
|---|---|
| 接口 | `POST https://open.bigmodel.cn/api/paas/v4/audio/speech`，`Authorization: Bearer <GLM_API_KEY>` |
| model | `glm-tts`（唯一可选值） |
| voice | `chuichui`（锤锤，默认）、`tongtong`（彤彤）、`xiaochen`（小陈）、`jam`、`kazi`、`douji`、`luodo`；也可以是复刻音色 id |
| 语速 | `GLM_SPEED`，默认 1.05 |
| 文本 | 最长 1024 字符；**没有** SSML/拼音输入，读音靠 `pron.py` 换同音字 |

引导用户：
> 1. 打开 https://bigmodel.cn 注册/登录。
> 2. 在 https://bigmodel.cn/usercenter/proj-mgmt/apikeys 点"添加新的 API Key"，复制。
> 3. 确认账户有余额或资源包。
> 4. 填进 `WS/.env` 里已建好的 `GLM_API_KEY=` 一行（可选改 `GLM_VOICE`），保存后回到对话。
> 5. （可选）去水印：控制台 个人中心 → 安全管理 → 去水印管理。

## 豆包语音合成（火山引擎）

| 项 | 值 |
|---|---|
| 接口 | `POST https://openspeech.bytedance.com/api/v3/tts/unidirectional`（HTTP Chunked） |
| 认证 | Header `X-Api-Key: <DOUBAO_API_KEY>`（新版控制台的 API Key）、`X-Api-Resource-Id: seed-tts-2.0` |
| 资源 | `DOUBAO_RESOURCE_ID`，默认 `seed-tts-2.0`（只能配 2.0 音色）；1.0 音色要改成 `seed-tts-1.0` |
| 音色 | `DOUBAO_VOICE`，2.0 音色 id 一般以 `_uranus_bigtts` 结尾，在火山引擎控制台的音色列表里复制 |
| 语速 | `TTS_SPEED`（倍数，默认 1.0）→ 换算成 `speech_rate`（-50~100） |

引导用户：在火山引擎控制台（新版，https://console.volcengine.com/speech/new ）开通"豆包语音合成模型 2.0"，创建 API Key，选一个 2.0 音色，填进 `WS/.env` 的 `DOUBAO_API_KEY=`（音色不同就改 `DOUBAO_VOICE`），保存后回到对话。

## MiniMax 语音合成

| 项 | 值 |
|---|---|
| 接口 | `POST {MINIMAX_API_HOST}/v1/t2a_v2`，非流式，`Authorization: Bearer <MINIMAX_API_KEY>` |
| 地址 | `MINIMAX_API_HOST`，默认 `https://api.minimax.cn`（官方文档的地址）；key 来自其他站点时按该站点文档改 |
| 模型 | `MINIMAX_MODEL`，默认 `speech-2.8-hd`（也可 `speech-2.8-turbo`、`speech-2.6-hd` 等） |
| 音色 | `MINIMAX_VOICE`，默认 `Chinese_casual_instructor_nv1`；文档里的中文音色还有 `male-qn-qingse`、`female-tianmei`、`female-chengshu`、`Chinese (Mandarin)_Lyrical_Voice`、`Chinese (Mandarin)_HK_Flight_Attendant`；全部音色见 MiniMax 文档的系统音色列表 |
| 语速 | `TTS_SPEED`（0.5~2，默认 1.0） |
| 字幕 | 自动开 `subtitle_enable` + `subtitle_type: word`，下载字幕文件得到逐字时间戳 |

注意：MiniMax 会把文本里的英文括号当成标记（`(he2)` 读音替换、`(laughs)` 语气词），`tts.py` 会自动把 `(` `)` 换成中文括号。

引导用户：在 https://platform.minimaxi.com 的 账户管理 → 接口密钥 创建 key，填进 `WS/.env` 的 `MINIMAX_API_KEY=`（可选改 `MINIMAX_VOICE`），保存后回到对话。

## 验证 / 试听

```bash
PY SKILL/shared/tts.py info
cd PROJ && PY build_audio.py --say "你好，我们来看一道数学题。" --tts doubao   # 手绘项目：生成 build/say_xxxx.wav
```
板书项目没有单独的试听命令：用 `--tts <引擎>` 正常构建一次，打开 `preview.html` 听。第一次给用户做视频时，把试听文件发给用户确认音色。

## 报错对照

| 现象 | 原因 | 处理 |
|---|---|---|
| `XXX_API_KEY is missing (TTS engine xxx)` | 选了这个引擎但没配 key | 按上面引导用户，或换引擎 |
| `GLM-TTS 401` / `doubao HTTP 401/403` / `minimax error 1004` | key 错误、过期、复制不全；MiniMax 也可能是 key 与 `MINIMAX_API_HOST` 站点不一致 | 请用户重新复制 key；检查 host |
| `GLM-TTS 403`、余额相关提示 | 账户欠费/没开通 | 请用户充值或开通服务 |
| `doubao error …`（提到 speaker / 音色） | `DOUBAO_VOICE` 写错，或与 `DOUBAO_RESOURCE_ID` 版本不匹配 | 2.0 音色配 `seed-tts-2.0`，1.0 音色配 `seed-tts-1.0` |
| `minimax error 2013` | 参数错误：音色或模型名写错 | 检查 `MINIMAX_VOICE` / `MINIMAX_MODEL` |
| `429`、`minimax error 1002/1039`、超时 | 频率限制 | 自动重试 4 次；还失败就等一会重跑（已合成的句子有缓存，不会重复计费） |
| 读音不对 | TTS 自己猜读音 | 见 pronunciation.md，改完只重合成那一句 |

## 换引擎 / 音色 / 语速

缓存文件名包含 引擎+音色+语速+文本，换任何一个都会重新合成全部句子（会产生费用，先告诉用户）。用了兜底引擎（edge/say）时，交付要告诉用户，并说明配好 key 后重跑配音和渲染即可替换。
