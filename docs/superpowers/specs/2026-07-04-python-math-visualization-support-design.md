# Python Math Visualization Support Design

## Goal

Make math learning visualization a first-class workflow by combining Python scientific plotting with Manim animation.

The product should support three complementary outputs:

- Static learning figures from Python, especially matplotlib.
- Animated explanation videos from Manim.
- Interactive HTML demos from the existing math-explainer workflow.

This is not a new unrestricted execution feature. Python command execution is already available through the sandboxed `exec_command` path when enabled and whitelisted. This design formalizes the dependency checks, installation entry point, and skill guidance needed for reliable math visualization.

## Scope

In scope:

- Add a "Math Visualization Python Libraries" environment item.
- Detect imports for `matplotlib`, `numpy`, `scipy`, and `sympy`.
- Provide a one-click install action using the existing Python candidate and Aliyun PyPI mirror flow.
- Update math-related skills so agents choose between Manim-native drawing and matplotlib-assisted drawing deliberately.
- Document a standard `matplotlib -> SVG/PNG -> Manim` asset workflow.

Out of scope:

- General package management UI.
- Unrestricted shell access.
- New Python virtual environment management.
- Advanced notebook/Jupyter support.
- Replacing Manim's native `Axes`, `NumberPlane`, geometry, or animation APIs.

## User Experience

Settings > Environment should show a new item under the visualization or Python package area:

- Name: `数学可视化 Python 库`
- Description: `用于函数图像、统计图、科学绘图和符号/数值计算（matplotlib / numpy / scipy / sympy）`
- Used by: `数学可视化`, `Manim 辅助素材`, `学习图表生成`
- Status: OK only when all required modules import successfully.
- Action: one-click install when missing.

The install action should mirror the existing Office/PDF Python library flow:

- find a working Python candidate;
- verify pip through `python -m pip --version`;
- install packages with `--user`;
- use `https://mirrors.aliyun.com/pypi/simple/`;
- re-run the import check and show the result.

## Agent Workflow

Skills should follow this decision rule:

- Use Manim native APIs for simple animated teaching objects: coordinate axes, function plots, moving points, transformations, geometry constructions, formulas, and step-by-step proof animation.
- Use matplotlib when the visual is more naturally a scientific/static plot: statistical charts, heatmaps, contour plots, vector fields, dense sampled data, numerical simulations, regression plots, probability distributions, or publication-style diagrams.
- If a matplotlib plot needs to appear in a Manim video, generate it as SVG when vector clarity matters, or PNG when raster output is simpler or the SVG is too complex.
- Import into Manim with `SVGMobject("plot.svg")` or `ImageMobject("plot.png")`.
- Keep the notation, colors, labels, and parameter ranges consistent across static figure, Manim video, and interactive HTML output.

The default learning workflow should be:

1. Explain the concept and decide the visual strategy.
2. Generate any needed static/scientific plot assets with Python.
3. Use Manim for the animated reasoning path when motion helps comprehension.
4. Build or update an interactive HTML version when parameter exploration helps learning.
5. Return paths and dependency notes clearly.

## Implementation Components

### EnvironmentSection.vue

Add the new item to the existing environment groups. It should use a new key, `pythonMathVizLibs`, and an install action with the same status/result treatment as `pythonOfficeLibs`.

### electron/main.js

Add constants:

- `PYTHON_MATH_VIZ_PACKAGES = ['matplotlib', 'numpy', 'scipy', 'sympy']`
- `PYTHON_MATH_VIZ_IMPORT_MODULES = ['matplotlib', 'numpy', 'scipy', 'sympy']`

Add an import check similar to `pythonOfficeImportAttempts()`.

Add `ENV_CHECKS.pythonMathVizLibs`.

Add an IPC install handler following the existing Python Office library install flow. The handler should return:

- `success`
- `command`
- `pip`
- `stdout`
- `stderr`
- `check`
- `error`

### preload/API Surface

If the current preload exposes one-off install functions, add `installPythonMathVizLibs` beside `installPythonOfficeLibs`. If the project already uses a generic environment install bridge, reuse it.

### Skills

Update:

- `electron/builtin-assets/skills/math-explainer/SKILL.md`
- `electron/builtin-assets/skills/manim-animation-maker/SKILL.md`

Add:

- decision rules for matplotlib vs Manim native APIs;
- a short asset pipeline recipe;
- a minimal code example for saving SVG/PNG and importing into Manim;
- dependency caveats for LaTeX, FFmpeg, and Python math libraries.

Update skill `config.json` where needed so relevant skills can use `exec_command` for controlled Python helper scripts. This does not bypass sandbox policy; it only makes the tool available when the agent and global settings allow it.

## Safety

- Keep global command execution disabled by default.
- Continue to require agent-level `execCommand` permission where applicable.
- Use structured command calls when agents run Python: `cmd: "python"`, `args: [...]`.
- Do not add broad shell tools or raw command workarounds.
- Install only the named math visualization packages through the dedicated UI action.

## Error Handling

Environment check failures should report which module is missing.

Install failures should preserve the final pip output tail, matching the existing Office/PDF library install behavior.

Skill instructions should tell agents to fall back gracefully:

- If matplotlib is missing, use Manim-native plots for simple visuals or ask the user to install the math visualization libraries.
- If Manim is missing, provide static figures and HTML where possible.
- If LaTeX is missing, avoid `MathTex`/`Tex` and use text labels or non-LaTeX visual explanations.

## Tests

Focused checks:

- `node --check electron/main.js`
- `node --check` for changed Electron helper files if split out
- frontend build or typecheck if feasible

Manual validation:

- Environment page shows the new item.
- Import check reports OK when all four modules import.
- Missing module state shows a clear install action.
- Install action uses `python -m pip` and re-checks after install.
- Skill docs include a working matplotlib-to-Manim example.

## Acceptance Criteria

- Users can see whether math visualization Python libraries are available.
- Users can install the supported library set from the environment page.
- Agents have explicit guidance for when and how to pair matplotlib with Manim.
- Manim and matplotlib are treated as complementary learning tools rather than competing paths.
- Existing Office/PDF Python library support remains unchanged.
