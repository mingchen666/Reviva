#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
skill_writer.py - 教学档案文件管理器

管理教师教学档案的创建、更新和列表功能。
参考 colleague-skill 的 skill_writer.py 设计，针对教师教学档案场景。

用法:
    python skill_writer.py list
    python skill_writer.py create --slug "wang-laoshi" --name "王老师" --subject "数学"
    python skill_writer.py update --slug "wang-laoshi"
"""

import argparse
import json
import os
import re
import shutil
import tempfile
import sys
from datetime import datetime, timezone


# ---------------------------------------------------------------------------
# 可选依赖：pypinyin（中文转拼音）
# ---------------------------------------------------------------------------
try:
    from pypinyin import lazy_pinyin

    _HAS_PYPINYIN = True
except ImportError:
    _HAS_PYPINYIN = False


# ---------------------------------------------------------------------------
# 常量
# ---------------------------------------------------------------------------

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
# 默认写到系统临时目录，不写 Skill 目录（只读）。运行时应通过 --output-dir 参数或 file_write 工具指定实际输出路径。
TEACHERS_DIR = os.path.join(tempfile.gettempdir(), "teacher-skill", "teachers")

VERSION_INITIAL = "1.0.0"


# ---------------------------------------------------------------------------
# SKILL.md 模板
# ---------------------------------------------------------------------------

SKILL_MD_TEMPLATE = """\
---
name: {name}
slug: {slug}
subject: {subject}
description: >
  {name}的教学档案：{subject}学科教学策略与风格。
  合并自 teaching-strategy.md 和 teaching-style.md。
version: {version}
created_at: {created_at}
updated_at: {updated_at}
---

# {name} - {subject}教学档案

## 基本信息

- **教师名称**：{name}
- **学科**：{subject}
- **档案标识**：{slug}
- **版本**：{version}

---

## 教学策略

> 以下内容来自 `teaching-strategy.md`

{teaching_strategy_content}

---

## 教学风格

> 以下内容来自 `teaching-style.md`

{teaching_style_content}

---

## 使用说明

1. 本档案由 `skill_writer.py` 自动生成和管理
2. 修改教学策略请编辑 `teaching-strategy.md`，然后运行更新命令
3. 修改教学风格请编辑 `teaching-style.md`，然后运行更新命令
4. 历史版本保存在 `versions/` 目录中
"""


# ---------------------------------------------------------------------------
# teaching-strategy.md 默认模板
# ---------------------------------------------------------------------------

TEACHING_STRATEGY_TEMPLATE = """\
# {name} - {subject}教学策略

> 创建时间：{created_at}
> 最后更新：{updated_at}

## 学科特点分析

- **学科类型**：待填写（理论型 / 实践型 / 理论+实践）
- **核心难点**：待填写
- **前置知识**：待填写
- **学习路径**：待填写

## 概念讲解策略

### 该学科的特殊讲解技巧
1. 待填写
2. 待填写
3. 待填写

### 常见误解及纠正

| 误解 | 纠正 |
|------|------|
| 待填写 | 待填写 |

## 分级教学重点

### 弱基础
- **重点**：待填写
- **方法**：待填写
- **避坑**：待填写

### 中等基础
- **重点**：待填写
- **方法**：待填写
- **避坑**：待填写

### 强基础
- **重点**：待填写
- **方法**：待填写
- **拓展**：待填写

## 练习题设计要点

- **基础题**：待填写
- **应用题**：待填写
- **综合题**：待填写
"""


# ---------------------------------------------------------------------------
# teaching-style.md 默认模板
# ---------------------------------------------------------------------------

TEACHING_STYLE_TEMPLATE = """\
# {name} - 教学风格档案

> 创建时间：{created_at}
> 最后更新：{updated_at}

## 风格速写

待填写（用一句话概括教学风格）

---

## 六维度分析

### 1. 句式结构
- **句子长度**：待填写
- **句式类型**：待填写
- **修辞手法**：待填写
- **口语化程度**：待填写

### 2. 词汇特征
- **高频词汇**：待填写
- **术语处理方式**：待填写
- **类比领域**：待填写
- **幽默类型**：待填写

### 3. 教学节奏
- **讲解密度**：待填写
- **互动频率**：待填写
- **重复策略**：待填写
- **过渡方式**：待填写

### 4. 互动模式
- **提问方式**：待填写
- **答对反馈**：待填写
- **答错反馈**：待填写
- **鼓励方式**：待填写

### 5. 内容组织
- **开场习惯**：待填写
- **结构偏好**：待填写
- **重点标记方式**：待填写
- **总结习惯**：待填写

### 6. 情感与态度
- **整体基调**：待填写
- **对难度的态度**：待填写
- **对错误的容忍度**：待填写
- **独特标签/口头禅**：待填写

---

## 模仿指南

### 必须做到
1. 待填写

### 风格边界
1. 待填写

### 禁止事项
1. 待填写
"""


# ---------------------------------------------------------------------------
# meta.json 模板
# ---------------------------------------------------------------------------

def make_meta(name, slug, subject, version=VERSION_INITIAL):
    """生成 meta.json 数据字典。"""
    now = datetime.now(timezone.utc).isoformat()
    return {
        "name": name,
        "slug": slug,
        "subject": subject,
        "version": version,
        "created_at": now,
        "updated_at": now,
        "files": [
            "SKILL.md",
            "teaching-strategy.md",
            "teaching-style.md",
            "meta.json",
        ],
    }


# ---------------------------------------------------------------------------
# 核心函数
# ---------------------------------------------------------------------------

def slugify(text):
    """
    将中文名称转换为 URL 友好的 slug。

    - 中文：尝试用 pypinyin 转拼音，失败则保留原始字符串
    - 英文：直接小写 + 连字符
    - 去除特殊字符，合并连续连字符

    Args:
        text: 输入文本（中文或英文）

    Returns:
        URL 友好的 slug 字符串
    """
    if not text:
        return ""

    text = text.strip()

    # 判断是否包含中文字符
    has_chinese = bool(re.search(r"[\u4e00-\u9fff]", text))

    if has_chinese:
        if _HAS_PYPINYIN:
            # 使用 pypinyin 转拼音
            parts = lazy_pinyin(text)
            text = "-".join(parts)
        # else: 保留原始字符串，后续统一处理

    # 统一处理：转小写，非字母数字替换为连字符
    text = text.lower()
    text = re.sub(r"[^a-z0-9\u4e00-\u9fff]+", "-", text)
    text = text.strip("-")

    # 合并连续连字符
    text = re.sub(r"-{2,}", "-", text)

    return text


def _ensure_teachers_dir():
    """确保 teachers/ 目录存在。"""
    os.makedirs(TEACHERS_DIR, exist_ok=True)


def _read_file_safe(filepath):
    """安全读取文件内容，文件不存在时返回空字符串。"""
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            return f.read()
    except (FileNotFoundError, IOError):
        return ""


def _write_file(filepath, content):
    """写入文件，自动创建父目录。"""
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(content)


def _archive_current_version(teacher_dir, version_str):
    """
    将当前版本的所有档案文件归档到 versions/ 目录。

    Args:
        teacher_dir: 教师档案目录路径
        version_str: 当前版本号

    Returns:
        归档目录路径，如果无需归档则返回 None
    """
    files_to_archive = ["SKILL.md", "teaching-strategy.md", "teaching-style.md", "meta.json"]
    versions_dir = os.path.join(teacher_dir, "versions")
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    archive_dir = os.path.join(versions_dir, f"v{version_str}-{timestamp}")

    # 检查是否有需要归档的文件
    has_files = any(os.path.exists(os.path.join(teacher_dir, f)) for f in files_to_archive)
    if not has_files:
        return None

    os.makedirs(archive_dir, exist_ok=True)

    for filename in files_to_archive:
        src = os.path.join(teacher_dir, filename)
        dst = os.path.join(archive_dir, filename)
        if os.path.exists(src):
            shutil.copy2(src, dst)

    return archive_dir


def _bump_version(version_str):
    """
    递增版本号的 patch 部分。

    Args:
        version_str: 当前版本号，如 "1.0.0"

    Returns:
        递增后的版本号，如 "1.0.1"
    """
    try:
        parts = version_str.split(".")
        if len(parts) != 3:
            return version_str + ".1"
        major, minor, patch = int(parts[0]), int(parts[1]), int(parts[2])
        return f"{major}.{minor}.{patch + 1}"
    except (ValueError, IndexError):
        return version_str + ".1"


def create_teacher_profile(slug, name, subject, strategy_content=None, style_content=None):
    """
    创建完整的教学档案目录结构。

    创建 teachers/{slug}/ 目录，写入以下文件：
    - SKILL.md（合并教学策略+教学风格的完整 Skill）
    - teaching-strategy.md
    - teaching-style.md
    - meta.json
    - versions/ 目录

    Args:
        slug: 教师 URL 友好标识
        name: 教师名称
        subject: 学科
        strategy_content: 自定义教学策略内容（可选，为 None 时使用默认模板）
        style_content: 自定义教学风格内容（可选，为 None 时使用默认模板）

    Returns:
        dict: 操作结果，包含 success、path、message 等字段
    """
    _ensure_teachers_dir()

    teacher_dir = os.path.join(TEACHERS_DIR, slug)

    # 检查是否已存在
    if os.path.exists(teacher_dir) and os.listdir(teacher_dir):
        return {
            "success": False,
            "error": f"教学档案已存在：{slug}",
            "path": teacher_dir,
            "message": "如需更新请使用 update 命令",
        }

    now = datetime.now(timezone.utc).isoformat()

    # 生成各文件内容
    if strategy_content is None:
        strategy_content = TEACHING_STRATEGY_TEMPLATE.format(
            name=name, subject=subject, created_at=now, updated_at=now
        )

    if style_content is None:
        style_content = TEACHING_STYLE_TEMPLATE.format(
            name=name, created_at=now, updated_at=now
        )

    skill_content = SKILL_MD_TEMPLATE.format(
        name=name,
        slug=slug,
        subject=subject,
        version=VERSION_INITIAL,
        created_at=now,
        updated_at=now,
        teaching_strategy_content=strategy_content.strip(),
        teaching_style_content=style_content.strip(),
    )

    meta = make_meta(name, slug, subject, VERSION_INITIAL)

    # 写入文件
    try:
        _write_file(os.path.join(teacher_dir, "SKILL.md"), skill_content)
        _write_file(os.path.join(teacher_dir, "teaching-strategy.md"), strategy_content)
        _write_file(os.path.join(teacher_dir, "teaching-style.md"), style_content)
        meta_json = json.dumps(meta, ensure_ascii=False, indent=2)
        _write_file(os.path.join(teacher_dir, "meta.json"), meta_json)

        # 创建 versions 目录
        versions_dir = os.path.join(teacher_dir, "versions")
        os.makedirs(versions_dir, exist_ok=True)

        return {
            "success": True,
            "slug": slug,
            "name": name,
            "subject": subject,
            "path": teacher_dir,
            "version": VERSION_INITIAL,
            "message": f"教学档案创建成功：{name}（{subject}）",
        }
    except IOError as e:
        return {
            "success": False,
            "error": str(e),
            "slug": slug,
            "message": f"创建教学档案失败：{e}",
        }


def update_teacher_profile(slug, strategy_content=None, style_content=None):
    # pylint: disable=too-many-locals
    """
    更新现有教学档案。

    流程：
    1. 先存档当前版本到 versions/
    2. 再更新文件（如果有提供新内容）
    3. 更新 meta.json 中的 version 和 updated_at

    Args:
        slug: 教师 URL 友好标识
        strategy_content: 新的教学策略内容（可选，为 None 时保留原文件）
        style_content: 新的教学风格内容（可选，为 None 时保留原文件）

    Returns:
        dict: 操作结果
    """
    teacher_dir = os.path.join(TEACHERS_DIR, slug)

    # 检查档案是否存在
    if not os.path.exists(teacher_dir):
        return {
            "success": False,
            "error": f"教学档案不存在：{slug}",
            "message": "请先使用 create 命令创建档案",
        }

    meta_path = os.path.join(teacher_dir, "meta.json")
    meta_content = _read_file_safe(meta_path)

    if not meta_content:
        return {
            "success": False,
            "error": f"meta.json 不存在或为空：{slug}",
            "message": "档案数据损坏，请重新创建",
        }

    try:
        meta = json.loads(meta_content)
    except json.JSONDecodeError as e:
        return {
            "success": False,
            "error": f"meta.json 格式错误：{e}",
            "message": "档案数据损坏，请重新创建",
        }

    # 归档当前版本
    current_version = meta.get("version", VERSION_INITIAL)
    archive_dir = _archive_current_version(teacher_dir, current_version)

    # 读取现有内容（用于重新生成 SKILL.md）
    strategy_path = os.path.join(teacher_dir, "teaching-strategy.md")
    style_path = os.path.join(teacher_dir, "teaching-style.md")

    current_strategy = _read_file_safe(strategy_path)
    current_style = _read_file_safe(style_path)

    # 如果提供了新内容则更新，否则保留原内容
    new_strategy = strategy_content if strategy_content is not None else current_strategy
    new_style = style_content if style_content is not None else current_style

    if not new_strategy:
        new_strategy = TEACHING_STRATEGY_TEMPLATE.format(
            name=meta.get("name", ""),
            subject=meta.get("subject", ""),
            created_at=meta.get("created_at", ""),
            updated_at=datetime.now(timezone.utc).isoformat(),
        )

    if not new_style:
        new_style = TEACHING_STYLE_TEMPLATE.format(
            name=meta.get("name", ""),
            created_at=meta.get("created_at", ""),
            updated_at=datetime.now(timezone.utc).isoformat(),
        )

    # 递增版本号
    new_version = _bump_version(current_version)
    now = datetime.now(timezone.utc).isoformat()

    # 重新生成 SKILL.md
    skill_content = SKILL_MD_TEMPLATE.format(
        name=meta.get("name", ""),
        slug=slug,
        subject=meta.get("subject", ""),
        version=new_version,
        created_at=meta.get("created_at", now),
        updated_at=now,
        teaching_strategy_content=new_strategy.strip(),
        teaching_style_content=new_style.strip(),
    )

    # 更新 meta
    meta["version"] = new_version
    meta["updated_at"] = now

    # 写入文件
    try:
        _write_file(os.path.join(teacher_dir, "SKILL.md"), skill_content)
        _write_file(strategy_path, new_strategy)
        _write_file(style_path, new_style)
        _write_file(meta_path, json.dumps(meta, ensure_ascii=False, indent=2))

        result = {
            "success": True,
            "slug": slug,
            "name": meta.get("name", ""),
            "subject": meta.get("subject", ""),
            "version": new_version,
            "previous_version": current_version,
            "path": teacher_dir,
            "message": f"教学档案更新成功：{meta.get('name', slug)}（v{current_version} -> v{new_version}）",
        }

        if archive_dir:
            result["archive_path"] = archive_dir

        return result

    except IOError as e:
        return {
            "success": False,
            "error": str(e),
            "slug": slug,
            "message": f"更新教学档案失败：{e}",
        }


def list_teachers():
    """
    列出所有已创建的教学档案。

    读取 teachers/ 目录，返回每个档案的 slug、名称、学科、创建时间。

    Returns:
        dict: 操作结果，包含 teachers 列表
    """
    _ensure_teachers_dir()

    teachers = []

    if not os.path.exists(TEACHERS_DIR):
        return {
            "success": True,
            "count": 0,
            "teachers": [],
            "message": "暂无教学档案",
        }

    for entry in sorted(os.listdir(TEACHERS_DIR)):
        entry_path = os.path.join(TEACHERS_DIR, entry)

        # 跳过非目录
        if not os.path.isdir(entry_path):
            continue

        # 读取 meta.json
        meta_path = os.path.join(entry_path, "meta.json")
        meta_content = _read_file_safe(meta_path)

        if meta_content:
            try:
                meta = json.loads(meta_content)
                teachers.append({
                    "slug": meta.get("slug", entry),
                    "name": meta.get("name", ""),
                    "subject": meta.get("subject", ""),
                    "version": meta.get("version", ""),
                    "created_at": meta.get("created_at", ""),
                    "updated_at": meta.get("updated_at", ""),
                })
            except json.JSONDecodeError:
                teachers.append({
                    "slug": entry,
                    "name": "",
                    "subject": "",
                    "version": "",
                    "created_at": "",
                    "updated_at": "",
                    "warning": "meta.json 格式错误",
                })
        else:
            teachers.append({
                "slug": entry,
                "name": "",
                "subject": "",
                "version": "",
                "created_at": "",
                "updated_at": "",
                "warning": "meta.json 不存在",
            })

    return {
        "success": True,
        "count": len(teachers),
        "teachers": teachers,
        "message": f"共 {len(teachers)} 个教学档案",
    }


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def cmd_list(_args):
    """处理 list 子命令。"""
    result = list_teachers()
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["success"] else 1


def cmd_create(args):
    """处理 create 子命令。"""
    slug = args.slug
    name = args.name
    subject = args.subject

    if not slug:
        print(json.dumps({
            "success": False,
            "error": "缺少必要参数 --slug",
            "message": "请提供 --slug 参数",
        }, ensure_ascii=False, indent=2))
        return 1

    if not name:
        print(json.dumps({
            "success": False,
            "error": "缺少必要参数 --name",
            "message": "请提供 --name 参数",
        }, ensure_ascii=False, indent=2))
        return 1

    if not subject:
        print(json.dumps({
            "success": False,
            "error": "缺少必要参数 --subject",
            "message": "请提供 --subject 参数",
        }, ensure_ascii=False, indent=2))
        return 1

    # 读取可选的内容文件
    strategy_content = None
    style_content = None

    if args.strategy_file:
        strategy_content = _read_file_safe(args.strategy_file)
        if not strategy_content:
            print(json.dumps({
                "success": False,
                "error": f"无法读取教学策略文件：{args.strategy_file}",
                "message": "请确认文件路径正确",
            }, ensure_ascii=False, indent=2))
            return 1

    if args.style_file:
        style_content = _read_file_safe(args.style_file)
        if not style_content:
            print(json.dumps({
                "success": False,
                "error": f"无法读取教学风格文件：{args.style_file}",
                "message": "请确认文件路径正确",
            }, ensure_ascii=False, indent=2))
            return 1

    result = create_teacher_profile(
        slug=slug,
        name=name,
        subject=subject,
        strategy_content=strategy_content,
        style_content=style_content,
    )

    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["success"] else 1


def cmd_update(args):
    """处理 update 子命令。"""
    slug = args.slug

    if not slug:
        print(json.dumps({
            "success": False,
            "error": "缺少必要参数 --slug",
            "message": "请提供 --slug 参数",
        }, ensure_ascii=False, indent=2))
        return 1

    # 读取可选的内容文件
    strategy_content = None
    style_content = None

    if args.strategy_file:
        strategy_content = _read_file_safe(args.strategy_file)
        if not strategy_content:
            print(json.dumps({
                "success": False,
                "error": f"无法读取教学策略文件：{args.strategy_file}",
                "message": "请确认文件路径正确",
            }, ensure_ascii=False, indent=2))
            return 1

    if args.style_file:
        style_content = _read_file_safe(args.style_file)
        if not style_content:
            print(json.dumps({
                "success": False,
                "error": f"无法读取教学风格文件：{args.style_file}",
                "message": "请确认文件路径正确",
            }, ensure_ascii=False, indent=2))
            return 1

    result = update_teacher_profile(
        slug=slug,
        strategy_content=strategy_content,
        style_content=style_content,
    )

    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["success"] else 1


def cmd_slugify(args):
    """处理 slugify 子命令（辅助工具）。"""
    text = args.text
    if not text:
        print(json.dumps({
            "success": False,
            "error": "缺少输入文本",
            "message": "请提供要转换的文本",
        }, ensure_ascii=False, indent=2))
        return 1

    result_slug = slugify(text)
    print(json.dumps({
        "success": True,
        "input": text,
        "slug": result_slug,
        "pypinyin_available": _HAS_PYPINYIN,
    }, ensure_ascii=False, indent=2))
    return 0


def main():
    """CLI 入口。"""
    parser = argparse.ArgumentParser(
        description="教学档案文件管理器 - 创建、更新和管理教师教学档案",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""\
示例:
  python skill_writer.py list
  python skill_writer.py create --slug "wang-laoshi" --name "王老师" --subject "数学"
  python skill_writer.py update --slug "wang-laoshi"
  python skill_writer.py update --slug "wang-laoshi" --strategy-file ./new-strategy.md
  python skill_writer.py slugify "王老师"
""",
    )

    subparsers = parser.add_subparsers(dest="command", help="可用命令")

    # list 命令
    list_parser = subparsers.add_parser("list", help="列出所有教学档案")
    list_parser.set_defaults(func=cmd_list)

    # create 命令
    create_parser = subparsers.add_parser("create", help="创建教学档案")
    create_parser.add_argument("--slug", required=True, help="教师 URL 友好标识（如 wang-laoshi）")
    create_parser.add_argument("--name", required=True, help="教师名称（如 王老师）")
    create_parser.add_argument("--subject", required=True, help="学科（如 数学）")
    create_parser.add_argument("--strategy-file", help="自定义教学策略文件路径（可选）")
    create_parser.add_argument("--style-file", help="自定义教学风格文件路径（可选）")
    create_parser.set_defaults(func=cmd_create)

    # update 命令
    update_parser = subparsers.add_parser("update", help="更新教学档案")
    update_parser.add_argument("--slug", required=True, help="教师 URL 友好标识")
    update_parser.add_argument("--strategy-file", help="新的教学策略文件路径（可选，不提供则保留原文件）")
    update_parser.add_argument("--style-file", help="新的教学风格文件路径（可选，不提供则保留原文件）")
    update_parser.set_defaults(func=cmd_update)

    # slugify 命令（辅助工具）
    slugify_parser = subparsers.add_parser("slugify", help="将名称转换为 URL 友好的 slug")
    slugify_parser.add_argument("text", help="要转换的文本")
    slugify_parser.set_defaults(func=cmd_slugify)

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        return 1

    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
