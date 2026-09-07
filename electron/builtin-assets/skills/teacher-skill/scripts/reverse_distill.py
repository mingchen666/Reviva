"""
teacher-skill 反蒸馏脚本 — 将 AI Skill 转化为人类可学的课程

三种使用模式：

  1. 分析模式：--analyze <url|path>    分析一个 skill 的结构，输出可教内容清单
  2. 生成模板：--generate <name>        基于分析结果，生成教学学科文件
  3. 批量模式：--batch <url-list>       批量处理多个 skill

使用流程：
  1. python3 scripts/reverse_distill.py --analyze <skill_url>
     分析 skill 文件，输出心智模型清单
  2. AI 根据清单编写 subjects/<name>-teacher-SKILL.md
     或使用 --generate 生成骨架文件
"""

import argparse
import json
import os
import re
import tempfile
import urllib.request
import urllib.error

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
# 默认写到系统临时目录，不写 Skill 目录（只读）。运行时应通过参数或 file_write 工具指定实际输出路径。
SUBJECTS_DIR = os.path.join(tempfile.gettempdir(), "teacher-skill", "subjects")
REFS_DIR = os.path.join(tempfile.gettempdir(), "teacher-skill", "ref")


# ==================== Skill 获取 ====================

def fetch_skill(path_or_url):
    """从 URL 或本地路径读取 skill 内容。"""
    if path_or_url.startswith("http://") or path_or_url.startswith("https://"):
        # 尝试常见的 raw URL 模式
        url = path_or_url
        # 如果给的是 GitHub 仓库页面的 URL，转换为 raw 地址
        if "github.com" in url and "/blob/" in url:
            url = url.replace("github.com", "raw.githubusercontent.com").replace("/blob/", "/")
        elif "github.com" in url and not "raw.githubusercontent.com" in url:
            # 非 blob 的仓库根 URL - 尝试 main 分支的 SKILL.md
            parts = url.rstrip("/").split("/")
            if len(parts) >= 3:
                # parts[-3] = github.com 在最后3个? 不，我们需要提取 owner/repo
                # URL 格式: https://github.com/owner/repo 或 https://github.com/owner/repo/suffix
                gh_parts = [p for p in url.rstrip("/").split("/") if p]
                # gh_parts = ['https:', '', 'github.com', 'owner', 'repo', ...]
                owner_idx = None
                for idx, p in enumerate(gh_parts):
                    if p == "github.com":
                        owner_idx = idx + 1
                        break
                if owner_idx and owner_idx + 1 < len(gh_parts):
                    owner = gh_parts[owner_idx]
                    repo = gh_parts[owner_idx + 1]
                    url = f"https://raw.githubusercontent.com/{owner}/{repo}/main/SKILL.md"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "teacher-skill/2.1"})
            with urllib.request.urlopen(req, timeout=15) as resp:
                return resp.read().decode("utf-8")
        except urllib.error.URLError as e:
            return json.dumps({"error": f"获取失败: {str(e)}", "url": url})

    else:
        # 本地路径
        path = os.path.expanduser(path_or_url)
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                return f.read()
        else:
            return json.dumps({"error": f"文件不存在: {path}"})


# ==================== Skill 分析 ====================

def parse_frontmatter(content):
    """解析 YAML frontmatter，返回 (metadata, body)。"""
    match = re.match(r"^---\s*\n(.*?)\n---\s*\n(.*)", content, re.DOTALL)
    if match:
        fm_text = match.group(1)
        body = match.group(2)
        metadata = {}
        for line in fm_text.split("\n"):
            line = line.strip()
            if ":" in line:
                key, _, val = line.partition(":")
                key = key.strip()
                val = val.strip()
                # 处理多行值 (| 或 >)
                if val in ("|", ">"):
                    val = ""
                metadata[key] = val
        return metadata, body
    return {}, content


def extract_mental_models(body):
    """从 body 中提取心智模型/核心概念。"""
    models = []
    current = {}
    lines = body.split("\n")

    # 尝试多种心智模型格式
    patterns = [
        r"###?\s*模型\d*[：:]\s*(.*)",      # ### 模型1: xxx
        r"###?\s*心智模型[：:]\s*(.*)",      # ### 心智模型: xxx
        r"###?\s*(核心概念|关键概念)\d*[：:]\s*(.*)", # 核心概念
        r"\*\*模型\d*[：:]\s*(.*?)\*\*",    # **模型1: xxx**
    ]

    i = 0
    while i < len(lines):
        line = lines[i]
        # 检测心智模型标题
        for pat in patterns:
            m = re.search(pat, line)
            if m:
                if current.get("name"):
                    models.append(current)
                name = m.group(1).strip() if m.lastindex == 1 else m.group(2).strip()
                current = {"name": name, "description": "", "principles": []}
                break

        # 收集描述（紧跟模型标题后的非空行）
        if current.get("name") and not current.get("description_started"):
            if line.strip() and not any(line.startswith(p) for p in ("#", "---")):
                desc_parts = [current.get("description", ""), line.strip()]
                current["description"] = (" ".join(p for p in desc_parts if p)).strip()
            elif line.strip() == "" and current.get("description"):
                current["description_started"] = True

        # 检测 > 引用的名言
        if line.startswith(">") and current.get("name"):
            quote = line.lstrip("> ").strip()
            if "principles" in current:
                current["principles"].append(quote)

        i += 1

    if current.get("name"):
        models.append(current)

    return models


def analyze_skill(content):
    """完整分析一个 skill，返回结构化分析结果。"""
    if content.startswith("{"):
        return json.loads(content)  # 错误信息

    metadata, body = parse_frontmatter(content)
    models = extract_mental_models(body)

    # 检测 skill 类型
    skill_type = "persona"
    if any(k in body.lower() for k in ["心智模型", "mental model", "思维框架"]):
        skill_type = "thinking"
    if any(k in body.lower() for k in ["身份卡", "角色扮演", "persona", "我是"]):
        skill_type = "persona"
    if any(k in body.lower() for k in ["写作", "文风", "表达", "风格"]):
        skill_type = "writing"

    # 可教性评估
    teachability = len(models)  # 心智模型越多越可教
    if teachability == 0:
        # 无明确心智模型的 skill 可能更适合模仿而非教学
        lines = body.strip().split("\n")
        teachability = max(1, min(3, len(lines) // 50))

    return {
        "name": metadata.get("name", "unknown"),
        "description": metadata.get("description", ""),
        "type": skill_type,
        "total_lines": len(body.strip().split("\n")),
        "mental_models": models,
        "teachability_score": min(10, teachability),
        "has_roleplay": "# 角色扮演" in body,
        "has_workflow": "# 回答工作流" in body or "Agentic Protocol" in body,
    }


# ==================== 输出 ====================

def print_analysis(analysis):
    """输出人类可读的分析结果。"""
    if "error" in analysis:
        print(json.dumps(analysis, ensure_ascii=False, indent=2))
        return

    lines = []
    lines.append("=" * 50)
    lines.append(f"Skill 名称: {analysis['name']}")
    lines.append(f"描述: {analysis['description'][:100]}")
    lines.append(f"类型: {analysis['type']} ({'有角色扮演' if analysis['has_roleplay'] else '无角色扮演'})")
    lines.append(f"行数: {analysis['total_lines']}")
    lines.append(f"可教性评分: {analysis['teachability_score']}/10")
    lines.append("")

    models = analysis["mental_models"]
    if models:
        lines.append(f"提取到 {len(models)} 个心智模型:")
        for i, m in enumerate(models, 1):
            lines.append(f"  {i}. {m['name']}")
            if m.get("description"):
                desc = m["description"][:120]
                lines.append(f"     概要: {desc}")
            if m.get("principles"):
                lines.append(f"     核心理念: {m['principles'][0][:100]}")
    else:
        lines.append("未检测到明确的心智模型（可能需要 AI 进一步分析）")
        lines.append("建议：这个 skill 可能更适合作为风格模仿素材，而非教学课程")

    lines.append("")
    lines.append(f"反蒸馏建议: 适合作为 {analysis['type']} 型课程")
    lines.append("=" * 50)

    print("\n".join(lines))


def _build_skel_output(analysis, name, desc, triggers):
    """构建骨架文件的文本行列表。"""
    output = []
    output.append("---")
    output.append("name: " + name)
    output.append("description: >")
    output.append("  " + desc)
    output.append("  ")
    output.append(f"  基于 {analysis['name']} 的 AI Skill 蒸馏分析反蒸馏为人类教学课程。")
    output.append(f" 源文件：{analysis.get('source_url', '未知')}")
    output.append("triggers:")
    for t in triggers:
        output.append(f"  - \"{t}\"")
    output.append("---")
    output.append("")
    output.append(f"# {analysis['name']} 教学策略（反蒸馏版）")
    output.append("")
    output.append(f"> 这个课程由 AI Skill \"{analysis['name']}\" 反蒸馏而来。")
    output.append("> 原本这个 skill 是让 AI 学会这个角色/思维，")
    output.append("> **现在它教的是人类。**")
    output.append("")
    output.append("## 学科特点分析")
    output.append("")
    output.append(f"- **源 Skill**: {analysis['name']}")
    output.append(f"- **类型**: {analysis['type']}")
    output.append(f"- **可教性评分**: {analysis['teachability_score']}/10")
    output.append(f"- **核心内容**: 以下 {len(analysis['mental_models'])} 个心智模型")

    for i, m in enumerate(analysis["mental_models"], 1):
        output.append("")
        output.append(f"## 模块{i}：{m['name']}")
        output.append("")
        output.append("### 概念讲解")
        output.append("")
        output.append(f"{m.get('description', '（待 AI 补充讲解内容）')}")
        if m.get("principles"):
            output.append("")
            output.append("**核心理念**：")
            for p in m["principles"]:
                output.append(f"- *{p}*")
        output.append("")
        output.append("### 生活类比")
        output.append("")
        output.append("（待 AI 补充生活化类比）")
        output.append("")
        output.append("### 检测练习")
        output.append("")
        output.append("（待 AI 设计检测练习题）")
        output.append("")

    return "\n".join(output)


def generate_skel(analysis, output_name=None):
    """生成教学学科文件骨架。"""
    if "error" in analysis:
        print(json.dumps({"error": "无法生成：源文件获取失败", "detail": analysis.get("error")},
                         ensure_ascii=False))
        return None

    name = output_name or analysis["name"].replace(" ", "-").lower()

    triggers = [analysis["name"]]
    if analysis["type"] == "thinking":
        triggers.append("思维框架")
    if analysis["has_roleplay"]:
        triggers.append("角色扮演")

    desc = f"反蒸馏课程：教会人类{analysis['name']}的思维方式。"
    if analysis["mental_models"]:
        model_names = "、".join([m["name"][:20] for m in analysis["mental_models"][:5]])
        desc += f" 包含 {len(analysis['mental_models'])} 个核心模型：{model_names}。"

    return _build_skel_output(analysis, name, desc, triggers)


# ==================== 主入口 ====================

def main():
    """CLI entry point: parse args and execute analyze/generate workflow."""
    parser = argparse.ArgumentParser(description="teacher-skill 反蒸馏工具")
    parser.add_argument("--analyze", metavar="URL_or_PATH",
                        help="分析一个 skill（URL 或本地路径）")
    parser.add_argument("--generate", metavar="NAME",
                        help="生成教学学科骨架文件（需先 --analyze）")
    parser.add_argument("--input", metavar="JSON_FILE",
                        help="分析结果的 JSON 文件（配合 --generate 使用）")

    args = parser.parse_args()

    if args.analyze:
        print(f"正在获取: {args.analyze}")
        content = fetch_skill(args.analyze)
        analysis = analyze_skill(content)
        analysis["source_url"] = args.analyze

        if args.generate:
            # 生成骨架文件
            skel = generate_skel(analysis, args.generate)
            if skel:
                output_path = os.path.join(SUBJECTS_DIR, f"{args.generate}-teacher-SKILL.md")
                os.makedirs(os.path.dirname(output_path), exist_ok=True)
                with open(output_path, "w", encoding="utf-8") as f:
                    f.write(skel)
                print(f"\n骨架文件已生成: {output_path}")
                print("请用 AI 补充讲解内容、生活类比和检测练习题。")
            return

        # 输出分析结果
        if "error" in analysis:
            print(json.dumps(analysis, ensure_ascii=False, indent=2))
            return

        print_analysis(analysis)
        # 同时保存分析结果到 JSON
        safe_name = analysis.get("name", "unknown").replace(" ", "-").replace("/", "-")
        analysis_path = os.path.join(REFS_DIR, f"analysis-{safe_name}.json")
        os.makedirs(os.path.dirname(analysis_path), exist_ok=True)
        with open(analysis_path, "w", encoding="utf-8") as f:
            json.dump(analysis, f, ensure_ascii=False, indent=2)
        print(f"\n分析结果已保存: {analysis_path}")
        print("生成教学文件请加 --generate 参数")

    else:
        parser.print_help()


if __name__ == "__main__":
    main()
