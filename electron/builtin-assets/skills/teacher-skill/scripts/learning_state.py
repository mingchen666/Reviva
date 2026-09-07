"""
teacher-skill 学习状态持久化管理 (v2.1)

支持三个操作：
  --save <state.json>    保存当前学习状态（从 stdin 读取 JSON）
  --load <state.json>    读取学习状态并输出摘要
  --update <state.json> <json_patch>  更新指定字段
  --new <name>           创建新的学习会话（初始化状态）

状态文件存储在 teachers/{name}/learning-state.json
"""

import argparse
import json
import os
import tempfile
import sys
from datetime import datetime

# 默认写到系统临时目录，不写 Skill 目录（只读）。运行时应通过 --save/--load 参数指定实际输出路径。
STATE_DIR = os.path.join(tempfile.gettempdir(), "teacher-skill", "teachers")


def default_state(name="default"):
    """返回默认的学习状态结构。"""
    now = datetime.now().isoformat()
    return {
        "meta": {
            "name": name,
            "created_at": now,
            "updated_at": now,
            "version": "2.6.0"
        },
        "user": {
            "level": None,
            "familiar_fields": [],
            "learning_goal": "",
            "time_expectation": ""
        },
        "route": {
            "subject": "",
            "material_type": "",
            "total_units": 0,
            "units": []
        },
        "progress": {
            "status": "new",
            "current_unit_index": 0,
            "completed_units": [],
            "overall_percent": 0
        },
        "verification": {
            "checkpoints": [],
            "final_result": None
        },
        "review": {
            "last_check_at": None,
            "due_count": 0,
            "overdue": []
        }
    }


def load_state(path):
    """从文件加载学习状态，不存在则打印错误并返回None。"""
    if not os.path.exists(path):
        e = json.dumps({"error": "file not found: " + path})
        print(e)
        return None
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_state(path, state):
    """保存学习状态到文件，自动创建父目录。"""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    state["meta"]["updated_at"] = datetime.now().isoformat()
    with open(path, "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False, indent=2)
    print(json.dumps({"status": "saved", "path": path}))


def _build_completed_units_lines(progress):
    """构建已完成单元的文本行。"""
    lines = []
    for u in progress["completed_units"]:
        marks = {"pass": "P", "partial": "~", "fail": "X"}
        mark = marks.get(u.get("result"), "?")
        extra = ""
        if u.get("wrong_answers"):
            extra = " [错题: " + ", ".join(u["wrong_answers"]) + "]"
        lines.append("  " + mark + " " + u["name"] + extra)
    return lines


def _build_verification_lines(verification):
    """构建验证检查点的文本行。"""
    lines = []
    for cp in verification["checkpoints"]:
        phase = str(cp.get("phase", "?"))
        score = str(cp.get("score", "N/A"))
        lines.append("  Phase " + phase + ", 得分 " + score)
    return lines


def _build_review_lines(review):
    """构建复习相关的文本行。"""
    lines = []
    overdue = review.get("overdue", [])
    if not overdue:
        return lines
    lines.append("  到期复习:")
    for item in overdue[:3]:
        name = item.get("name", "?")
        days = str(item.get("days_ago", 0))
        lines.append("    - " + name + " (" + days + "天前学的)")
    if len(overdue) > 3:
        lines.append("    ... 还有 " + str(len(overdue) - 3) + " 个")
    return lines


def print_summary(state):
    """打印学习状态摘要到 stdout。"""
    meta = state["meta"]
    user = state["user"]
    progress = state["progress"]
    verification = state["verification"]
    review = state.get("review", {})

    completed = len(progress["completed_units"])
    total = state["route"]["total_units"]
    percent = progress["overall_percent"]

    lines = []
    level_map = {"beginner": "弱基础", "intermediate": "中等基础", "advanced": "强基础"}

    def add(key, val):
        lines.append(key + ": " + str(val))

    add("学习会话", meta["name"])
    add("状态", progress["status"])
    add("学科", state["route"].get("subject") or "未设置")

    if user.get("level"):
        add("能力等级", level_map.get(user["level"], user["level"]))

    if user.get("familiar_fields"):
        add("熟悉领域", ", ".join(user["familiar_fields"]))

    if total > 0:
        progress_text = str(completed) + "/" + str(total)
        progress_text += " 单元 (" + str(percent) + "%)"
        add("进度", progress_text)
        if completed > 0:
            lines.append("已完成单元:")
            lines.extend(_build_completed_units_lines(progress))

    if verification.get("checkpoints"):
        add("验证检查点", str(len(verification["checkpoints"])) + " 次")
        lines.extend(_build_verification_lines(verification))

    if verification.get("final_result"):
        passed = verification["final_result"].get("passed", False)
        add("最终验证", "通过" if passed else "待改进")

    if review.get("due_count", 0) > 0:
        add("待复习单元", str(review["due_count"]) + " 个")
        lines.extend(_build_review_lines(review))

    print("\n".join(lines))


def deep_merge(base, overlay):
    """递归合并两个字典，overlay 覆盖 base 中同名的键。"""
    for k, v in overlay.items():
        if k in base and isinstance(base[k], dict) and isinstance(v, dict):
            deep_merge(base[k], v)
        else:
            base[k] = v


def main():
    """CLI entry point: parse args and execute save/load/update/new."""
    parser = argparse.ArgumentParser(description="teacher-skill learning state manager")
    parser.add_argument("--save", metavar="PATH", help="save state from stdin")
    parser.add_argument("--load", metavar="PATH", help="load and print state summary")
    parser.add_argument("--new", metavar="NAME", help="create new learning session")
    parser.add_argument("--update", nargs=2, metavar=("PATH", "JSON"),
                        help="update state fields")

    args = parser.parse_args()

    if args.new:
        state = default_state(args.new)
        path = os.path.join(STATE_DIR, args.new, "learning-state.json")
        save_state(path, state)
        print_summary(state)

    elif args.save:
        try:
            state = json.loads(sys.stdin.read())
        except json.JSONDecodeError as e:
            print(json.dumps({"error": "JSON parse failed: " + str(e)}))
            sys.exit(1)
        save_state(args.save, state)

    elif args.load:
        state = load_state(args.load)
        if state:
            print_summary(state)

    elif args.update:
        path, json_patch = args.update
        state = load_state(path)
        if not state:
            sys.exit(1)
        try:
            patch = json.loads(json_patch)
        except json.JSONDecodeError as e:
            print(json.dumps({"error": "JSON parse failed: " + str(e)}))
            sys.exit(1)
        deep_merge(state, patch)
        save_state(path, state)

    else:
        parser.print_help()


if __name__ == "__main__":
    main()
