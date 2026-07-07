---
name: computer-network-learning
description: Use this skill whenever the user is learning computer networking, computer networks, TCP/IP, OSI, subnetting, routing, switching, DNS, HTTP, TCP, UDP, DHCP, TLS, NAT, congestion control, network security basics, or asks for a chapter summary, learning path, concept explanation, study notes, revision plan, or course help for a networking class.
allowed-tools: file_read, file_write, document_read, kb_search, web_search_bing, mcp:exa
---

# Computer Network Learning Skill

Help users learn computer networking as a course, not as isolated trivia. Build a clear path from concepts to packet behavior, experiments, practice questions, and review artifacts.

## When To Use

Use this skill for:

- computer network course learning,期末复习, 408/考研网络基础, classroom assignments, lab preparation;
- OSI/TCP-IP models, encapsulation, multiplexing/demultiplexing;
- Ethernet, ARP, switching, VLAN basics;
- IPv4/IPv6, subnetting, CIDR, NAT, ICMP, routing table lookup;
- TCP/UDP, reliable transmission, sliding windows, flow control, congestion control;
- DNS, HTTP/HTTPS, DHCP, TLS handshake, email protocols;
- network security basics, firewall rules, VPN concepts, defensive understanding;
- turning notes, slides, PDFs, or textbooks into a study plan, chapter map, quiz, flashcards, or visual explanation.

For animated packet flow, coordinate with `network-protocol-viz`. For packet capture labs, coordinate with `network-packet-lab`. For exam-style questions, coordinate with `network-exam-practice`.

## First Response Pattern

If the user gives a broad request such as “帮我学计算机网络”, ask at most 4 missing details:

1. current level: beginner / taking a course / exam review / 408;
2. target: understand concepts / finish homework / lab / exam score;
3. scope: chapter, syllabus, document, or topic list;
4. deadline and available study time.

If the user already gives enough context, start directly.

## Core Learning Workflow

1. **Map the topic.** State where the topic sits in the network stack and what problem it solves.
2. **Explain the mechanism.** Use packet flow, state changes, tables, headers, or sequence diagrams.
3. **Connect to examples.** Use one concrete scenario such as opening a web page, sending a DNS query, or forwarding a packet.
4. **Check understanding.** Ask 2-5 short questions or generate mini practice.
5. **Produce a review artifact when useful.** Create notes, flashcards, a concept map, an HTML visualization, or a printable summary.

## Output Templates

### Concept Explanation

```markdown
# [Topic]

## It Solves
[The real networking problem this mechanism solves.]

## Where It Lives
[Layer, related protocols, prerequisite concepts.]

## How It Works
1. ...
2. ...
3. ...

## Example Packet Flow
[A concrete packet path or protocol sequence.]

## Common Misunderstandings
- ...

## Quick Check
1. ...
```

### Chapter Study Plan

```markdown
# [Course/Chapter] Study Plan

## Scope
- Must know:
- Should know:
- Extension:

## Study Order
1. Foundation:
2. Mechanism:
3. Practice:
4. Review:

## Artifacts To Create
- notes:
- protocol visualization:
- packet lab:
- practice questions:
```

## Accuracy Rules

- Do not invent RFC numbers, textbook claims, exam requirements, or “high-frequency” topics without user materials or verified sources.
- If current syllabus or exam rules matter, use web search tools when available and cite the source summary.
- For security topics, keep examples defensive and educational. Do not provide exploit steps, credential theft, evasion, or attack automation.
- Prefer user-provided slides, notes, PDFs, assignments, and captures over generic knowledge.

## Coordination

- Use `network-protocol-viz` for visual packet flow, header structure, routing/switching animation, DHCP/TLS/TCP flows.
- Use `network-packet-lab` for Wireshark/tcpdump-style lab design or capture interpretation.
- Use `network-exam-practice` for exam questions, grading, and mistake diagnosis.
- Use `research-brief-skill` or web tools for current course/exam information, vendor docs, RFC summaries, or public references.
- Use `note-skill`, `flashcard-generator`, or `officecli-skills` when the user wants saved study materials.
