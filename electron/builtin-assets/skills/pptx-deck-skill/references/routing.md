# PPTX Scene Routing

Use this routing table before writing slide content.

## Primary Scenes

| Scene | Use when user says | Template |
| --- | --- | --- |
| Course module | 课程课件, 教学 PPT, 一节课, 培训一章, lesson, courseware | `templates/course-module.md` |
| Exam review | 考前复习, 知识梳理, 错题复盘, review for exam | `templates/exam-review.md` |
| Concept explainer | 概念讲解, 科普, 原理解释, how X works | `templates/concept-explainer.md` |
| Study report | 读书分享, 学习汇报, 文献分享, 学习总结 | `templates/study-report.md` |
| Weekly report | 周报, 月报, 工作同步, progress update | `templates/weekly-report.md` |
| Project review | 项目复盘, 进度汇报, 里程碑, risk review | `templates/project-review.md` |
| Executive summary | 管理层汇报, 经营分析, 季度复盘, board-style review | `templates/executive-summary.md` |
| Proposal | 方案汇报, 提案, 计划书, implementation plan | `templates/proposal.md` |
| Research brief | 调研报告, 竞品分析, 资料总结, research brief | `templates/research-brief.md` |
| Training deck | 企业培训, 操作规范, onboarding, enablement | `templates/training-deck.md` |
| Meeting deck | 会议材料, 讨论稿, decision meeting | `templates/meeting-deck.md` |
| Custom creative | User request does not fit a stable scene, or asks for a special style | `templates/custom-creative.md` |

## Format Decision

- If the user explicitly asks for `.pptx`, PowerPoint, WPS, native PPT, or editable deck, use this skill.
- If the user asks for HTML slides, web presentation, speaker mode, or keyboard navigation, use `html-ppt-skill`.
- If the user asks for animation, flow animation, video素材, 科普动画, or process demo, use `ai-animation-skill`.
- If the user asks for both PPTX and animation, use this skill for PPTX and `ai-animation-skill` for the companion HTML.

## Custom Creative Branch

Use `custom-creative` only after checking the stable scenes. It is not unbounded free-form generation.

Allowed freedom:

- combine layouts from `layouts.md`;
- adapt themes from `themes.md`;
- create one consistent visual motif;
- use more expressive composition when the user asks for impact.

Still required:

- one idea per slide;
- explicit type hierarchy;
- no overflow;
- consistent margins and spacing;
- speaker notes on content slides;
- QA pass before delivery.

## Education/Learning Bias

For education and learning requests, choose clarity over decorative polish.

Prefer:

- learning objective;
- prerequisite recall;
- concept definition;
- worked example;
- misconception correction;
- practice question;
- recap and next step.

Avoid:

- dense textbook paragraphs;
- purely decorative icons;
- too many animations in PPTX;
- shrinking text to fit.

