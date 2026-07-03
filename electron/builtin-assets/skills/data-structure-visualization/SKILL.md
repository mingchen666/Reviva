---
name: data-structure-visualization
description: Use this skill whenever the user wants visual learning for data structures, algorithms, trees, graphs, sorting, searching, hashing, recursion, complexity analysis, 408 data structure review, algorithm hand simulation, or an interactive HTML explanation for a data-structure problem.
allowed-tools: file_read, file_write
---

# Data Structure Visualization Skill

Create visual study artifacts for data structures and algorithms. The goal is to show the evolving state of the structure and the hand-simulation path a student would use in an exam.

## Use For

- binary tree traversal, tree reconstruction, Huffman tree construction, BST insert/delete;
- graph traversal, shortest path, MST, topological sort, critical path;
- sorting passes, comparisons, moves, stability, and complexity;
- sequential/binary search, hash collision handling, B/B+ tree lookup;
- recursion call stacks and dynamic programming state tables;
- 408 or final-review questions that need step-by-step visual proof.

## Output Modes

| Topic | Preferred visual |
|---|---|
| Tree | node-link tree + traversal cursor + visit sequence |
| Graph algorithm | graph canvas + highlighted frontier/edges + state table |
| Sorting | array bars + pass table + comparison/move counters |
| Hashing | bucket table + probe path + ASL calculation |
| Recursion | call stack + shrinking subproblem + return values |
| DP | state grid + transition arrows + formula panel |

## Bundled Template

Choose the closest bundled template:

- `assets/templates/algorithm-stepper.html` - arrays, sorting, searching, hashing, recursion/DP tables.
- `assets/templates/tree-graph-stepper.html` - trees, graph traversal, shortest path, MST, topological sort, critical path.

Replace the `DATA` object with the user's topic and input. Keep the step controls, state table, pseudocode/state panel, and exam notes unless the user explicitly asks for a simpler static page.

Follow the shared UI standard in `/skills/cs-course-learning/references/visual-template-ui.md` when available: learning-workbench layout, stable controls, state table, step inspector, and exam-transfer panel.

## Research-Informed Design Patterns

Use these patterns seen in established algorithm visualization tools such as VisuAlgo and USFCA Data Structure Visualizations:

- support step-by-step execution, not only autoplay;
- show the data structure, operation log, and state table at the same time;
- expose key variables: indices, queue/stack/frontier, parent array, distance array, indegree, lowlink, heap index, hash probe count;
- allow user-provided input when feasible;
- keep a paper-solution table for exam transfer;
- include quick checks after the visualization.

## Topic Coverage Checklist

For 408/期末复习, cover these families when relevant:

- linear structures: stack, queue, linked list, circular queue;
- trees: traversal, reconstruction, Huffman, heap, BST, AVL/rotation concept, B/B+ tree lookup;
- graphs: BFS, DFS, connected components, topological sort, MST, shortest path, critical path;
- searching: binary search, hash tables, ASL, collision resolution;
- sorting: insertion, shell, bubble, quick, selection, heap, merge, radix;
- recursion/DP: recursion tree, call stack, memo table, transition equation;
- disjoint set: union by rank/size, path compression.

## Required Structure

For a generated HTML page, include:

- a stable viewport with no layout shift;
- step controls: previous, next, reset, autoplay when helpful, speed control for long animations;
- a state table that matches the animation;
- optional pseudocode panel with current line highlighted;
- an exam-notes panel explaining what to write by hand;
- a common-traps panel;
- quick-check questions.

## Accuracy Rules

- Do not skip intermediate states in sorting, graph, tree, or hashing problems.
- Preserve the exact input sequence from the user.
- If there are multiple valid algorithm variants, state the variant first.
- For 408-style work, show the hand-calculation table even when animation is present.
- Never generate a visually plausible but algorithmically skipped state. Correctness beats visual polish.

## Coordination

- Use `cs-course-learning` first when the user needs broader context or study planning.
- Use `technical-diagram-skill` for static graph/state-machine/algorithm workflow diagrams.
- Use `practice-quiz` or `network-exam-practice`-style practice only after the visualization has clarified the mechanism.
