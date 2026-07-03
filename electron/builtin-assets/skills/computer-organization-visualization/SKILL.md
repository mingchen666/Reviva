---
name: computer-organization-visualization
description: Use this skill whenever the user wants visual learning for computer organization, data representation, two's complement, floating point, cache mapping, memory hierarchy, instruction format, CPU datapath, control signals, pipeline timing, bus, I/O, DMA, interrupts, or 408 computer organization review.
allowed-tools: file_read, file_write
---

# Computer Organization Visualization Skill

Create precise visual explanations for computer organization. Emphasize bit fields, data movement, component roles, timing, and calculation steps.

## Use For

- two's complement range, overflow, fixed/floating-point representation;
- IEEE-like floating format explanation when the user's material specifies the format;
- Cache address split, direct/associative/set-associative mapping, replacement, AMAT;
- main memory organization, interleaving, address lines, word/byte addressing;
- instruction format, addressing modes, control signals;
- single-cycle/multi-cycle CPU data path;
- pipeline timing, stalls, forwarding, hazards, speedup;
- interrupts, DMA, buses, I/O path.

## Output Modes

| Topic | Preferred visual |
|---|---|
| Data representation | bit field strip + conversion steps |
| Cache | address split + cache set/table + hit/miss timeline |
| CPU datapath | component diagram + highlighted data/control path |
| Pipeline | cycle-by-instruction grid + hazard markers |
| Interrupt/DMA | sequence diagram + bus ownership timeline |

## Bundled Template

Choose the closest bundled template:

- `assets/templates/architecture-stepper.html` - CPU datapath, instruction execution, bus/I/O sequence, DMA/interrupt flow.
- `assets/templates/cache-mapping.html` - Cache address split, mapping, tag comparison, hit/miss, replacement.
- `assets/templates/pipeline-grid.html` - pipeline cycle table, hazards, stalls, forwarding, branch penalty.

Replace the `DATA` object with the target CPU/Cache/pipeline scenario. Keep the register/memory/formula panels and cycle table for exam-transfer value.

Follow the shared UI standard in `/skills/cs-course-learning/references/visual-template-ui.md` when available: learning-workbench layout, stable controls, state table, step inspector, and exam-transfer panel.

## Research-Informed Design Patterns

Use patterns from educational architecture simulators such as Ripes, QtMips, ARM graphical micro-architecture simulators, and pipeline/cache teaching tools:

- make registers, memory, instruction memory, data memory, and control signals visible;
- highlight the active data path for the current instruction;
- show cycle-by-cycle pipeline occupancy;
- show stalls, forwarding, branch handling, and cache hit/miss as explicit events;
- allow small user-provided instruction/address examples;
- pair diagrams with formula substitution and exam-check tables.

## Topic Coverage Checklist

For 408/期末复习, cover these families when relevant:

- data representation: bases, complement, overflow, fixed/floating point, error checking;
- memory hierarchy: locality, Cache mapping, replacement, write policy, AMAT;
- instruction system: instruction format, addressing modes, ISA/ABI boundary;
- CPU datapath: fetch/decode/execute/memory/writeback, control signals;
- pipeline: hazards, stalls, forwarding, branch penalty, speedup;
- I/O: interrupts, DMA, bus arbitration, memory-mapped I/O.

## Required Structure

- Show bit widths, units, and field boundaries explicitly.
- Use arrows for data movement and dashed arrows for control signals.
- Pair every formula with the specific numbers substituted into it.
- Include an "exam check" list: unit, bit count, boundary, replacement rule, and final answer.
- For CPU/pipeline pages, include a register table, memory table, pipeline table, and current-instruction panel when relevant.

## Accuracy Rules

- Do not infer word length, block size, associativity, replacement policy, or address width if the user has not provided them; ask or mark as assumption.
- Distinguish bit, byte, word, word length, storage word, and instruction word.
- For pipeline questions, separate ideal time, stalls, fill/drain, throughput, and speedup.
- For Cache questions, state address width, block size, line/set count, associativity, replacement policy, and write policy before calculating.

## Coordination

- Use `technical-diagram-skill` for CPU data path, cache mapping diagrams, pipeline timing grids, and bus sequence diagrams.
- Use `learning-visualization-skill` for interactive HTML explanations and step controls.
- Use `cs-course-learning` for broader 408 planning and mistake diagnosis.
