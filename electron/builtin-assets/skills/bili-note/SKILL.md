---
name: bili-note
description: Turn Bilibili videos that are already registered and parsed in MindSpace, or Bilibili opus/article posts, into evidence-linked Markdown learning notes. Use whenever the user asks to 提取、提炼、总结、整理 B站/Bilibili 视频、课程、动态、图文或专栏，保存学习笔记，结合评论区补充观点，或从已解析视频中查找带时间戳的内容和关键画面。Video tasks require an authorized mediaId from the current attachment context; this skill never installs or runs its own ASR models.
allowed-tools: media_read, vision_analyze, exec_command, file_read, file_write
---

# Bili Note

把 B 站视频或图文内容整理成可检索、可复用、可回查证据的 Markdown 学习笔记。

视频内容统一由 MindSpace 媒体模块负责字幕、语音转录、时间轴和关键帧；本技能不下载视频音频，不安装或运行 Qwen3-ASR、Whisper、Faster Whisper、FunASR、Python/CUDA 环境或模型缓存。

## 两条工作路线

先判断输入属于哪一类，不要混用流程。

### 已解析视频

当前附件上下文必须提供 `mediaId`。视频 URL 或 BVID 本身不足以开始转录。

1. 用 `media_read(mediaId="<authorized mediaId>", mode="metadata")` 检查授权、解析状态、时长和可用模式。
2. 如果解析未完成、失败或没有 `mediaId`，停止内容提炼，告诉用户先在 MindSpace 中添加并解析视频。
3. 根据用户问题先用 `media_read(mediaId="<authorized mediaId>", mode="search", query="<主题>")` 定位主题，不要默认加载整段转录。
4. 用 `media_read(mediaId="<authorized mediaId>", mode="transcript")` 读取连续上下文；下一页传入上一页的 `nextCursor` 作为 `cursor`。长视频按主题和时间段取证。
5. 需要验证 PPT、代码、界面操作、板书或无解说画面时，用 `media_read(mediaId="<authorized mediaId>", mode="frames")` 获取候选关键帧，再按需交给 `vision_analyze`。
6. `chapters` 和 `artifacts` 只在 metadata 声明可用时读取。
7. 如用户要求评论区，可运行辅助脚本抓取评论；评论失败不影响基于系统媒体证据写笔记。
8. 写作时区分转录证据、画面证据、评论/元数据和 Agent 推理。

### Opus、动态与专栏图文

图文不是视频语音解析，继续使用脚本抓正文、图片、代码块和可选评论。

```json
{
  "cmd": "python",
  "args": [
    "/skills/bili-note/scripts/run_bili_note.py",
    "https://www.bilibili.com/opus/1194341967364882439",
    "--work-dir", ".\\tmp_bili_opus",
    "--archive-dir", "D:\\knowledge\\原始材料\\O1194341967364882439",
    "--comments"
  ]
}
```

脚本型能力要求 Agent 已绑定 `exec_command` 且允许执行 `python`。如果不可用，说明限制并让用户直接提供图文正文；不要声称已经提取或归档。

## 视频输入检查

### 没有 mediaId

明确告诉用户：

- 先在 MindSpace 中添加该 B 站视频；
- 在媒体解析配置中选择服务商并完成解析；
- 再把已登记的视频作为附件交给当前 Agent。

不要自行回退到下载音频或安装 ASR。

### 解析进行中或失败

转述 `media_read(mode="metadata")` 返回的状态和错误。解析进行中时让用户稍后重试；解析失败时让用户在媒体界面重试或调整服务商。

### 只有转录，没有画面

可以生成“基于转录的学习笔记”，但涉及视觉演示的判断要标记为未验证。

### 只有画面，没有转录

除非用户接受视觉限定结果，否则不要把少量关键帧写成完整视频总结。

## 取证策略

### 先搜索，再连续读取

- 用户指定主题时，先用 `search` 找命中段落。
- 需要理解论证链或操作过程时，再按命中时间附近调用 `transcript`。
- 使用 `startMs/endMs` 控制范围，并沿 `nextCursor` 分页。
- 不要为了“完整”一次性读取全部长视频，避免上下文被原始转录占满。

### 时间戳引用

转录证据尽量保留 `[HH:MM:SS-HH:MM:SS]`。没有时间戳时明确标记为纯文本转录，不自行推测时间。

### 画面证据

关键帧只证明对应时间点的可见内容。不要仅凭单帧推断完整操作过程；必要时读取相邻帧并结合转录。

### 评论区

只保留：

- 对原内容的纠错；
- 实践经验或失败案例；
- 有价值的问题与作者回复；
- 可验证的补充资料和替代方案。

过滤打卡、求资料、广告、情绪化争论和无关闲聊。

## 辅助脚本

### 检查图文/评论脚本环境

```json
{
  "cmd": "python",
  "args": ["/skills/bili-note/scripts/check_environment.py", "--json"]
}
```

该检查只验证 Python、B 站公开接口和图文/评论脚本，不检查任何 ASR、模型或 CUDA 环境。

### 获取视频元数据和评论

视频内容仍由 `media_read` 提供；该脚本只用于补充公开元数据和评论。

```json
{
  "cmd": "python",
  "args": [
    "/skills/bili-note/scripts/extract_bilibili.py",
    "BVxxxx",
    "--out", ".\\tmp_bili_context",
    "--comments"
  ]
}
```

### 图文一键提取与归档

```json
{
  "cmd": "python",
  "args": [
    "/skills/bili-note/scripts/run_bili_note.py",
    "https://www.bilibili.com/opus/1194341967364882439",
    "--work-dir", ".\\tmp_bili_opus",
    "--archive-dir", "D:\\knowledge\\原始材料\\O1194341967364882439",
    "--comments"
  ]
}
```

`run_bili_note.py` 不再处理视频 URL；视频应通过系统媒体解析路线进入。

## 写作前定标

根据证据量决定笔记规模，而不是让所有视频都输出相同长度。

- 短观点视频：重点还原问题、判断、论据和适用边界。
- 长课程：按学习模块组织概念、流程、实践和坑点，不按分 P 流水账压缩。
- 转录稀疏但视频很长：检查关键帧，无法补足视觉证据时明确限制。
- 图文：根据正文、图片、代码块、评论和证据索引决定粒度。

图文归档生成 `metadata/note_budget.json` 时先读取预算；视频路线根据 media metadata、实际读取的转录范围和视觉依赖自行定标。

## 推荐笔记结构

1. `# 标题`
2. `## 学完你应该获得什么`
3. `## 一句话总论`
4. `## 适用场景与前置知识`
5. `## 知识地图`
6. `## 核心概念卡`
7. `## 方法或流程`
8. `## 关键洞察与适用边界`
9. `## 实践清单`
10. `## 坑点、反例与评论补充`
11. `## 自测题`
12. `## 证据与原文位置`
13. `## 来源、覆盖与局限`

## 证据标注

正文使用简洁数字编号 `[1][2]`，在“证据与原文位置”中说明类型：

- 转录证据：媒体 ID、时间范围和短引用；
- 画面证据：关键帧时间戳和可见内容；
- 评论证据：评论 ID、作者和关键观点；
- 图文证据：归档证据 ID 和原文位置；
- Agent 推理：明确写成综合判断，不伪装成原作者原话。

## 不合格信号

- 用户只给视频 URL，却绕过系统媒体模块自行下载和转写。
- 没有 mediaId 或解析未完成，却声称已完整观看视频。
- 长视频一次性加载全部转录，导致上下文浪费。
- 把分 P 目录或评论罗列当成学习笔记。
- 字幕稀疏且缺少视觉验证，却声称完整解析。
- 不区分原文证据、评论观点和 Agent 推断。

## 相关文件

- `scripts/check_environment.py`：检查图文/评论辅助脚本和 B 站公开接口。
- `scripts/extract_bilibili.py`：抓取视频公开元数据和可选评论，不处理字幕、音频或 ASR。
- `scripts/run_bili_note.py`：图文/动态一键提取与归档；视频输入会提示改用系统媒体解析。
- `scripts/extract_bilibili_opus.py`：抓取图文正文、图片、代码块和评论。
- `scripts/archive_bili_materials.py`：归档图文与评论材料并生成证据索引。
- `scripts/score_bili_note.py`：验收归档型笔记的长度、压缩比和证据引用。
- `scripts/update_note_budget_section.py`：把图文归档预算和评分写回 Markdown。
- `references/bilibili-api-notes.md`：公开元数据、评论和图文接口注意事项。
