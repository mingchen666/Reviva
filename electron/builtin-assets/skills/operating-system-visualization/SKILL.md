---
name: operating-system-visualization
description: Use this skill whenever the user wants visual learning for operating systems, process states, CPU scheduling, Gantt charts, synchronization, semaphore/PV problems, deadlock, Banker's algorithm, memory management, paging, address translation, page replacement, file systems, disk scheduling, or 408 OS review.
allowed-tools: file_read, file_write
---

# Operating System Visualization Skill

Create visual explanations for operating system mechanisms. The goal is to make queues, states, resources, and address mappings observable.

## Use For

- process/thread state transition and scheduling queues;
- FCFS, SJF, priority, RR, HRRN scheduling and Gantt charts;
- semaphore/PV, producer-consumer, readers-writers, dining philosophers;
- deadlock conditions, resource allocation graphs, Banker's algorithm;
- paging, segmentation, virtual memory, TLB, page table translation;
- page replacement: OPT, FIFO, LRU, Clock;
- file allocation, directory structure, free-space management;
- disk scheduling: FCFS, SSTF, SCAN, C-SCAN.

## Output Modes

| Topic | Preferred visual |
|---|---|
| Scheduling | timeline/Gantt chart + ready queue per time |
| PV problem | constraint graph + semaphore table + pseudocode |
| Deadlock | resource allocation graph + request/available table |
| Address translation | virtual address split + page table/TLB + physical address |
| Page replacement | frame table per reference + fault markers |
| Disk scheduling | cylinder line + head movement path |

## Bundled Template

Choose the closest bundled template:

- `assets/templates/os-stepper.html` - process states, CPU scheduling, Gantt charts, disk scheduling, queue-based simulations.
- `assets/templates/page-replacement.html` - FIFO/LRU/OPT/Clock page replacement and frame tables.
- `assets/templates/banker-matrix.html` - Banker's algorithm, safe sequence, deadlock avoidance matrices.

Replace `DATA.steps` or the relevant `DATA` fields with the user's scheduling, page replacement, deadlock, or disk scheduling data. Keep the queue/matrix/table panels and exam-answer note unless the task is intentionally static.

Follow the shared UI standard in `/skills/cs-course-learning/references/visual-template-ui.md` when available: learning-workbench layout, stable controls, state table, step inspector, and exam-transfer panel.

## Research-Informed Design Patterns

Use patterns from OS teaching simulators:

- accept custom datasets: processes, arrival times, burst times, time quantum, priorities, page reference strings, resource matrices;
- show both visualization and calculation table;
- include Gantt charts for scheduling;
- include Allocation/Max/Need/Available matrices for Banker's algorithm;
- include frame tables and page-fault markers for page replacement;
- include test mode or quick-check questions after the simulation.

## Topic Coverage Checklist

For 408/期末复习, cover these families when relevant:

- process/thread model: states, PCB, context switch, IPC;
- scheduling: FCFS, SJF, SRTF, priority, RR, HRRN;
- synchronization: semaphore, mutex, monitor concept, producer-consumer, readers-writers;
- deadlock: conditions, prevention, avoidance, detection, Banker's algorithm;
- memory: contiguous allocation, paging, segmentation, TLB, virtual memory;
- page replacement: OPT, FIFO, LRU, Clock/second chance;
- file/I/O: file allocation, directory, free space, disk scheduling, interrupt/DMA.

## Required Structure

- Show current state, next event, and why the transition occurs.
- Keep tables synchronized with animations.
- Include formulas for turnaround time, waiting time, page-fault count, or seek distance when relevant.
- Include an exam-answer panel that shows what to write in a paper solution.
- Include user-editable input panels when generating a learning simulator rather than solving one fixed problem.

## Accuracy Rules

- Ask for missing scheduling parameters: arrival time, service time, time quantum, priority rule.
- For PV problems, identify shared resources, mutually exclusive sections, and precedence constraints before writing code.
- For page replacement, state the initial frame state and tie-breaking rule.
- For disk scheduling, state current head position, direction, and request queue.
- For Banker's algorithm, show Work/Finish and safe sequence step by step.

## Coordination

- Use `technical-diagram-skill` for state machines, resource allocation graphs, page-table diagrams, and scheduling timelines.
- Use `learning-visualization-skill` for interactive HTML pages with step controls.
- Use `cs-course-learning` for broader OS learning and 408 strategy.
