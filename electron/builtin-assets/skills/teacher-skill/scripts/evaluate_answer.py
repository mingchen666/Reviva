#!/usr/bin/env python3
"""
evaluate_answer.py - 评估用户答案并生成反馈

用法：
  echo '{"answer": "用户答案", "expected": "期望答案", "level": "beginner"}' | python evaluate_answer.py
  python evaluate_answer.py --answer "用户答案" --expected "期望答案" --level "intermediate"

参数：
  --answer     用户的回答
  --expected   期望的正确答案（或关键要点）
  --level      用户等级：beginner / intermediate / advanced
  --concept    （可选）当前概念，用于个性化反馈
"""

import argparse
import json
import sys


# 反馈模板
FEEDBACK_TEMPLATES = {
    "correct": {
        "beginner": [
            "完全正确！你理解得很到位。",
            "对！就是这个意思，你学得很快。",
            "没错！看来你已经掌握了{concept}的核心。",
        ],
        "intermediate": [
            "正确。你对{concept}的理解很准确。",
            "对，而且你的表述很清晰。",
            "完全正确。你已经能准确描述{concept}了。",
        ],
        "advanced": [
            "正确。你的理解很深入。",
            "对，而且你能抓住关键点。",
            "准确。看来你已经内化了{concept}的核心思想。",
        ],
    },
    "partially_correct": {
        "beginner": [
            "方向对了！但还差一点。{concept}的核心其实是{key_point}。",
            "差不多！不过更准确地说，{correction}。",
            "你说的有一部分是对的，但{hint}。",
        ],
        "intermediate": [
            "部分正确。你理解了{correct_part}，但{missing_part}还需要注意。",
            "方向对了，但不够完整。{concept}还包括{missing_point}。",
            "你抓住了重点，但{correction}。",
        ],
        "advanced": [
            "部分正确。你提到了{correct_part}，但{missing_part}同样重要。",
            "思路对，但分析不够深入。{hint}。",
            "方向正确，但{correction}。",
        ],
    },
    "incorrect": {
        "beginner": [
            "没关系，这个确实容易搞混。让我换一种方式再解释一下：{reexplanation}",
            "这个回答不太对，但很常见。{concept}其实是这样的：{hint}",
            "别担心，我们再来看看{concept}。想象一下：{analogy}",
        ],
        "intermediate": [
            "不太对。{concept}的关键在于{key_point}，而不是{misconception}。",
            "这个理解有偏差。让我帮你理清：{correction}",
            "不完全是。{concept}的核心是{key_point}。我们再回顾一下...",
        ],
        "advanced": [
            "这个理解有误。{concept}的本质是{key_point}，你的理解忽略了{missing}。",
            "不正确。需要区分{misconception}和{actual}。",
            "这个分析有问题。{correction}",
        ],
    },
}


def evaluate_answer(answer: str, expected: str, level: str,
                    concept: str = "") -> dict:
    """
    评估用户答案。

    注意：此脚本提供评估框架和反馈模板。
    实际的语义匹配（判断答案正确性）由 AI 在对话中完成。
    AI 应调用此脚本获取反馈模板，然后根据实际判断结果填充。
    """
    level = level.lower()

    if level not in list(FEEDBACK_TEMPLATES.values())[0]:
        raise ValueError(f"不支持的等级: {level}，可选: {list(list(FEEDBACK_TEMPLATES.values())[0].keys())}")

    return {
        "answer": answer,
        "expected": expected,
        "level": level,
        "concept": concept,
        "evaluation": {
            "note": "由 AI 判断答案正确性：correct / partially_correct / incorrect",
            "possible_results": ["correct", "partially_correct", "incorrect"],
        },
        "feedback_templates": {k: v[level] for k, v in FEEDBACK_TEMPLATES.items()},
        "next_steps": {
            "correct": "继续下一个概念",
            "partially_correct": "补充讲解缺失部分，然后继续",
            "incorrect": "换一种方式重新讲解当前概念",
        },
        "encouragement": {
            "beginner": "学习新东西需要时间，你做得很好！",
            "intermediate": "继续加油，你在进步！",
            "advanced": "深入理解需要反复思考，你的努力会有回报。",
        },
    }


def main():
    """CLI entry point: parse args and output evaluation result as JSON."""
    parser = argparse.ArgumentParser(
        description="评估用户答案并生成反馈模板"
    )
    parser.add_argument("--answer", required=True, help="用户的回答")
    parser.add_argument("--expected", required=True, help="期望的正确答案")
    parser.add_argument(
        "--level", required=True,
        choices=["beginner", "intermediate", "advanced"],
        help="用户等级"
    )
    parser.add_argument("--concept", default="", help="当前概念")

    args = parser.parse_args()

    # 也支持从 stdin 读取 JSON
    if args.answer == "-" and not sys.stdin.isatty():
        data = json.load(sys.stdin)
        args.answer = data.get("answer", "")
        args.expected = data.get("expected", "")
        args.level = data.get("level", "beginner")
        args.concept = data.get("concept", "")

    result = evaluate_answer(
        answer=args.answer,
        expected=args.expected,
        level=args.level,
        concept=args.concept,
    )

    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
