# GLM-TTS 配置（智谱开放平台）

配音用智谱 **GLM-TTS**。调用代码已经写好在 `build_audio.py` 的 `tts()` 里，**只需要用户提供 API Key**（音色可选）。不要改接口地址、模型名，也不要换别的 TTS。

## 固定参数（已写在代码里，仅供核对）

| 项 | 值 |
|---|---|
| 接口 | `POST https://open.bigmodel.cn/api/paas/v4/audio/speech` |
| 认证 | Header `Authorization: Bearer <GLM_API_KEY>` |
| model | `glm-tts`（唯一可选值） |
| input | 要读的文本，**最长 1024 字符** |
| voice | `chuichui`（锤锤，默认）、`tongtong`（彤彤）、`xiaochen`（小陈）、`jam`、`kazi`、`douji`、`luodo`（动动动物圈系列）；也可以是用户的复刻音色 id |
| speed | 0.5 ~ 2，默认 1.0；本流水线用 1.05（`GLM_SPEED` 可改） |
| response_format | `wav`（返回 24kHz，代码会转成 48kHz 并去掉元数据） |
| watermark_enabled | `false`（只有用户在控制台开通了"去水印"才生效，否则仍带水印，不影响使用） |

**没有** SSML、拼音、音素、情感标签输入。行内拼音会被直接念出来，所以读音控制靠 `pron.py` 换同音字（见 pronunciation.md）。

## 引导用户配置（缺 key 时照这个跟用户说）

发给用户的话可以这样写（按需要改写）：

> 配音使用智谱 GLM-TTS，需要你的 API Key：
> 1. 打开 https://bigmodel.cn 注册/登录（手机号即可）。
> 2. 进入 https://bigmodel.cn/usercenter/proj-mgmt/apikeys ，点"添加新的 API Key"，复制它。
> 3. 确认账户有余额或可用资源包（TTS 按调用计费，价格以控制台为准）。
> 4. 打开我刚建好的 `<WS>/.env`（写出完整路径），把 key 填在 `GLM_API_KEY=` 等号后面，保存。
>    `GLM_VOICE` 可选：chuichui（锤锤，默认）、tongtong（彤彤，女声）、xiaochen（小陈，男声）等。
> 5. （可选）不想要 AI 水印：控制台右上角 个人中心 → 安全管理 → 去水印管理 → 打开开关。
>
> 填好告诉我，我先合成一句测试音给你听。

**流程**：先 `bash SKILL/scripts/init_env.sh "$PWD"` 在当前工作目录建好 `.env`（已有的值不动、不打印；chmod 600；git 仓库会把 `.env` 加进 `.gitignore`），再把上面这段话发给用户，**然后结束这一轮，等用户填好回来**，不要继续往下做。用户回来后跑 `setup_check.sh`，显示 `OK GLM_API_KEY` 才继续。

规则：
- **key 只放在当前工作目录 `<WS>/.env`**，没有全局配置文件。让用户自己填；如果用户直接把 key 发给你，可以替他写进 `<WS>/.env`，但不要在回复里复述 key，不要写进视频文件夹、脚本或任何会被分享的文件。
- 查找顺序：环境变量 `GLM_API_KEY` / `GLM_VOICE` / `GLM_SPEED` > `<WS>/.env`（项目往上最近的 `.env`）。
- **不要从别的项目目录拷贝或读取 `.env`**，也不要为了用到别处的 key 而把视频建在别的目录。
- 如果 `WS` 是 git 仓库，确认 `.gitignore` 里有 `.env`，没有就加上。
- 不要把 key 写死在 `build_audio.py` 里。

## 验证

```bash
bash SKILL/scripts/setup_check.sh PROJ                 # 应显示 OK GLM_API_KEY ... (value not shown)
cd PROJ && PY build_audio.py --say "你好，我们来看一道化学题。"
```
成功：`WROTE .../build/say_xxxxxxxx.wav`。把路径发给用户试听音色。

## 报错对照

| 现象 | 原因 | 处理 |
|---|---|---|
| `GLM_API_KEY is missing` | 没配 key | 按上面引导用户 |
| `TTS failed (401)` | key 错误/失效/复制不全 | 请用户重新复制 key |
| `TTS failed (403)` 或提示余额不足 | 账户欠费/无权限 | 请用户充值或检查资源包 |
| `TTS failed (400)` | 文本超长或参数错误；voice 名写错 | 检查 tts 文本长度（<1024）、`GLM_VOICE` 拼写 |
| `TTS failed (429)` / 连续超时 | 并发或频率限制 | 等一会重跑（已合成的句子有缓存，不会重复计费） |
| 读音不对 | TTS 自己猜读音 | 见 pronunciation.md，改完只重合成那一句 |

## 没有 GLM key 时：兜底引擎

`build_audio.py` 用 `TTS_ENGINE` 选择配音引擎（写在 `.env` 或环境变量里），默认 `auto`：有 `GLM_API_KEY` 用 GLM，否则装了 edge-tts 用 edge，否则在 macOS 上用 `say`。

**但自动选到兜底引擎时不会直接用**：配音脚本会停下，要求先问用户"填写 key（推荐），还是用系统自带的配音"，并提醒兜底**效果可能不太好**（机械感明显，断句和读音不如 GLM）。用户选了兜底，在 `<WS>/.env` 加 `TTS_ENGINE=say`（或 `edge`），之后不再问。

| 引擎 | 需要什么 | 音质 | 音色变量（默认） |
|---|---|---|---|
| `glm` | `GLM_API_KEY`（付费） | 最好，唯一支持 `--asr` 核对 | `GLM_VOICE`（chuichui） |
| `edge` | `PY -m pip install --user edge-tts`，联网；免费、无需 key（微软 Edge 朗读接口，非官方，可能失效） | 接近 GLM | `EDGE_VOICE`（zh-CN-XiaoxiaoNeural；男声 zh-CN-YunxiNeural） |
| `say` | macOS 自带，离线，什么都不用装 | 机械感明显，只适合预览/内部用 | `SAY_VOICE`（Tingting，其他中文音色读不了字母） |

- **装 edge-tts 前先问用户。**
- 语速都跟 `GLM_SPEED` 走。缓存按引擎+音色分开，换引擎会重新合成。
- 字母：GLM/edge 用空格分开（`P A B`）；`say` 的 Tingting 会吞掉空格分开的字母，所以 `say` 引擎自动改用顿号（`P、A、B`，ASR 实测逐个读对，代价是字母间有小停顿）。
- 没有 GLM key 时 `--asr` 会跳过（`ASR SKIPPED`）：交付时告诉用户字母读音没有机器核对。
- 用了兜底引擎，交付时要告诉用户用的是哪个引擎，以及配置 GLM key 后重跑第 10、11 步即可换成 GLM 配音。

## 换音色 / 语速

改 `.env` 的 `GLM_VOICE` 或 `GLM_SPEED`，重跑 `PY build_audio.py`。缓存文件名包含音色和语速，所以会全部重新合成（会产生费用，先告诉用户）。
