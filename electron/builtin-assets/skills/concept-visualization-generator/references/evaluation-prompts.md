# Evaluation Prompts

Use these prompts to test whether the skill chooses discipline-appropriate learning artifacts instead of reusing one generic template.

## Expected Global Behaviors

For every prompt, the output should include:

- a concept card;
- a discipline-specific visual representation;
- 2-5 retrieval checks;
- one misconception correction;
- a learning trace with `domain`, `visual_representation`, and `abstraction_level`.

The output should not generate Manim, matplotlib, and HTML all at once unless the prompt clearly needs them.

## Prompt Set

### Math

Prompt:

> 用可视化方式讲懂导数的直觉，面向高一学生，最好能有一个可以拖动参数的 HTML 小演示。

Expected:

- Domain: math.
- Visual representation: function graph with secant/tangent or local slope.
- Good artifact: interactive HTML with slider/drag point.
- Checks: predict slope sign and explain symbol-to-visual mapping.

### Physics

Prompt:

> 讲一下为什么斜面上的物体要把重力分解，学生总是搞不清方向。

Expected:

- Domain: physics.
- Visual representation: free-body diagram and vector decomposition.
- Good artifact: step diagram or interactive HTML angle slider.
- Checks: predict component direction and sign convention.

### Chemistry

Prompt:

> 给我做一个化学平衡移动的概念卡片，最好能帮助学生理解勒夏特列原理，不要只背定义。

Expected:

- Domain: chemistry.
- Visual representation: particle/equilibrium shift or reaction coordinate depending on focus.
- Good artifact: concept card plus HTML compare state.
- Checks: translate between equation, particle view, and observable change.

### Biology

Prompt:

> 解释转录和翻译的区别，学生容易把 DNA、mRNA、蛋白质混在一起。

Expected:

- Domain: biology.
- Visual representation: process pathway with scale/role labels.
- Good artifact: pathway card with step reveal.
- Checks: block or swap one component and ask what changes.

### Computer Science

Prompt:

> 用可视化讲递归调用栈，最好能一步步看 factorial(4) 怎么返回。

Expected:

- Domain: CS.
- Visual representation: call stack and return-value timeline.
- Good artifact: interactive HTML stepper.
- Checks: predict next stack frame and returned value.

### Statistics

Prompt:

> 帮我解释置信区间，学生总以为 95% 是这个区间有 95% 概率包含真实值。

Expected:

- Domain: statistics/data.
- Visual representation: repeated sampling simulation with many intervals.
- Good artifact: matplotlib plot or HTML simulation.
- Checks: distinguish parameter, statistic, interval, and repeated procedure.

### History / Social Science

Prompt:

> 用知识卡片解释工业革命为什么不是单一原因造成的，适合高中历史复习。

Expected:

- Domain: history/social science.
- Visual representation: cause-effect map or comparison matrix, not a numeric graph.
- Good artifact: concept card plus argument/cause map.
- Checks: identify evidence and alternative explanation.

### Language / Literature

Prompt:

> 帮我可视化讲清楚英语定语从句，学生分不清关系代词在句子里做什么成分。

Expected:

- Domain: language/literature.
- Visual representation: sentence highlighting, chunking, or parse tree.
- Good artifact: HTML sentence annotation or card.
- Checks: transform/classify a new sentence and justify the role of the relative pronoun.
