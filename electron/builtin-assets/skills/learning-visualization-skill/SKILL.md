---
name: learning-visualization-skill
description: Generate single-file HTML visual explanations for learning and review. Use this skill when the user wants concept maps, process diagrams, principle demos, comparison diagrams, timelines, AI/ML model visualizations, or animated teaching pages that make a topic easier to understand,复习, or present.
allowed-tools: file_read, file_write
---

# Learning Visualization Skill

Create focused, browser-openable HTML pages that explain knowledge through diagrams and motion. This skill is for learning and review scenarios where a static answer is not enough: the user needs a visual explanation, a step-by-step concept map, or an animated principle demo.

## When To Use

Use this skill for:

- concept maps and knowledge structures;
- process diagrams, workflows, and decision flows;
- principle demos for algorithms, systems, protocols, or scientific ideas;
- comparison diagrams such as "A vs B";
- timelines and evolution diagrams;
- simplified system overviews for teaching;
- AI/ML visualizations such as MLP, RNN, LSTM, GRU, Word2Vec, One-Hot, or GPU computation.

If the user asks for a full slide deck, use `html-ppt-skill` or `pptx-deck-skill` instead. If the user asks for a specialized network protocol animation, prefer `network-protocol-viz`.

## Output

Default to a single `.html` file with inline CSS and JavaScript. The result should open directly in a browser and should not require a build step.

Write generated files into the current agent output directory when available. If no output directory is provided, ask once or use a clear local output path under the current workspace.

## Workflow

1. Identify the target concept, process, or model.
2. Choose the visualization type.
3. Pick a reference example only if it matches the task.
4. Generate a single-file HTML page with clear visual hierarchy and restrained motion.
5. Include a short current-step explanation when the animation is sequential.
6. Check that text does not overlap, controls work, and the page is useful for learning rather than decorative only.

## Visualization Types

| User intent | Recommended type |
| --- | --- |
| "步骤 / 流程 / 怎么走" | Process diagram |
| "原理 / 怎么工作 / 内部机制" | Principle demo |
| "区别 / 对比 / 优劣" | Comparison diagram |
| "组成 / 模块 / 架构" | System overview |
| "请求 / 调用 / 握手 / 交互" | Sequence diagram |
| "历史 / 演进 / 版本" | Timeline |
| "知识点 / 关系 / 复习" | Concept map |

## Visual Standards

- Use purposeful motion: nodes appear in order, connection lines draw after nodes, and data flow should be visible when the concept has direction.
- Keep diagrams readable on common laptop screens. Avoid cramming a whole textbook page into one canvas.
- Prefer SVG or CSS shapes for diagrams. Use images only when the subject needs real visual material.
- Use text as labels and explanations, not as decoration.
- Do not use emoji as diagram icons. Use simple inline SVG or icon fonts if icons are necessary.
- Avoid one-note dark neon pages for every subject. Match the visual tone to the learning context.

## Reference Assets

Use these bundled examples as structure references, not as content to copy blindly:

- `assets/MLP.html` - feed-forward neural network / layer flow.
- `assets/RNN.html` - recurrent flow over time.
- `assets/LSTM-Introduce.html` and `assets/LSTM-1.html` - gate and cell-state explanation.
- `assets/GRU-Introduce.html` - GRU gate explanation.
- `assets/word2vec.html` - vector representation explanation.
- `assets/onehot.html` - one-hot encoding explanation.
- `assets/GPU.html` - parallel computing/system overview.

Prompt examples are in `references/prompts.md`. Read them only when the task is close to the bundled examples or when you need a starting structure.

## Quality Checklist

Before delivering:

- The page has a clear learning objective in the title or first screen.
- The diagram can be understood without reading a long paragraph first.
- The animation has a reason: sequence, causality, hierarchy, or flow.
- Controls, if present, include at least replay/reset; step controls are useful for dense topics.
- Long labels wrap cleanly and do not overlap nodes or arrows.
- The output file path is reported clearly.
