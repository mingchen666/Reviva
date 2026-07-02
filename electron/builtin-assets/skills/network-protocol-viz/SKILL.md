---
name: network-protocol-viz
description: Generate single-file HTML animations that teach network protocols and packet flow. Use this skill when the user asks about TCP/IP, IPv4 datagrams, Ethernet frames, routing, switching, DHCP, HTTPS/TLS, packet capture, firewall filtering, or wants a visual protocol explanation for learning,复习, or teaching.
allowed-tools: file_read, file_write
---

# Network Protocol Visualization Skill

Create browser-openable HTML animations for computer networking concepts. This skill focuses on helping users understand protocols through packet structures, sequence flows, topology animation, tables, and step-by-step explanations.

## When To Use

Use this skill for:

- TCP three-way handshake, data transfer, and four-way close;
- IPv4 datagram and header field explanations;
- Ethernet frame structure and MAC addressing;
- switch MAC table learning, flooding, and forwarding;
- routing table lookup, longest-prefix matching, and packet forwarding;
- DHCP Discover / Offer / Request / ACK;
- HTTPS/TLS handshake and certificate verification;
- PPP frame structure;
- packet capture and protocol stack explanation;
- firewall filtering by IP, port, protocol, or rule order.

For general concept maps or non-network diagrams, use `learning-visualization-skill`. For a full presentation deck, use `html-ppt-skill` or `pptx-deck-skill`.

## Output

Default to a single `.html` file with inline CSS and JavaScript. The page should run in a modern browser without a build step.

Write generated files into the current agent output directory when available. If no output directory is provided, ask once or use a clear local output path under the current workspace.

## Workflow

1. Identify the protocol or networking concept.
2. Decide whether the explanation is about structure, interaction, topology, or filtering.
3. Select the closest bundled reference asset if useful.
4. Generate an HTML animation with clear controls and step text.
5. Verify that packet direction, protocol fields, table highlights, and labels are accurate.

## Visualization Modes

| Topic shape | Recommended layout |
| --- | --- |
| Packet/frame structure | Layered colored fields with hover or step explanations |
| Client/server handshake | Left-right sequence diagram with packets moving between endpoints |
| Routing/switching | Network topology with animated packet path and highlighted table rows |
| Protocol stack | Layered OSI/TCP-IP stack with encapsulation/decapsulation |
| Firewall/filtering | Rule table plus animated packet accept/drop decisions |

## Required Interactions

Include these controls unless the output is intentionally static:

- play/pause;
- reset or replay;
- current-step explanation.

Add step-next controls for dense teaching material. Add speed controls only when timing is important for the user's scenario.

## Visual Standards

- Use protocol-layer color coding consistently:
  - physical/link context: gray or blue;
  - network layer: green;
  - transport layer: orange;
  - application/security layer: purple;
  - warnings or drops: red.
- Show packet direction unambiguously with arrows or moving packets.
- Keep labels short and provide explanations in side panels or step text.
- Avoid showing offensive or directly actionable attack instructions. Security examples should explain defensive understanding and include an education-only framing.

## Reference Assets

Use these bundled examples as structure references:

- `assets/tcp-visualization.html` - TCP handshake animation.
- `assets/ipv4_datagram.html` and `assets/ipv4_datagram-3d.html` - IPv4 header visualization.
- `assets/ethernet-frame.html` - Ethernet frame structure.
- `assets/router-routing-table.html` - routing table lookup and forwarding.
- `assets/switch-mac-table.html` - switch MAC learning.
- `assets/HTTPS.html` - HTTPS/TLS flow.
- `assets/ppp_frame.html` - PPP frame structure.

Prompt examples are in `references/prompts.md`. Read them when you need protocol-specific phrasing or a starting structure.

## Quality Checklist

Before delivering:

- The protocol steps are ordered correctly.
- The packet fields and layer names are accurate.
- Animation timing supports explanation rather than distraction.
- Step text explains what changed at each stage.
- Security-related content stays educational and does not include usable attack code.
- The output file path is reported clearly.
