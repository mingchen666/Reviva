#!/usr/bin/env python3
"""
track_progress.py - 追踪学习进度

用法：
  python track_progress.py --init --topic "机器学习" --total-units 10
  python track_progress.py --complete --unit 3 --concept "线性回归"
  python track_progress.py --status
  python track_progress.py --update-level --level intermediate

参数：
  --init            初始化一个新的学习会话
  --topic           学习主题
  --total-units     总学习单元数
  --complete        标记某个单元为已完成
  --unit            单元编号
  --concept         概念名称
  --score           （可选）该单元的得分 0-100
  --status          查看当前学习进度
  --update-level    更新用户能力等级
  --level           新的能力等级
  --file            进度文件路径（默认：.learning_progress.json）
"""

import argparse
import json
import os
import tempfile
import sys
from datetime import datetime


# 默认写到系统临时目录，不写当前工作目录。运行时应通过 --file 参数指定实际输出路径。
DEFAULT_PROGRESS_FILE = os.path.join(tempfile.gettempdir(), "teacher-skill", "learning_progress.json")


def load_progress(filepath: str) -> dict:
    """加载进度文件，不存在则返回空进度。"""
    if os.path.exists(filepath):
        with open(filepath, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"version": "1.0", "sessions": []}


def save_progress(progress: dict, filepath: str):
    """保存进度文件。"""
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(progress, f, indent=2, ensure_ascii=False)


def get_current_session(progress: dict) -> dict:
    """获取当前活跃的学习会话。"""
    sessions = progress.get("sessions", [])
    if not sessions:
        return None
    return sessions[-1]  # 最新一个会话


def init_session(topic: str, total_units: int,
                 filepath: str) -> dict:
    """初始化新的学习会话。"""
    progress = load_progress(filepath)

    session = {
        "topic": topic,
        "total_units": total_units,
        "started_at": datetime.now().isoformat(),
        "learner_level": "undetermined",  # beginner/intermediate/advanced
        "units": [],
        "completed_count": 0,
        "average_score": None,
        "status": "in_progress",
    }

    progress["sessions"].append(session)
    save_progress(progress, filepath)

    return {
        "success": True,
        "message": f"已创建学习会话：{topic}（共{total_units}个单元）",
        "session": session,
    }


def complete_unit(unit: int, concept: str, filepath: str,
                  score: int = None) -> dict:
    """标记某个学习单元为已完成。"""
    progress = load_progress(filepath)
    session = get_current_session(progress)

    if not session:
        return {"success": False, "message": "没有活跃的学习会话，请先初始化。"}

    # 检查是否已存在
    existing = next((u for u in session["units"] if u["unit"] == unit), None)
    if existing:
        existing["concept"] = concept
        existing["score"] = score
        existing["completed_at"] = datetime.now().isoformat()
    else:
        session["units"].append({
            "unit": unit,
            "concept": concept,
            "score": score,
            "completed_at": datetime.now().isoformat(),
        })
        session["completed_count"] = len(session["units"])

    # 计算平均分
    scored = [u["score"] for u in session["units"] if u["score"] is not None]
    if scored:
        session["average_score"] = round(sum(scored) / len(scored), 1)

    # 检查是否全部完成
    if session["completed_count"] >= session["total_units"]:
        session["status"] = "completed"
        session["completed_at"] = datetime.now().isoformat()

    save_progress(progress, filepath)

    return {
        "success": True,
        "message": f"单元 {unit}（{concept}）已完成" + (f"，得分：{score}" if score else ""),
        "progress": f"{session['completed_count']}/{session['total_units']}",
        "average_score": session["average_score"],
    }


def get_status(filepath: str) -> dict:
    """查看当前学习进度。"""
    progress = load_progress(filepath)
    session = get_current_session(progress)

    if not session:
        return {"success": False, "message": "没有活跃的学习会话。"}

    # 生成进度报告
    units_summary = []
    for u in session["units"]:
        score = u.get("score")
        if score is None:
            status_icon = "📝"
        elif score >= 80:
            status_icon = "✅"
        elif score >= 50:
            status_icon = "⚠️"
        else:
            status_icon = "❌"
        units_summary.append(
            f"  {status_icon} 单元{u['unit']}: {u['concept']}"
            + (f" (得分: {u['score']})" if u.get("score") is not None else "")
        )

    # 能力等级建议
    level_suggestion = None
    if session["average_score"] is not None:
        if session["average_score"] >= 80 and session["learner_level"] == "beginner":
            level_suggestion = "建议升级为 intermediate"
        elif session["average_score"] >= 80 and session["learner_level"] == "intermediate":
            level_suggestion = "建议升级为 advanced"
        elif session["average_score"] < 50 and session["learner_level"] == "advanced":
            level_suggestion = "建议降级为 intermediate"
        elif session["average_score"] < 50 and session["learner_level"] == "intermediate":
            level_suggestion = "建议降级为 beginner"

    return {
        "success": True,
        "topic": session["topic"],
        "status": session["status"],
        "learner_level": session["learner_level"],
        "progress": f"{session['completed_count']}/{session['total_units']}",
        "average_score": session["average_score"],
        "level_suggestion": level_suggestion,
        "units": units_summary,
        "started_at": session["started_at"],
    }


def update_level(level: str, filepath: str) -> dict:
    """更新用户能力等级。"""
    progress = load_progress(filepath)
    session = get_current_session(progress)

    if not session:
        return {"success": False, "message": "没有活跃的学习会话。"}

    old_level = session["learner_level"]
    session["learner_level"] = level
    save_progress(progress, filepath)

    return {
        "success": True,
        "message": f"能力等级已更新：{old_level} → {level}",
        "current_level": level,
    }


def main():
    """CLI entry point: parse args and execute the requested progress action."""
    parser = argparse.ArgumentParser(description="追踪学习进度")
    parser.add_argument("--init", action="store_true", help="初始化学习会话")
    parser.add_argument("--topic", help="学习主题")
    parser.add_argument("--total-units", type=int, help="总学习单元数")
    parser.add_argument("--complete", action="store_true", help="标记单元完成")
    parser.add_argument("--unit", type=int, help="单元编号")
    parser.add_argument("--concept", help="概念名称")
    parser.add_argument("--score", type=int, help="得分 0-100")
    parser.add_argument("--status", action="store_true", help="查看进度")
    parser.add_argument("--update-level", action="store_true", help="更新能力等级")
    parser.add_argument("--level", choices=["beginner", "intermediate", "advanced"])
    parser.add_argument("--file", default=DEFAULT_PROGRESS_FILE, help="进度文件路径")

    args = parser.parse_args()

    if args.init:
        if not args.topic or not args.total_units:
            parser.error("--init 需要 --topic 和 --total-units")
        result = init_session(args.topic, args.total_units, args.file)
    elif args.complete:
        if args.unit is None or not args.concept:
            parser.error("--complete 需要 --unit 和 --concept")
        result = complete_unit(args.unit, args.concept, args.file, args.score)
    elif args.status:
        result = get_status(args.file)
    elif args.update_level:
        if not args.level:
            parser.error("--update-level 需要 --level")
        result = update_level(args.level, args.file)
    else:
        parser.print_help()
        sys.exit(1)

    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
