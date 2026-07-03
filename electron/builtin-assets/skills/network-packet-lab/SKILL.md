---
name: network-packet-lab
description: Use this skill whenever the user asks about Wireshark, tcpdump, packet capture, pcap analysis, HTTP/DNS/TCP/DHCP/TLS capture interpretation, network lab reports, protocol fields observed in packets, or troubleshooting packet flows for learning and coursework.
allowed-tools: file_read, file_write, office_read, pdf_read, kb_search
---

# Network Packet Lab Skill

Guide safe, educational packet capture labs and capture interpretation. Focus on what the packet shows, why it appears, and how it proves the protocol mechanism.

## When To Use

Use this skill for:

- explaining a Wireshark screenshot, exported text, CSV, or pcap summary;
- designing labs for DNS lookup, TCP handshake, HTTP request/response, DHCP, ARP, ICMP ping, TLS handshake, routing path, NAT observation;
- writing lab reports from user-provided observations;
- diagnosing learning-level connectivity problems such as DNS failure, wrong gateway, closed port, retransmission, or MTU symptoms.

## Safety Boundary

- Keep the work educational and defensive.
- Do not provide instructions for unauthorized scanning, exploitation, credential capture, session hijacking, bypassing security controls, or stealth.
- If a lab involves a live network, tell the user to use their own device, local VM, school lab environment, or explicitly authorized network.

## Capture Analysis Workflow

1. Identify the protocol and layer.
2. Extract key fields: endpoints, ports, sequence/ack numbers, flags, TTL, IDs, query names, status codes, certificates, or options.
3. Reconstruct the timeline.
4. Explain what each packet proves.
5. Tie the observation back to the concept.
6. Produce a lab report or visual summary if useful.

## Lab Report Template

```markdown
# [Protocol] Packet Capture Lab

## Objective
[What concept the lab proves.]

## Environment
- Client:
- Server:
- Tool:
- Filter:

## Procedure
1. ...

## Key Observations
| Step | Packet/Field | Meaning |
|---|---|---|

## Protocol Explanation
[Explain the mechanism shown by the capture.]

## Common Errors
- ...

## Conclusion
[What the student should remember.]
```

## Helpful Display Filters

Give filters as learning aids, not as attack instructions:

- DNS: `dns`
- TCP handshake: `tcp.flags.syn == 1 || tcp.flags.ack == 1`
- HTTP: `http`
- TLS: `tls`
- DHCP: `bootp`
- ARP: `arp`
- ICMP: `icmp`

## Coordination

- Use `network-protocol-viz` to turn the reconstructed packet timeline into an HTML animation.
- Use `computer-network-learning` to explain prerequisite concepts.
- Use `network-exam-practice` to turn the lab into questions after the explanation.
