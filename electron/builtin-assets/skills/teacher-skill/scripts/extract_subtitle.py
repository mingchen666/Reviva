#!/usr/bin/env python3
"""
extract_subtitle.py - 从视频链接或本地文件中提取字幕/文字稿

支持的视频平台：
  - YouTube（通过 yt-dlp 提取内置字幕或自动生成字幕）
  - Bilibili（通过 yt-dlp 提取）
  - 其他 yt-dlp 支持的平台

支持的本地文件：
  - SRT 字幕文件
  - VTT 字幕文件
  - TXT 文字稿
  - ASS/SSA 字幕文件

用法：
  # 从 YouTube 链接提取字幕
  python extract_subtitle.py --url "https://www.youtube.com/watch?v=xxx"

  # 从 Bilibili 链接提取字幕
  python extract_subtitle.py --url "https://www.bilibili.com/video/BVxxx"

  # 从本地 SRT 文件提取
  python extract_subtitle.py --file subtitle.srt

  # 从本地 VTT 文件提取
  python extract_subtitle.py --file subtitle.vtt

  # 指定输出文件
  python extract_subtitle.py --url "https://youtube.com/watch?v=xxx" --output transcript.txt

  # 指定语言（默认尝试中文，然后英文）
  python extract_subtitle.py --url "https://youtube.com/watch?v=xxx" --lang zh

参数：
  --url       视频链接（YouTube/Bilibili/其他平台）
  --file      本地字幕/文字稿文件
  --output    输出文件路径（默认：stdout）
  --lang      首选字幕语言代码（默认：zh）
  --format    输出格式：txt（纯文本，默认）或 json（带元数据）
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys


def check_dependencies():
    """检查 yt-dlp 是否可用。"""
    try:
        subprocess.run(
            ["yt-dlp", "--version"],
            capture_output=True, check=True, text=True
        )
        return True
    except (FileNotFoundError, subprocess.CalledProcessError):
        return False


def _try_extract_subtitle(url: str, try_lang: str) -> dict | None:
    """尝试用指定语言提取字幕，成功返回结果dict，失败返回None。"""
    try:
        cmd = [
            "yt-dlp",
            "--write-auto-sub",
            "--sub-lang", try_lang if try_lang else "en",
            "--skip-download",
            "--sub-format", "vtt",
            "--convert-subs", "srt",
            "-o", "%(title)s.%(ext)s",
            url,
        ]

        result = subprocess.run(
            cmd,
            capture_output=True, text=True, timeout=120,
            cwd="/tmp/teacher-skills-subs",
            check=False,
        )

        if result.returncode == 0:
            text = _read_subtitle_file()
            if text and len(text.strip()) > 50:
                return {
                    "success": True,
                    "text": text,
                    "lang": try_lang or "auto",
                    "source": url,
                    "error": None,
                }
    except subprocess.TimeoutExpired:
        return None
    except OSError:
        return None
    return None


def _read_subtitle_file() -> str | None:
    """读取临时目录中的字幕文件，返回清洗后的文本，没有则返回None。"""
    for f in os.listdir("/tmp/teacher-skills-subs"):
        if f.endswith(".srt") or f.endswith(".vtt"):
            filepath = os.path.join("/tmp/teacher-skills-subs", f)
            try:
                with open(filepath, "r", encoding="utf-8") as fh:
                    raw_content = fh.read()
                text = clean_subtitle(raw_content)
                return text
            finally:
                try:
                    os.remove(filepath)
                except OSError:
                    pass
    return None


def extract_subtitle_from_url(url: str, lang: str = "zh") -> dict:
    """
    使用 yt-dlp 从视频链接提取字幕。

    返回 dict: {"success": bool, "text": str, "lang": str, "source": str, "error": str}
    """
    if not check_dependencies():
        return {
            "success": False,
            "text": "",
            "lang": "",
            "source": url,
            "error": "yt-dlp 未安装。请运行: pip install yt-dlp"
        }

    # 尝试提取字幕的语言优先级列表
    lang_list = [lang, "zh", "zh-Hans", "zh-CN", "en", "en-US", ""]

    for try_lang in lang_list:
        result = _try_extract_subtitle(url, try_lang)
        if result is not None:
            return result

    return {
        "success": False,
        "text": "",
        "lang": "",
        "source": url,
        "error": "无法提取字幕。视频可能没有字幕。建议手动上传课程字幕文件。"
    }


def clean_subtitle(raw: str) -> str:
    """
    清洗字幕内容，去除时间戳、编号等非内容信息。
    """
    lines = raw.strip().split("\n")
    cleaned = []

    for line in lines:
        line = line.strip()
        if not line:
            cleaned.append("")
            continue

        # 跳过纯数字行（SRT 序号）
        if re.match(r"^\d+$", line):
            continue

        # 跳过时间戳行（SRT: 00:00:00,000 --> 00:00:00,000）
        if re.match(r"^\d{2}:\d{2}:\d{2}[,\.]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[,\.]\d{3}", line):
            continue

        # 跳过 VTT 时间戳行
        if re.match(r"^\d{2}:\d{2}[\.:]\d{2}[\.:]\d{3}\s*-->", line):
            continue

        # 跳过 VTT 头部
        if line.upper() == "WEBVTT":
            continue

        # 跳过 NOTE 标签
        if line.startswith("NOTE"):
            continue

        # 去除 HTML 标签（如 <b>, <i>, <font>）
        line = re.sub(r"<[^>]+>", "", line)

        # 去除 ASS/SSA 格式标签
        line = re.sub(r"\{[^}]*\}", "", line)

        if line:
            cleaned.append(line)

    # 合并连续空行为单个空行
    result = []
    prev_empty = False
    for line in cleaned:
        if line == "":
            if not prev_empty:
                result.append("")
            prev_empty = True
        else:
            result.append(line)
            prev_empty = False

    return "\n".join(result).strip()


def read_local_file(filepath: str) -> dict:
    """
    读取本地字幕/文字稿文件。
    """
    if not os.path.exists(filepath):
        return {
            "success": False,
            "text": "",
            "lang": "",
            "source": filepath,
            "error": f"文件不存在: {filepath}"
        }

    try:
        with open(filepath, "r", encoding="utf-8") as f:
            raw = f.read()

        ext = os.path.splitext(filepath)[1].lower()
        text = clean_subtitle(raw) if ext in [".srt", ".vtt", ".ass", ".ssa"] else raw.strip()

        return {
            "success": True,
            "text": text,
            "lang": "unknown",
            "source": filepath,
            "error": None,
        }
    except OSError as e:
        return {
            "success": False,
            "text": "",
            "lang": "",
            "source": filepath,
            "error": f"读取文件失败: {e}",
        }


def main():
    """CLI entry point: parse args and output extracted subtitle text."""
    parser = argparse.ArgumentParser(
        description="从视频链接或本地文件中提取字幕/文字稿"
    )
    parser.add_argument("--url", help="视频链接（YouTube/Bilibili/其他平台）")
    parser.add_argument("--file", help="本地字幕/文字稿文件路径")
    parser.add_argument("--output", "-o", help="输出文件路径（默认输出到 stdout）")
    parser.add_argument("--lang", default="zh", help="首选字幕语言（默认：zh）")
    parser.add_argument("--format", choices=["txt", "json"], default="txt", help="输出格式")

    args = parser.parse_args()

    if not args.url and not args.file:
        parser.error("请提供 --url 或 --file 参数")

    # 确保临时目录存在
    os.makedirs("/tmp/teacher-skills-subs", exist_ok=True)

    # 提取字幕
    if args.url:
        result = extract_subtitle_from_url(args.url, args.lang)
    else:
        result = read_local_file(args.file)

    # 输出结果
    if args.format == "json":
        output = json.dumps(result, indent=2, ensure_ascii=False)
    else:
        if result["success"]:
            output = result["text"]
        else:
            output = f"错误: {result['error']}"
            sys.exit(1)

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(output)
        print(f"已保存到: {args.output}", file=sys.stderr)
    else:
        print(output)


if __name__ == "__main__":
    main()
