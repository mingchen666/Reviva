---
name: manim-animation-maker
description: Create educational explainer videos with a Manim plus FFmpeg workflow. Use when the user asks for Manim animation, math/physics/geometry/algorithm visualization, formula derivation, concept explainer video, scene planning, MP4 rendering, preview frames, or video quality checks.
---

# Manim Animation Maker

Create short teaching videos with Manim Community Edition and FFmpeg.

This skill is not a generic video generator. It is for learning scenarios where motion, sequencing, labels, formulas, diagrams, or visual emphasis make a concept easier to understand. The normal output is a Manim Python script plus a rendered MP4 or a clear render command when local dependencies are missing.

## Core Principle

Use Manim for visual reasoning.

Use FFmpeg for media verification and light post-processing.

Do not treat FFmpeg as a replacement for Manim. Do not try to create complex videos by stitching random clips. The teaching value should come from a clean visual explanation.

## When To Use

Use this skill when the user asks for:

- a Manim animation or Manim script;
- a math, physics, geometry, graph, or algorithm visualization;
- an animated proof or formula derivation;
- a concept explainer video for study or teaching;
- a rendered MP4 from a Manim scene;
- a preview frame, thumbnail, media check, or short clip from the rendered animation.

Do not use this skill when:

- a static Markdown explanation is clearer;
- a simple chart or table is enough;
- the user wants a general cinematic, marketing, or entertainment video;
- the task requires voiceover, music mixing, subtitles, transitions between multiple videos, or advanced editing that the current FFmpeg tool does not support.

## Tool Roles

Required tools:

- `file_write`: create the Manim `.py` script in the workspace.
- `manim_tool`: check environment, list scenes, and render MP4.

Strongly recommended companion:

- `ffmpeg_tool`: inspect and validate rendered MP4s, generate thumbnails or preview frames, and clip a short segment when useful.

Optional:

- `file_read`: inspect an existing Manim script or related source material.

Use raw shell commands only if the controlled tools are unavailable and the user still needs a command to run manually. Never use raw shell commands to delete files or operate outside the workspace.

Never use the DeepAgents `execute` tool for this skill. In Reviva, Manim rendering is done through `manim_tool`; `execute({ "path": ... })` is invalid and will fail because `execute` is a shell-command tool, not a file/media router.

## Dependencies

Manim rendering depends on the local machine.

Required for MP4 rendering:

- Manim Community Edition Python package (`manim`)
- FFmpeg

Required only for LaTeX-heavy scenes:

- A LaTeX distribution such as MiKTeX or TeX Live
- `latex`, `pdflatex`, or `xelatex`
- `dvisvgm`
- On Windows, `mpm --version` can confirm MiKTeX is installed and visible in PATH.

Important:

- The controlled `manim_tool` runs Manim through Python module entrypoints such as `python -m manim` / `py -m manim`.
- If the Manim package is missing, `manim_tool` reports a dependency warning; provide install guidance instead of attempting manual rendering.
- `manim` / `manimce` CLI wrappers are compatibility fallbacks, not the primary runtime.
- Manim uses FFmpeg when producing MP4. If FFmpeg is missing, rendering should be treated as blocked even if Manim is installed.
- `Text`, shapes, axes, dots, lines, arrows, graphs, and many geometry animations usually do not need LaTeX.
- `MathTex` and `Tex` need LaTeX. If LaTeX is unavailable, prefer a non-LaTeX version with `Text` labels, simple formulas as text, and visual diagrams.
- Chinese text may require system fonts. If font availability is uncertain, use short English labels inside Manim and explain the labels in the final Chinese answer.

## Standard Workflow

### 1. Define The Teaching Target

Before coding, identify:

- concept or problem being taught;
- learner level;
- expected duration;
- whether exact formulas are required;
- output target: draft, classroom, or polished.

If the user has already provided enough detail, proceed without asking. For vague requests, choose a short 20-60 second explainer by default.

### 2. Plan The Video

Write a concise scene plan before creating code:

```markdown
## Animation Plan
1. Orient: title and one visual question.
2. Build: introduce the core objects one at a time.
3. Transform: animate the key relationship or derivation.
4. Checkpoint: pause on the insight.
5. Summary: freeze the final structure with labels.
```

Keep the plan small. Most study videos need 3-6 beats, not a long storyboard.

### 3. Write Manim Code

Use one `.py` file with one main scene unless the user asks for multiple scenes.

Code requirements:

- import with `from manim import *`;
- define a clear scene class, usually `MainScene`;
- keep object names descriptive;
- use purposeful `self.play(...)` calls;
- use `self.wait(...)` only when it improves comprehension;
- keep text large enough to read in video;
- keep elements inside frame bounds;
- avoid clutter, tiny labels, excessive colors, and decorative motion;
- include comments only for non-obvious animation logic.

For formulas:

- use `MathTex` only when LaTeX is available or the user explicitly wants formula rendering;
- split long derivations into multiple smaller formulas;
- use `TransformMatchingTex` for algebraic transformations when appropriate;
- provide a non-LaTeX fallback when dependency status is uncertain.

### 4. Check The Environment

Before rendering, call:

```text
manim_tool({ "operation": "check" })
```

Interpret the result:

- missing Manim: provide install guidance and the script path;
- missing FFmpeg: explain that MP4 rendering needs FFmpeg;
- missing LaTeX: render only non-LaTeX scenes, or ask the user to install MiKTeX from https://miktex.org/download if exact formula typesetting is required.

### 5. Render With Manim

First render a draft unless the user explicitly asks for polished quality:

```text
manim_tool({
  "operation": "render",
  "path": "/agents/.../outputs/YYYY-MM-DD/scene.py",
  "sceneName": "MainScene",
  "quality": "low"
})
```

Do not call `execute` to render this file. Do not call `execute` with `path`, `sceneName`, `quality`, or `operation` fields. If you need rendering, call `manim_tool` exactly as shown above.

Use quality levels conservatively:

- `draft` or `low`: first pass and debugging;
- `medium`: classroom-ready preview;
- `high`: final render only when the user asks or the draft has already passed.

If rendering fails:

1. Read the error.
2. Fix code-related errors.
3. If the error is missing Manim, FFmpeg, LaTeX, or fonts, explain the dependency clearly.
4. Do not rerun the same failing render more than twice without changing the script or settings.

### 6. Validate Or Post-Process With FFmpeg

After a successful Manim render, use FFmpeg when available:

```text
ffmpeg_tool({
  "operation": "probe",
  "path": "/agents/{agent_name}/outputs/YYYY-MM-DD/rendered.mp4"
})
```

Use the result to confirm:

- the file is readable;
- duration is reasonable;
- video stream exists;
- file size is non-zero.

For review or final polish, optionally use:

- `thumbnail`: create a preview image at a meaningful timestamp;
- `extract_frames`: inspect several frames for layout, overlap, or blank output;
- `clip`: return a short segment if the user only needs a focused excerpt.

Do not claim the video is visually correct just because rendering succeeded. If you did not inspect frames, say that only render/probe validation was completed.

## Output Contract

A complete result should include:

- short summary of the teaching video;
- script path;
- rendered MP4 path, if rendering succeeded;
- thumbnail or preview frame path, if created;
- scene name;
- quality used;
- dependency caveats, especially FFmpeg and LaTeX;
- exact command only when the controlled tool could not render.

Keep the final response concise. The user needs paths and status, not a long explanation of Manim internals.

## File Placement

Create generated scripts under the current agent output directory, normally:

```text
/agents/{agent_name}/outputs/{YYYY-MM-DD}/
```

Rendered files from `manim_tool` are written to the current agent output directory:

```text
/agents/{agent_name}/outputs/{YYYY-MM-DD}/
```

FFmpeg outputs are written to the same current agent output directory:

```text
/agents/{agent_name}/outputs/{YYYY-MM-DD}/
```

## Templates

### Minimal Scene

```python
from manim import *


class MainScene(Scene):
    def construct(self):
        title = Text("Concept", font_size=42)
        subtitle = Text("A short visual explanation", font_size=26).next_to(title, DOWN)

        self.play(Write(title))
        self.play(FadeIn(subtitle, shift=UP * 0.2))
        self.wait(1)
        self.play(FadeOut(title), FadeOut(subtitle))
```

### Formula Scene With LaTeX

```python
from manim import *


class MainScene(Scene):
    def construct(self):
        title = Text("Quadratic Formula", font_size=38).to_edge(UP)
        equation = MathTex("ax^2 + bx + c = 0", font_size=48)
        result = MathTex("x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}", font_size=44)

        self.play(Write(title))
        self.play(Write(equation))
        self.wait(0.5)
        self.play(TransformMatchingTex(equation, result))
        self.wait(1.5)
```

### Geometry Scene Without LaTeX

```python
from manim import *


class MainScene(Scene):
    def construct(self):
        circle = Circle(radius=2, color=BLUE)
        radius = Line(circle.get_center(), circle.point_at_angle(PI / 4), color=YELLOW)
        label = Text("radius", font_size=24).next_to(radius, RIGHT)

        self.play(Create(circle))
        self.play(Create(radius), FadeIn(label))
        self.wait(1)
```

## Quality Checklist

Before finalizing:

- The video has one clear learning objective.
- The first 3 seconds orient the learner.
- Text is readable and does not overlap.
- Motion explains relationships, steps, or causality.
- The scene is not overloaded with formulas.
- The script can run from the saved directory.
- `manim_tool check` was used before render when available.
- Rendered MP4 was checked with `ffmpeg_tool probe` when available.
- A thumbnail or frames were generated when visual QA matters.
- LaTeX usage is intentional and documented.
