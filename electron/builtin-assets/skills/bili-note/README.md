# Bili Note

Bili Note 把 B 站已解析视频或图文/专栏整理成带证据的 Markdown 学习笔记。

## 架构边界

视频解析统一由 MindSpace 媒体模块完成：

- 字幕获取
- 语音转文字
- 时间轴
- 关键帧
- 解析状态和产物存储

Bili Note 通过只读 `media_read` 消费当前 Agent 已获授权的 `mediaId`。技能不安装、不配置也不运行 Qwen3-ASR、Whisper、Faster Whisper、FunASR、Python/CUDA 环境或模型缓存。

## 使用方式

### 已解析视频

1. 在 MindSpace 添加 B 站视频并完成媒体解析。
2. 把已登记的视频作为附件交给 Agent。
3. 要求 Agent 使用 Bili Note 整理、总结或生成学习笔记。

技能会先读 metadata，再搜索相关主题，分页读取 transcript，并按需读取关键帧。没有 `mediaId` 或解析未完成时，技能会提示用户先完成系统解析，不会自行下载音频或转写。

### Opus、动态和专栏

图文仍由技能脚本提取正文、图片、代码块和可选评论：

```powershell
python "/skills/bili-note/scripts/run_bili_note.py" `
  "https://www.bilibili.com/opus/1194341967364882439" `
  --work-dir ".\tmp_bili_opus" `
  --archive-dir "D:\knowledge\原始材料\O1194341967364882439" `
  --comments
```

## 辅助命令

检查图文/评论脚本与 B 站公开接口：

```powershell
python "/skills/bili-note/scripts/check_environment.py" --json
```

补充视频公开元数据和评论：

```powershell
python "/skills/bili-note/scripts/extract_bilibili.py" "BVxxxx" `
  --out ".\tmp_bili_context" `
  --comments
```

该视频脚本不下载字幕、音频或执行 ASR。

## 主要文件

- `SKILL.md`：Agent 工作流和笔记质量规则。
- `scripts/extract_bilibili.py`：视频公开元数据与评论。
- `scripts/extract_bilibili_opus.py`：图文正文、图片、代码块和评论。
- `scripts/run_bili_note.py`：图文一键提取与归档入口。
- `scripts/archive_bili_materials.py`：图文、评论和证据索引归档。
- `scripts/check_environment.py`：轻量环境与公开接口检查。
- `scripts/score_bili_note.py`：笔记预算与证据覆盖验收。
- `references/bilibili-api-notes.md`：B 站公开接口注意事项。

## 结果质量

最终笔记应区分：

- 带时间戳的转录证据；
- 带时间戳的画面证据；
- 评论或元数据；
- Agent 的综合推理。

证据不足时输出限定版笔记并说明覆盖范围，不把标题、目录、少量字幕或少量关键帧写成“完整提取”。
