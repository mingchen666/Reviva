# Discipline Visualization Patterns

Use this guide after diagnosing the learner's domain and concept type. The same concept-card shell can stay consistent, but the visual representation must change by discipline. Do not force every concept into a graph, timeline, or generic flowchart.

## Selection Rule

Choose the visual form that exposes the learner's actual bottleneck:

1. What must the learner notice? magnitude, structure, sequence, relation, evidence, exception, or procedure.
2. What representation is conventional in the discipline? axis, force diagram, molecule, pathway, tree, timeline, stack, table, map, or simulation.
3. What can be simplified without becoming false?
4. Which interaction helps learning? step, compare, drag a parameter, reveal labels, replay, or answer a prompt.

If two visual forms are possible, use the one with fewer marks and clearer retrieval checks.

## Math

Use when the concept is a formula, proof, function, geometry object, transformation, limit, probability idea, or algebraic relation.

Preferred visuals:

- Number line for order, distance, sign, absolute value, intervals.
- Coordinate axes and function graph for slope, area, limits, monotonicity, transformations.
- Geometric construction for congruence, similarity, vectors, loci, trigonometry.
- Area/volume decomposition for integration, combinatorics, probability, and formulas.
- Proof diagram for "why this step is valid"; pair every visual step with the algebraic step.
- Distribution or simulation plot for statistics and probability.

Tool choices:

- HTML for sliders, parameter exploration, draggable points, step-by-step proof cards.
- Manim for transformations, limits, derivatives, area accumulation, geometry motion.
- matplotlib for exact plots, distributions, regression, random sampling, heatmaps.

Avoid:

- Decorative 3D if the concept is 2D or symbolic.
- Showing formulas without mapping each symbol to a visual mark.
- Treating a worked example as understanding; add a transfer check.

Checks:

- Ask the learner to predict the graph/quantity before revealing it.
- Ask them to explain which visual feature corresponds to a symbol or theorem condition.

## Physics

Use when the concept involves force, motion, fields, energy, waves, circuits, fluids, or measurement.

Preferred visuals:

- Free-body diagram for forces and equilibrium.
- Vector diagram for direction, component decomposition, velocity, acceleration, field.
- Motion trace or strobe diagram for kinematics.
- Energy bar chart or Sankey-like transfer diagram for conservation and transformation.
- Field lines plus magnitude encoding for electric, magnetic, gravitational, or flow fields.
- Circuit schematic with current/voltage annotations.
- Wave snapshot and time trace pair for waves and oscillation.

Tool choices:

- HTML for parameter sliders, compare modes, replayable experiments, circuit toggles.
- Manim for motion, vectors changing over time, wave propagation, field buildup.
- matplotlib for measured data, uncertainty, vector fields, simulations.

Design notes:

- Encode magnitude with length, thickness, saturation, or spacing, and label the encoding.
- Keep real-world images secondary unless the learning goal is experimental apparatus.
- State idealizations: frictionless, point mass, uniform field, small-angle approximation.

Avoid:

- Arrow clutter. Show only the vectors needed for the current step.
- Realistic animations that hide the idealized model.
- Unlabeled sign conventions.

Checks:

- Ask the learner to choose the direction/sign before calculation.
- Ask what changes if one assumption is removed.

## Chemistry

Use when the concept involves particles, bonding, structure, reactions, equilibrium, energy, lab process, or molecular geometry.

Preferred visuals:

- Particle model for states of matter, concentration, collision, diffusion.
- Lewis structure, orbital sketch, VSEPR shape, or molecular geometry for bonding.
- Reaction coordinate diagram for activation energy, catalysts, exothermic/endothermic reactions.
- Equilibrium shift diagram for Le Chatelier reasoning.
- Stoichiometry table or mole bridge for quantitative chemistry.
- Lab apparatus diagram for experimental procedure and safety-critical steps.

Tool choices:

- HTML for particle simulations, equilibrium sliders, pH/concentration comparisons.
- Manim for reaction pathway motion, molecular geometry reveal, stepwise mechanisms.
- matplotlib for titration curves, spectra, kinetics plots, thermodynamic curves.

Design notes:

- Choose an abstraction level: symbolic equation, particle picture, or macroscopic observation.
- Label color conventions and avoid implying color is physically exact unless it is evidence.
- For molecules, simplify enough for novices but preserve charge, geometry, and interaction cues.

Avoid:

- Over-realistic molecular motion that suggests deterministic paths when the concept is probabilistic.
- Mixing atomic, molecular, and macroscopic levels without explicitly naming the level.
- Using a molecule image as decoration without explaining the structure-function link.

Checks:

- Ask the learner to translate between equation, particle view, and observable result.
- Ask which variable shifts equilibrium or rate, and why.

## Biology

Use when the concept involves structure-function, pathway, regulation, inheritance, evolution, ecology, anatomy, or cell processes.

Preferred visuals:

- Structure-function diagram for organelles, tissues, proteins, organs, and adaptations.
- Process pathway for replication, transcription, translation, respiration, photosynthesis, signaling.
- Feedback loop for homeostasis and regulation.
- Punnett square, pedigree, or chromosome diagram for genetics.
- Phylogenetic tree for evolution and common ancestry.
- Food web or ecosystem network for ecology.
- Scale ladder for molecule, cell, tissue, organ, organism, population.

Tool choices:

- HTML for step pathways, toggled labels, comparison states, inheritance calculators.
- Manim for dynamic cellular processes, regulation loops, transport, population change.
- matplotlib for growth curves, enzyme kinetics, population models, experimental data.

Design notes:

- Name the biological scale and keep it consistent.
- Use arrows for causal influence only; use containment or adjacency for structure.
- Separate "what happens" from "why it matters for function".

Avoid:

- Treating pathways as simple linear chains when regulation or feedback is central.
- Drawing every molecule or step when only the causal bottleneck matters.
- Anthropomorphic language unless it is clearly marked as analogy.

Checks:

- Ask what would happen if one component is blocked, removed, or mutated.
- Ask the learner to connect structure to function in one sentence.

## Computer Science And Algorithms

Use when the concept involves data structures, algorithms, runtime, state, protocols, memory, concurrency, programming language semantics, or systems.

Preferred visuals:

- State machine for protocols, parsers, automata, UI state, async flows.
- Data structure mutation diagram for arrays, linked lists, trees, heaps, hash tables.
- Call stack and scope environment for recursion, closures, exceptions.
- Timeline for concurrency, event loop, scheduling, network requests.
- Graph traversal diagram for BFS, DFS, shortest path, dependency resolution.
- Memory/layout diagram for pointers, references, cache, allocation.
- Complexity curve and input-size table for Big-O intuition.

Tool choices:

- HTML for stepping algorithms, drag input, playback, compare algorithms.
- Manim for clean algorithm animations and state transitions.
- matplotlib for benchmark curves and complexity comparisons.

Design notes:

- Make state explicit before and after every operation.
- Keep code snippets short and align each line with a visual change.
- Show invariants, not only movement.

Avoid:

- Animating too fast for the learner to inspect state.
- Hiding edge cases that define the algorithm.
- Using only final output when the hard part is intermediate state.

Checks:

- Ask the learner to predict the next state.
- Ask which invariant would break under a wrong implementation.

## Statistics And Data Science

Use when the concept involves uncertainty, distributions, sampling, inference, models, correlation, regression, classification, or evaluation.

Preferred visuals:

- Distribution plot for spread, skew, variance, normal approximation.
- Sampling simulation for law of large numbers, confidence intervals, p-values.
- Scatterplot with fitted line for correlation/regression.
- Residual plot for model fit.
- Confusion matrix, ROC/PR curve, or calibration chart for classifiers.
- Bayesian update diagram for prior, likelihood, posterior.

Tool choices:

- matplotlib for accurate plots, axes, legends, and statistical charts.
- HTML for interactive simulation, sample-size slider, threshold slider.
- Manim only when a changing process is the explanation.

Design notes:

- Show uncertainty explicitly: intervals, bands, density, or repeated samples.
- Label what is sample, population, parameter, statistic, prediction, or error.
- Prefer small multiples for comparison instead of overloading one chart.

Avoid:

- Chart junk and unlabeled axes.
- Single-sample visuals that imply certainty.
- Correlation visuals that imply causation without evidence.

Checks:

- Ask what would happen if sample size changes.
- Ask whether the visual supports a causal claim.

## Humanities, History, And Social Science

Use when the concept involves periodization, cause and effect, institutions, texts, arguments, comparison, geography, ideology, or social mechanisms.

Preferred visuals:

- Timeline for chronology, periodization, before/after effects.
- Cause-effect map for historical or social mechanisms.
- Argument map for claims, evidence, assumptions, counterarguments.
- Comparison matrix for schools of thought, theories, policies, literary devices.
- Source/context card for author, audience, purpose, bias, evidence.
- Geography/map sketch when location explains the concept.
- Stakeholder map for institutions and incentives.

Tool choices:

- HTML for expandable timelines, source cards, comparison toggles, evidence sorting.
- Static Markdown/table when interaction adds little.
- Manim only for animated chronology or causal unfolding.

Design notes:

- Separate event, interpretation, and evidence.
- Mark uncertainty and competing explanations when relevant.
- Avoid false precision in timelines or causal arrows.

Avoid:

- Turning nuanced ideas into one-direction causal chains.
- Decorative historical imagery that does not support evidence.
- Overcrowded timelines with every date rather than the dates that explain the concept.

Checks:

- Ask the learner to identify evidence for a claim.
- Ask for one alternative explanation or limitation.

## Language And Literature

Use when the concept involves grammar, vocabulary, rhetoric, reading comprehension, writing structure, phonetics, or literary interpretation.

Preferred visuals:

- Sentence parse tree or chunking diagram for grammar.
- Morphology map for roots, affixes, word families.
- Semantic field map for vocabulary nuance.
- Rhetorical move map for essays and speeches.
- Plot/character relationship map for literature.
- Register/tone comparison table for writing.
- Pronunciation mouth-position or stress pattern diagram when relevant.

Tool choices:

- HTML for sentence highlighting, toggle translations, annotation layers, cloze practice.
- Markdown card for concise definitions and examples.
- Audio/video only when pronunciation or listening is central and supported by available tools.

Design notes:

- Pair rule with authentic examples.
- Highlight the exact words or structures being explained.
- For literature, distinguish textual evidence from interpretation.

Avoid:

- Vocabulary cards without usage context.
- Grammar diagrams that do not connect back to meaning.
- Overgeneralizing exceptions.

Checks:

- Ask the learner to classify or transform a new sentence.
- Ask them to justify an interpretation with quoted evidence.

## Cross-Disciplinary Concepts

Some concepts span subjects, such as "model", "system", "feedback", "entropy", "optimization", "evidence", or "scale".

When this happens:

- Choose the learner's current subject as the primary mode.
- Add one small bridge note to the other discipline, not a second full visualization.
- Keep the same concept card but change the example, visual marks, and checks.

Examples:

- Feedback in biology: regulatory loop with blocked component check.
- Feedback in control systems: signal loop with gain/stability check.
- Entropy in chemistry: particle arrangements and energy dispersal.
- Entropy in information theory: distribution uncertainty and code length.

## Template Adaptation Notes

`templates/interactive-card.html` is a shell, not a fixed graph template.

Replace the stage contents based on the selected pattern:

- Graph stage: axes, curve, point, tangent, area, distribution.
- Force/vector stage: object, arrows, components, sign convention.
- Particle stage: bounded container, particles, collisions, labels, slider.
- Pathway stage: nodes, arrows, active step, feedback edge.
- State stage: data structure, stack, memory cells, state transition.
- Timeline stage: events, evidence cards, period bands, causal links.

Keep the card, visual, controls, practice, and learning trace layout. Swap the marks and interaction model.
