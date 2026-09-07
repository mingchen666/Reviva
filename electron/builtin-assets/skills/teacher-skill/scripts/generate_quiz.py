#!/usr/bin/env python3
"""
generate_quiz.py - 根据教学内容和用户等级生成练习题

用法：
  python generate_quiz.py --concept "递归" --level beginner --type understanding
  python generate_quiz.py --concept "微积分基本定理" --level intermediate --type application
  python generate_quiz.py --concept "设计模式" --level advanced --type comprehensive

参数：
  --concept    当前教学概念
  --level      用户等级：beginner / intermediate / advanced
  --type       题目类型：understanding / application / comprehensive
  --context    （可选）补充上下文信息
  --count      （可选）生成题目数量，默认2
"""

import argparse
import json


# 题目模板库
TEMPLATES = {
    "beginner": {
        "understanding": [
            "关于{concept}，下面哪个说法是正确的？\n"
            "A. {wrong1}\nB. {correct}\nC. {wrong2}\nD. {wrong3}",

            "判断以下说法是否正确：\n"
            "\"{statement}\"\n"
            "为什么？",

            "{concept}的核心作用是什么？\n"
            "A. {wrong1}\nB. {correct}\nC. {wrong2}",
        ],
        "application": [
            "在以下哪个场景中，最适合使用{concept}？\n"
            "A. {scenario_irrelevant}\nB. {scenario_relevant}\n"
            "C. {scenario_partial}\nD. {scenario_opposite}",

            "下面哪种做法体现了{concept}的思想？\n"
            "A. {option_a}\nB. {option_b}\nC. {option_c}",
        ],
        "comprehensive": [
            "我们已经学了{concepts}。\n"
            "请把下面的概念和它的描述配对：\n"
            "{matching_list}",
        ],
    },
    "intermediate": {
        "understanding": [
            "请用自己的话解释：{concept}是什么？它解决了什么问题？",

            "{concept}的核心步骤是：\n"
            "1. {step1}\n2. {step2}\n3. _____（请补充）",

            "{concept}和{related_concept}有什么区别？",
        ],
        "application": [
            "假设你遇到了这样的问题：{scenario}\n"
            "你会怎么用{concept}来解决？\n"
            "提示：可以按以下步骤思考：\n"
            "1. 先分析{key_factor}\n2. 然后选择{method}\n"
            "3. 最后{execution}",

            "以下代码/方案试图实现{function}，但有错误。请找出并修正：\n"
            "{code_with_errors}",
        ],
        "comprehensive": [
            "我们已经学了{concepts}。\n"
            "请描述它们之间的关系：它们是如何协同工作的？",

            "请用你学过的知识解决以下问题：\n"
            "{complex_scenario}\n"
            "在回答中标注你用到了哪些概念。",
        ],
    },
    "advanced": {
        "understanding": [
            "为什么{concept}要这样设计？如果不这样设计，会有什么问题？",

            "{concept}的局限性是什么？在什么情况下它可能不适用？",

            "对比{concept_a}和{concept_b}，它们的设计哲学有什么不同？",
        ],
        "application": [
            "{complex_scenario}\n\n"
            "请设计一个解决方案，需要用到：\n"
            "- {concept_a}\n- {concept_b}\n\n"
            "要求：\n"
            "1. 说明你的整体思路\n"
            "2. 解释每个概念的作用\n"
            "3. 讨论可能的替代方案",

            "请从零开始实现{function}，要求：\n"
            "1. 使用{concept}\n"
            "2. 考虑{edge_cases}\n"
            "3. 代码清晰、有注释",
        ],
        "comprehensive": [
            "综合讨论题：\n"
            "在{domain}领域，{concept_a}和{concept_b}经常被一起使用。\n"
            "请分析：\n"
            "1. 它们各自解决什么问题？\n"
            "2. 为什么需要组合使用？\n"
            "3. 有没有可以替代的方案？各自的优劣是什么？",
        ],
    },
}


def generate_quiz(concept: str, level: str, quiz_type: str,
                  context: str = "", count: int = 2) -> dict:
    """
    生成练习题。

    返回一个结构化的题目对象，包含模板和需要填充的占位符提示。
    实际的占位符内容由 AI 在对话中根据具体教学内容填充。
    """
    level = level.lower()
    quiz_type = quiz_type.lower()

    if level not in TEMPLATES:
        raise ValueError(f"不支持的等级: {level}，可选: {list(TEMPLATES.keys())}")
    if quiz_type not in TEMPLATES[level]:
        raise ValueError(
            f"等级 {level} 不支持的题目类型: {quiz_type}，"
            f"可选: {list(TEMPLATES[level].keys())}"
        )

    templates = TEMPLATES[level][quiz_type]
    selected = templates[:min(count, len(templates))]

    result = {
        "concept": concept,
        "level": level,
        "type": quiz_type,
        "context": context,
        "questions": [],
        "fill_guidance": {
            "concept": "当前教学的核心概念名称",
            "correct": "正确答案/说法",
            "wrong1/wrong2/wrong3": "常见误解（作为干扰选项）",
            "statement": "一个关于概念的陈述（判断题用）",
            "scenario_relevant": "适合使用该概念的场景",
            "scenario_irrelevant": "不适合该概念的场景",
            "related_concept": "与当前概念相关但不同的概念",
            "step1/step2": "概念的核心步骤",
            "concepts": "已学的概念列表（逗号分隔）",
        },
    }

    for i, template in enumerate(selected):
        result["questions"].append({
            "index": i + 1,
            "template": template,
            "note": "请 AI 根据具体教学内容填充模板中的占位符",
        })

    return result


def main():
    """CLI entry point: parse args and generate quiz template as JSON."""
    parser = argparse.ArgumentParser(
        description="根据教学内容和用户等级生成练习题模板"
    )
    parser.add_argument("--concept", required=True, help="当前教学概念")
    parser.add_argument(
        "--level", required=True,
        choices=["beginner", "intermediate", "advanced"],
        help="用户等级"
    )
    parser.add_argument(
        "--type", required=True,
        choices=["understanding", "application", "comprehensive"],
        help="题目类型"
    )
    parser.add_argument("--context", default="", help="补充上下文信息")
    parser.add_argument("--count", type=int, default=2, help="生成题目数量")

    args = parser.parse_args()

    result = generate_quiz(
        concept=args.concept,
        level=args.level,
        quiz_type=args.type,
        context=args.context,
        count=args.count,
    )

    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
