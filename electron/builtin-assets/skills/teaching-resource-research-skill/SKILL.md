---
name: teaching-resource-research-skill
description: Find, verify, and curate teaching resources for lesson preparation. Use this skill whenever a teacher asks to 联网查资料, 查课标, 找教材背景, 找公开课资源, 找案例, 找素材, 找时事, 找图片/视频/网页资料, 引用依据, 课程标准, 教材版本, 考试要求, 学科前沿, or wants sources for lesson plans, slides, worksheets, training materials, or teaching documents.
allowed-tools: file_read, file_write, office_read, kb_search, web_search_bing
---

# Teaching Resource Research Skill

Find and curate reliable teaching resources for teachers. The goal is not to dump links; it is to turn sources into classroom-usable evidence, examples, cases, activities, and citation notes.

## Load References When Needed

- Read `references/source-quality.md` when judging source reliability, citation quality, copyright, or fallback strategy.
- Read `references/curriculum-and-policy-research.md` when the user asks for curriculum standards, education policy, exam requirements, textbook version, or official wording.
- Read `references/materials-curation.md` when selecting examples, cases, images, videos, webpages, public lesson ideas, or current-event materials.

## Use When

Use this skill for:

- 课程标准、政策、考试要求、教材版本、公开资源的联网查询;
- finding public examples, cases, current events, historical context, scientific background, and teaching materials;
- building a source table for a lesson plan, PPT, worksheet, training document, or research summary;
- checking whether a generated teaching claim needs citation or current verification.

If the user only provides local materials and does not need external sources, prioritize `office_read`, `file_read`, and `knowledge-organize` instead. If a source becomes part of slides or handouts, coordinate with `lesson-plan-skill`, `worksheet-skill`, or `pptx-deck-skill`.

## Research Workflow

1. Define the research target.
   - Identify subject, grade, region/country, curriculum version, lesson topic, and intended output.
   - If region or curriculum version is unknown, do not assume official standards; ask or mark as unknown.
2. Search in priority order.
   - User-provided materials and knowledge base.
   - Official education authority, school, examination board, textbook publisher, museum/library/university, reputable educational organization.
   - Public teaching examples and media sources for inspiration, not official claims.
3. Evaluate sources.
   - Check authority, date, relevance, specificity, copyright/safety, and whether the source supports the claim.
4. Curate materials.
   - Extract classroom-usable items: key facts, cases, quotes, images/video ideas, activity prompts, data, vocabulary, and discussion questions.
5. Produce a source table.
   - Include title, source/organization, date if available, URL or file path, reliability note, classroom use, and caution.
6. Hand off to output skills.
   - Lesson plan, worksheet, PPT, or teaching document should use the curated source notes rather than raw links.

## Quality Rules

- Do not fabricate policy, curriculum wording, page numbers, exam rules, textbook claims, source titles, dates, or URLs.
- Distinguish official requirements from teaching inspiration.
- If GitHub, official sites, or search results are inaccessible, say so and use user files, knowledge base, cached project resources, or alternative public sources.
- Do not reproduce large copyrighted passages. Summarize, paraphrase, cite, and transform for teaching use.
- For images/videos, prefer public-domain, Creative Commons, official museum/library/media resources, or user-provided assets; note license uncertainty when unknown.
- For current events, state the retrieval date or "截至当前检索".
- For sensitive topics, present multiple perspectives and avoid unsupported claims.

## Default Output

Use this compact format:

```markdown
## 检索结论

## 可用素材
| 素材 | 适用环节 | 用法 | 注意事项 |
| --- | --- | --- | --- |

## 来源表
| 来源 | 机构/作者 | 日期 | 可靠性 | 可用于 | 链接/路径 |
| --- | --- | --- | --- | --- | --- |

## 需要教师确认
```

If the user asks for a file, save Markdown with `file_write` or route a DOCX version through the parent agent and `officecli-skills`.
