# 视频解析模块开发说明

## 背景

视频解析是一个独立资料处理模块，不属于 PPT 生成模块本身。它的目标是把用户上传或引用的视频资料转换成可检索、可引用、可对话、可供 Agent 二次创作的结构化资料。

后续 PPT、学习、研究、复习、会议纪要、知识库等模块都可以消费视频解析结果，但不应该直接依赖视频处理细节。

## 目标

- 支持用户上传视频并生成文字、章节、摘要、关键帧和可检索片段。
- 支持视频作为普通文档、聊天附件、Wiki/知识库来源进入系统。
- 给 Agent 提供统一读取接口，避免不同 Agent 分别实现视频解析逻辑。
- 保留来源边界：时间戳、帧截图、字幕片段、原始文件路径、解析版本。
- 支持长视频分段处理、断点续跑、后台任务进度和失败重试。

## 非目标

- 不在本模块里生成 PPT、笔记、报告或测验。
- 不让 Agent 直接操作 ffmpeg、ASR、OCR 等底层命令。
- 不要求第一版支持所有视频格式和所有字幕语言。
- 不把视频结果直接塞进聊天上下文全文；应通过摘要、检索和分段读取暴露。

## 关键依赖

为了让 AI Agent 在对话中准确理解视频，不能只依赖一个“视频总结”结果。推荐按以下层级建设依赖。

### 1. 媒体处理依赖

用于安全、稳定地读取视频元数据、抽取音频、截取关键帧。

- `ffmpeg` / `ffprobe`：视频探测、音频抽取、转码、截帧。
- 本地派生文件目录：保存音频、字幕、关键帧、OCR 结果和索引。
- 后台任务队列：长视频解析不能阻塞主进程和聊天。

Agent 不应直接调用这些命令。应由 `VideoIngestionService` 封装后提供结构化结果。

### 2. 语音理解依赖

用于把视频中的讲话内容变成可靠文本。

- ASR 引擎：本地 Whisper/faster-whisper、系统内置 ASR，或云端 ASR。
- 语言检测：判断中文、英文或混合语言。
- 字幕优先策略：如果视频已有字幕，优先使用字幕，再用 ASR 补缺。
- 时间戳对齐：每段转写必须保留 `start/end`，否则 Agent 无法引用来源。
- 可选说话人分离：会议、访谈、课堂问答场景需要区分 speaker。

准确性要求：

- ASR 结果要带置信度或至少保留低置信片段标记。
- 长视频必须按时间段分段转写。
- 不要把 ASR 文本直接视为绝对真相，后续需要和 OCR/关键帧/上下文交叉验证。

### 3. 画面理解依赖

用于理解视频画面里的幻灯片、板书、代码、软件界面和关键视觉信息。

- 关键帧抽取：按镜头变化、固定间隔、字幕主题变化抽帧。
- OCR：识别课件文字、屏幕文字、板书、代码片段。
- 画面摘要模型：可选，用于描述关键帧内容，例如“画面展示 OSI 七层模型结构图”。
- 图片存储和缩略图：便于 UI 展示和 Agent 引用。

准确性要求：

- OCR 结果必须绑定关键帧时间戳。
- 画面摘要要和原始帧路径一起保存，避免只保留模型描述。
- 对软件操作类视频，关键帧比普通摘要更重要。

### 4. 结构化理解依赖

用于把字幕和画面结果变成 Agent 能稳定消费的资料结构。

- 章节切分：按主题、时间、字幕语义或镜头变化切分。
- 片段摘要：每个章节/片段独立摘要，不能只生成全局摘要。
- 关键词/实体抽取：概念、术语、人名、产品、代码对象、时间地点。
- Evidence Map：把结论映射回字幕片段、关键帧和时间戳。

推荐中间产物：

```json
{
  "claim": "TCP 三次握手用于在双方传输数据前建立可靠连接。",
  "evidence": [
    {
      "type": "transcript",
      "start": 126.4,
      "end": 151.2,
      "text": "三次握手的目的，是确认双方收发能力正常..."
    },
    {
      "type": "frame",
      "timestamp": 139.8,
      "frameId": "frame_012",
      "ocrText": "SYN -> SYN/ACK -> ACK"
    }
  ],
  "confidence": "high"
}
```

### 5. 检索索引依赖

Agent 对话时通常不能一次读完整视频，必须能按问题检索。

- 全文索引：字幕、OCR、章节摘要。
- 向量索引：语义检索视频片段。
- 时间范围检索：按 `start/end` 读取片段。
- 混合检索：关键词 + 向量 + 时间戳。
- Source 引用：返回 `video_id`、章节、时间戳、关键帧路径。

对话中推荐流程：

```text
用户问题
  -> video_read(search)
  -> 命中相关章节/字幕/OCR
  -> video_read(clip/transcript/frames)
  -> Agent 基于证据回答，并给出时间戳
```

### 6. Agent 工具依赖

必须提供受控工具，而不是让 Agent 直接读派生文件。

- `video_read`：读取视频 overview、章节、字幕、关键帧、检索结果。
- `kb_search`：当视频进入 Wiki/知识库后，通过知识库检索召回片段。
- `file_read`：只用于普通派生文本或用户明确选择的非视频文件。
- 权限上下文：只能读取本轮对话、文档模块或 Wiki 中用户授权的视频。

`video_read` 是准确理解视频的关键接口。它应该返回“证据片段”，而不是只返回最终总结。

### 7. UI 和用户确认依赖

视频理解经常会有歧义，需要 UI 支持用户校正。

- 解析状态：未解析、解析中、部分成功、失败、已完成。
- 时间轴引用：点击回答里的时间戳能定位到视频片段。
- 字幕编辑/纠错：用户能修正 ASR 错字、专有名词、人名。
- 关键帧预览：用户能确认 Agent 引用的是正确画面。
- 资料范围选择：用户能明确选择哪些视频进入当前对话。

如果没有用户可见的引用和纠错入口，Agent 很难长期保持高可信。

## 准确性保障原则

Agent 准确理解视频依赖“可追溯证据”，不是依赖一次性总结。

必须满足：

- 每条重要结论能追溯到字幕时间戳、OCR 关键帧或用户确认内容。
- Agent 回答视频内容时，优先引用时间戳。
- 对低置信 ASR、模糊 OCR、看不清的画面，要明确说明不确定。
- 视频中没有出现的内容不能编造成视频结论。
- 联网资料只能作为补充背景，不能覆盖视频本身内容。
- 多个视频或多个资料冲突时，要保留冲突来源，不要强行合并。

推荐 Agent 回答格式：

```text
根据视频 12:04-13:18 的讲解，老师主要说明了三次握手的三个步骤：SYN、SYN/ACK、ACK。08:22 的关键帧中也出现了对应流程图。
```

不推荐：

```text
这个视频完整证明了 TCP 是可靠协议。
```

除非视频里确实有对应论证，并且能给出时间戳。

## 入口来源

视频可能从多个入口进入系统，但最终都应归一成同一种 `video_source` 记录。

| 入口 | 典型场景 | 处理方式 |
| --- | --- | --- |
| 文档模块上传 | 用户把课程录像、会议录屏、公开视频下载文件作为资料上传 | 作为文档资产入库，触发或等待视频解析 |
| 聊天附件上传 | 用户在对话里临时附加视频，让 Agent 解析 | 进入附件上下文，可选择保存到文档模块 |
| Wiki/知识库来源 | 用户把视频作为 Wiki source 或课程资料来源 | 解析结果进入 Wiki source 索引，支持引用 |
| 本地路径引用 | 用户选择工作区已有视频文件 | 只登记授权路径，不复制或按策略复制 |
| 未来云端链接 | 用户提供公开视频链接或云盘链接 | 先下载/转存为受控资产，再走统一解析 |

## 推荐架构

```text
UI 上传/选择
  -> AssetService / DocumentService
  -> VideoIngestionService
  -> 后台任务队列
  -> 视频基础信息探测
  -> 音频抽取
  -> ASR 转写
  -> 章节/主题切分
  -> 关键帧抽取
  -> OCR/画面文字识别
  -> 摘要与索引构建
  -> VideoReadTool / Wiki Search / Agent Context
```

建议新增服务边界：

- `VideoIngestionService`：创建解析任务、调度流水线、管理状态。
- `VideoAssetService`：管理视频原文件、派生音频、关键帧、缩略图、字幕文件。
- `VideoIndexService`：把字幕、OCR、章节摘要写入本地/云端索引。
- `video_read` 工具：给 Agent 读取视频解析结果，类似 `pdf_read` / `office_read`。

## 处理流水线

### 1. 资产登记

记录视频基本信息：

- `source_id`
- `document_id` 或 `wiki_source_id`
- `origin`: `document` / `attachment` / `wiki` / `local_path` / `remote_url`
- `file_path`
- `file_name`
- `mime_type`
- `size`
- `duration`
- `created_at`
- `hash`

### 2. 媒体探测

使用受控运行环境读取元数据：

- 时长
- 分辨率
- 帧率
- 音轨信息
- 字幕轨道
- 编码格式

第一版建议只支持常见格式：

- `.mp4`
- `.mov`
- `.mkv`
- `.webm`
- `.m4v`

### 3. 音频与字幕

优先级：

1. 内嵌字幕或外部字幕文件。
2. ASR 转写音频。
3. 无音频视频则进入关键帧/OCR 路径。

ASR 输出应保留时间戳：

```json
{
  "start": 12.4,
  "end": 18.9,
  "text": "这里讲的是 TCP 三次握手的第一步。",
  "speaker": "speaker_1",
  "confidence": 0.91
}
```

### 4. 章节切分

章节可以来自：

- 用户提供的目录/章节信息。
- 字幕语义切分。
- 镜头变化。
- 固定时间窗口 fallback。

章节结构：

```json
{
  "chapter_id": "ch_001",
  "title": "TCP 三次握手概览",
  "start": 0,
  "end": 184.2,
  "summary": "本章解释三次握手的目的、三个报文和连接建立过程。",
  "keywords": ["TCP", "三次握手", "SYN", "ACK"],
  "segments": ["seg_001", "seg_002"]
}
```

### 5. 关键帧与 OCR

关键帧用于：

- 课程板书/幻灯片画面。
- 会议共享屏幕。
- 软件演示步骤。
- 视频摘要封面。

关键帧记录：

```json
{
  "frame_id": "frame_001",
  "timestamp": 65.2,
  "image_path": "derived/video_x/frames/frame_001.jpg",
  "ocr_text": "OSI 七层模型",
  "scene_summary": "画面展示 OSI 七层模型结构图。",
  "linked_segments": ["seg_004"]
}
```

### 6. 摘要和索引

最终产物应分层保存：

- `overview`：视频整体摘要。
- `chapters`：章节摘要。
- `segments`：带时间戳的字幕/语义片段。
- `frames`：关键帧和 OCR。
- `entities`：人名、概念、术语、产品、地点。
- `tasks`：可选的待办/会议决议。

不要只保存一段长摘要，否则后续问答和引用会很弱。

## Agent 读取接口

建议新增 `video_read` 工具，而不是让 Agent 直接读派生 JSON 文件。

### 工具能力

```text
video_read(path/sourceId, mode)
```

建议模式：

- `overview`：返回视频元数据、整体摘要、章节列表。
- `transcript`：按时间范围或页段读取字幕。
- `chapters`：读取章节摘要和关键词。
- `frames`：列出关键帧、OCR 和图片路径。
- `search`：在视频字幕/OCR/摘要中检索。
- `clip`：读取某个时间段的结构化内容。

### 示例返回

```json
{
  "success": true,
  "sourceId": "vid_abc",
  "mode": "overview",
  "metadata": {
    "duration": 1840.5,
    "language": "zh-CN",
    "resolution": "1920x1080"
  },
  "summary": "这是一节关于计算机网络分层模型的课程录像。",
  "chapters": [
    {
      "title": "为什么需要分层",
      "start": 0,
      "end": 310.2
    }
  ],
  "next": {
    "mode": "transcript",
    "start": 0,
    "maxSeconds": 300
  }
}
```

## 和文档模块的关系

视频上传到文档模块后，可以在 `documents` 表或文档资产表中保持统一入口。

建议文档模块只负责：

- 文件登记。
- 类型识别。
- 用户选择/管理/删除。
- 展示解析状态。

视频解析模块负责：

- 派生文件。
- 后台任务。
- 字幕、章节、关键帧、OCR。
- 索引和读取接口。

文档模块中的视频状态建议：

```text
pending -> probing -> transcribing -> indexing -> ready
                    -> failed
                    -> partial
```

`partial` 表示视频部分解析成功，例如字幕成功但 OCR 失败，Agent 仍可使用可用部分。

## 和聊天附件的关系

聊天附件上传的视频有两种策略：

1. 临时附件：只在当前对话可用，过期后清理。
2. 保存为资料：转入文档模块或 Wiki source，长期可检索。

推荐默认：

- 小文件可作为临时附件解析。
- 长视频提示用户保存为资料并后台解析。
- Agent 读取时只看到授权的附件 source，不应该扫描未选择的视频。

## 和 Wiki/知识库的关系

视频作为 Wiki source 时，应把结果拆成可引用片段。

建议索引字段：

- `wiki_id`
- `source_id`
- `source_type = video`
- `chapter_id`
- `segment_id`
- `timestamp_start`
- `timestamp_end`
- `text`
- `ocr_text`
- `frame_path`
- `source_name`

Agent 回答时引用格式建议：

```text
来源：课程录像《计算机网络导论》 12:04-13:18
```

如果引用关键帧：

```text
来源：课程录像《计算机网络导论》关键帧 08:22
```

## 数据模型草案

### video_sources

```sql
CREATE TABLE video_sources (
  id TEXT PRIMARY KEY,
  document_id TEXT DEFAULT '',
  wiki_id TEXT DEFAULT '',
  wiki_source_id TEXT DEFAULT '',
  origin TEXT DEFAULT '',
  file_path TEXT NOT NULL,
  file_name TEXT DEFAULT '',
  mime_type TEXT DEFAULT '',
  hash TEXT DEFAULT '',
  duration REAL DEFAULT 0,
  width INTEGER DEFAULT 0,
  height INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  error TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

### video_segments

```sql
CREATE TABLE video_segments (
  id TEXT PRIMARY KEY,
  video_id TEXT NOT NULL,
  chapter_id TEXT DEFAULT '',
  start REAL DEFAULT 0,
  end REAL DEFAULT 0,
  text TEXT DEFAULT '',
  speaker TEXT DEFAULT '',
  confidence REAL DEFAULT 0,
  FOREIGN KEY (video_id) REFERENCES video_sources(id) ON DELETE CASCADE
);
```

### video_frames

```sql
CREATE TABLE video_frames (
  id TEXT PRIMARY KEY,
  video_id TEXT NOT NULL,
  timestamp REAL DEFAULT 0,
  image_path TEXT DEFAULT '',
  ocr_text TEXT DEFAULT '',
  scene_summary TEXT DEFAULT '',
  FOREIGN KEY (video_id) REFERENCES video_sources(id) ON DELETE CASCADE
);
```

### video_chapters

```sql
CREATE TABLE video_chapters (
  id TEXT PRIMARY KEY,
  video_id TEXT NOT NULL,
  title TEXT DEFAULT '',
  start REAL DEFAULT 0,
  end REAL DEFAULT 0,
  summary TEXT DEFAULT '',
  keywords TEXT DEFAULT '[]',
  FOREIGN KEY (video_id) REFERENCES video_sources(id) ON DELETE CASCADE
);
```

## 文件存储建议

派生文件不要散落在上传目录中，建议放在工作区受控目录：

```text
.reviva/
  derived/
    videos/
      {video_id}/
        metadata.json
        audio.wav
        transcript.json
        chapters.json
        frames/
          frame_001.jpg
        index.json
```

如果视频来自 Wiki/知识库，仍然可以复用同一派生目录，只在数据库里关联 `wiki_id/source_id`。

## 权限和安全

- 只解析用户明确上传或选择的视频。
- 不允许 Agent 通过路径猜测读取未授权视频。
- 派生文件路径必须走 VFS/权限校验。
- 删除原视频时，应按策略删除派生文件和索引。
- 远程链接下载需要用户确认，并限制文件大小、类型和来源。
- 对超大视频设置时长、大小、并发、磁盘占用限制。

## 后台任务

视频解析可能很慢，应走任务队列。

任务字段建议：

- `task_id`
- `video_id`
- `stage`
- `progress`
- `message`
- `started_at`
- `finished_at`
- `error`
- `retry_count`

阶段：

```text
probe
extract_audio
transcribe
split_chapters
extract_frames
ocr_frames
summarize
index
done
```

## 降级策略

- 没有 ASR：只做元数据、关键帧和用户已有字幕。
- 没有 OCR：保留关键帧，不生成画面文字。
- 长视频超限：先生成前 N 分钟预览摘要，提示后台继续。
- 解析失败：保留错误原因，允许重试。
- 部分成功：标记 `partial`，Agent 可以读取成功部分。

## Agent 使用原则

Agent 不应该直接说“我看完了视频”，除非实际调用了 `video_read` 或用户提供了已解析结果。

推荐提示原则：

- 先读 `overview`，再按需要读 `chapters` / `search` / `transcript`。
- 引用视频内容时带时间戳。
- 不编造视频中没有出现的讲者、结论、数据或画面。
- 视频内容和联网资料冲突时，说明冲突来源。
- 生成 PPT/笔记/测验时，优先使用视频解析结果，再用通用知识补充。

## 第一版建议范围

建议 v1 只做：

- 文档模块上传视频。
- 后台解析任务。
- 元数据探测。
- ASR 字幕。
- 章节切分。
- `video_read(overview/transcript/search)`。
- 和聊天附件上下文打通。

v2 再做：

- 关键帧抽取。
- OCR。
- Wiki source 深度集成。
- 时间戳引用 UI。
- 多视频聚合问答。

v3 再做：

- 远程视频链接。
- 说话人分离。
- 片段剪辑导出。
- 视频到课件/笔记/测验的一键工作流。

## 和 PPT Agent 的关系

PPT Agent 暂时不需要依赖这个模块。未来如果视频解析模块完成，PPT Agent 只需要把视频当作一种资料来源：

```text
video_read -> source brief -> slide outline -> HTML/PPTX/animation output
```

PPT Agent 不应关心 ASR、OCR、关键帧如何生成，只消费 `video_read` 或知识库检索返回的结构化内容。
