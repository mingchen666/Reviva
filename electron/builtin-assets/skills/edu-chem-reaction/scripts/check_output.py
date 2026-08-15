#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Deterministically validate a generated chemistry-reaction HTML file."""

import json
import re
import shutil
import subprocess
import sys
from pathlib import Path


def _configure_utf8_streams() -> None:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except (AttributeError, OSError):
            pass


_configure_utf8_streams()


SKILL_DIR = Path(__file__).resolve().parent.parent
DATA_PREFIX = "const DATA = "
PLACEHOLDER = "__REACTION_DATA__"
LOCAL_HOST_RE = re.compile(r"(?:https?://)?(?:localhost|127\\.0\\.0\\.1)(?::\\d+)?", re.IGNORECASE)
REQUIRED_MARKERS = ("three.min.js", "katex.min.js", "cdn.tailwindcss.com", "canvas-container")
REQUIRED_DATA_KEYS = ("meta", "atoms", "bonds", "elementCounts", "steps")
INLINE_SCRIPT_RE = re.compile(r"<script(?![^>]*\\bsrc\\s*=)[^>]*>(.*?)</script>", re.IGNORECASE | re.DOTALL)


def _is_within(path: Path, parent: Path) -> bool:
    try:
        path.resolve().relative_to(parent.resolve())
        return True
    except ValueError:
        return False


def _extract_data(html: str) -> dict:
    start = html.find(DATA_PREFIX)
    if start < 0:
        raise ValueError("未找到反应数据岛 const DATA")

    payload = html[start + len(DATA_PREFIX):].lstrip()
    try:
        data, end = json.JSONDecoder().raw_decode(payload)
    except json.JSONDecodeError as exc:
        raise ValueError(f"反应数据不是有效 JSON: {exc.msg}") from exc

    if not payload[end:].lstrip().startswith(";"):
        raise ValueError("反应数据岛末尾缺少分号")
    if not isinstance(data, dict):
        raise ValueError("反应数据顶层必须是对象")
    return data


def validate(path: Path) -> str:
    path = path.expanduser().resolve()
    if not path.is_file():
        raise ValueError(f"输出文件不存在: {path}")
    if path.stat().st_size == 0:
        raise ValueError("输出文件为空")
    if _is_within(path, SKILL_DIR):
        raise ValueError("输出文件不能位于 Skill 目录")

    html = path.read_text(encoding="utf-8")
    if PLACEHOLDER in html:
        raise ValueError("模板数据占位符尚未替换")
    if LOCAL_HOST_RE.search(html):
        raise ValueError("输出文件不应依赖 localhost 或 127.0.0.1")
    missing_markers = [marker for marker in REQUIRED_MARKERS if marker not in html]
    if missing_markers:
        raise ValueError(f"输出缺少必要页面标记: {', '.join(missing_markers)}")

    data = _extract_data(html)
    missing_keys = [key for key in REQUIRED_DATA_KEYS if key not in data]
    if missing_keys:
        raise ValueError(f"反应数据缺少字段: {', '.join(missing_keys)}")
    if not isinstance(data["meta"], dict) or not data["meta"].get("title"):
        raise ValueError("反应数据缺少 meta.title")
    if not isinstance(data["atoms"], list) or not data["atoms"]:
        raise ValueError("反应数据必须包含至少一个原子")
    if not isinstance(data["bonds"], dict):
        raise ValueError("反应数据 bonds 必须是对象")
    return html


def _extract_inline_script(html: str) -> str:
    for script in INLINE_SCRIPT_RE.findall(html):
        if DATA_PREFIX in script:
            return script.strip() + "\n"
    raise ValueError("未找到包含反应数据的内联 JavaScript")


def _node_check(html: str, temp_module: Path) -> None:
    node = shutil.which("node")
    if not node:
        raise ValueError("未找到 Node；已完成 HTML 结构校验，但跳过增强语法检查")

    temp_module = temp_module.expanduser().resolve()
    if temp_module.suffix.lower() != ".mjs":
        raise ValueError("Node 校验临时文件必须使用 .mjs 扩展名")
    if _is_within(temp_module, SKILL_DIR):
        raise ValueError("Node 校验临时文件不能写入 Skill 目录")

    temp_module.parent.mkdir(parents=True, exist_ok=True)
    temp_module.write_text(_extract_inline_script(html), encoding="utf-8")
    result = subprocess.run(
        [node, "--check", str(temp_module)],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if result.returncode != 0:
        details = (result.stderr or result.stdout).strip() or "Node 未返回错误详情"
        raise ValueError(f"Node JavaScript 语法检查失败: {details}")


def main(argv: list[str]) -> int:
    if len(argv) not in {1, 3} or (len(argv) == 3 and argv[1] != "--node-check"):
        print("用法: check_output.py <reaction.html> [--node-check <temporary-module.mjs>]", file=sys.stderr)
        return 2
    html = validate(Path(argv[0]))
    if len(argv) == 3:
        _node_check(html, Path(argv[2]))
    print(f"OK: {Path(argv[0]).expanduser().resolve()}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except Exception as exc:
        print(f"error: {exc}", file=sys.stderr)
        sys.exit(1)
