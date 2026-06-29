# Animation and Simulation Strategy

Use animation when motion explains a change over time, a transformation, or a multi-step process better than static text. Do not animate for decoration. The learner should be able to pause, replay, step through, and connect each frame to the concept being taught.

## When to animate

Prefer animation for:

- algorithms: sorting, recursion, dynamic programming state transitions, graph traversal
- mathematics: limits, derivatives as tangent slopes, integrals as accumulating area, matrix transforms, vector fields, probability distributions
- physics: motion, forces, waves, electric/magnetic fields, circuits, thermodynamic processes
- chemistry: reaction mechanisms, equilibrium shifts, energy profiles, molecular geometry
- biology and medicine: cell division, DNA replication/transcription/translation, neural signaling, circulation, feedback loops
- humanities and social sciences: timelines, causal chains, economic model changes, argument flow
- writing and reasoning: thesis-to-evidence structure, paragraph order, revision before/after

Avoid animation when a table, static diagram, or one worked example is clearer.

## Animation levels

Choose the lightest tool that can teach the idea well.

| Level | Use for | Preferred output |
| --- | --- | --- |
| Inline step sketch | Quick explanation during chat | Markdown table, ASCII diagram, Mermaid |
| UI micro-animation | Feedback, reveal, drag/sort, card flip | Existing HTML templates |
| Process animation | Step-by-step algorithm/science/history flow | HTML + CSS/SVG/Canvas |
| Interactive simulation | Parameters, sliders, exploration | HTML + Canvas/SVG/function-plot/Plotly |
| Formal math video | High-quality mathematical animation | Manim scene and rendered MP4/GIF |
| 3D/external simulation | Molecules, geometry, physics worlds | Three.js, 3Dmol, PhET iframe, or specialist tools if available |

## Manim usage

Use Manim when the requested material is a polished mathematical or scientific animation, especially for:

- visual proofs and derivations
- geometry constructions
- vector and matrix transformations
- calculus intuition
- probability/statistics animations
- physics diagrams that need smooth mathematical motion

Do not assume Manim is installed. First check whether the environment has `manim`. If installed, create a focused Manim scene file and render with an appropriate quality preset:

```bash
manim -ql scene.py SceneName
manim -qm scene.py SceneName
manim -qh scene.py SceneName
```

Use `-ql` for drafts, `-qm` for normal review, and `-qh` only when the user needs a polished final video. If Manim is not installed or rendering is not practical, provide the Manim script and offer an HTML/SVG fallback.

Manim scene design rules:

- Keep one scene focused on one concept or one proof.
- Break motion into named sections: setup, transformation, explanation, check.
- Add labels, arrows, color coding, and pause points.
- Use Chinese narration text by default, with English technical terms where useful.
- Avoid long passive videos; include a short question or pause prompt after key steps.
- For formulas, ensure MathTex content is readable and not crowded.
- Prefer clear movement over flashy effects.

## HTML animation rules

For browser-based animations:

- Use CSS transitions for simple state changes.
- Use SVG or Canvas for process animations and simulations.
- Use `transform` and `opacity` where possible for smoother performance.
- Include play, pause, next step, previous step, reset, and speed controls when the animation teaches a sequence.
- Show the current step explanation next to the animation.
- Respect `prefers-reduced-motion` and provide a static or step-only fallback.
- Keep animations responsive and usable on mobile if the user will study on a phone.

## Coordination with user-agent skills

If the user's active agent runtime/session exposes specialist skills, use them when they fit. These skills are user-agent capabilities, not bundled dependencies of this study skill:

- `animate`: improve motion design, micro-interactions, and animation quality.
- `cc-design` or `huashu-design`: build high-fidelity HTML learning demos, slide decks, or interactive prototypes.
- `imagegen`: create raster illustrations, mnemonic images, diagrams, or visual anchors.
- `adapt`: make visual materials work on mobile and desktop.
- `optimize`: fix slow or janky animations.
- `audit` or `polish`: check accessibility, spacing, consistency, and final quality.

If a specialist skill is not present in the user's active agent skill list or current session, continue with the built-in templates and general coding tools.

## Delivery checklist

Before handing off an animation:

- State what concept the motion explains.
- Include how to run/open the output.
- Mention dependencies such as Manim, CDN libraries, or browser requirements.
- Provide a static summary of the same idea.
- Include at least one active recall prompt or practice question.
