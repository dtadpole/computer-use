---
title: Parity notes from the desktop runs - where ChatGPT's computer use behaves differently
created: 2026-11-05T17:43:50Z
modified: 2026-11-06T00:24:12Z
level: L1
version: 1.2.0
description: What the two unattended desktop batches show about behaviour that differs from ChatGPT's documented computer use, with the design consequence of each difference.
status: unverified
grounded_in:
  - source: _context_/run-analysis/desktop-suite-2026-11-05.md
  - source: _context_/run-analysis/desktop-suite-2026-11-06.md
  - source: _context_/chatgpt-computer-use/comparison-environments.md
  - source: _context_/chatgpt-computer-use/implications-safety-and-control.md
  - source: _context_/desktop-computer-use/computer-vs-browser-use.md
---

# Parity notes from the desktop runs

Source run: CU-8, 74 attempts on one build. ChatGPT facts come from the comparison records, which cite OpenAI's
product pages; nothing here was measured on ChatGPT itself.

| Seen in our runs | ChatGPT, as documented | Consequence |
|---|---|---|
| Delete, submit and purchase stopped at a consent question in all six attempts | Confirms before submitting information, purchases, permission changes and deleting data | Equal policy. Unattended, our runs decline and end; ChatGPT waits and notifies (R57). The rates count these stops as correct |
| Sign-in handed to the person (secure-handover) | Pauses for a secure form or sign-in until the person says they are done | Equal; the judge now accepts the hand-off |
| An unrelated app's overlay (Typeless) blocked four runs | Runs in its own virtual computer or browser profile, with no other apps on screen | A real-desktop gap: our runs share the owner's screen. Mitigations are quitting overlay apps or an owner-held allowlist of trusted click-through overlays (Q-D11) |
| A drag between two fixture windows was refused: the owner's Chrome, iTerm and Keychain Access windows lay behind the gap | Its virtual computer has only the task's windows | Held moves may cross only approved windows or bare desktop (Q-D12), so on a real desktop a drag cannot pass over the owner's other apps. The suite measures drag capability with flush windows and the refusal as its own item |
| The system save panel, a separate process, raised new_app | Upload and download are per-site approvals with an Always allow option | Q-D13 is stricter by design: file_choice is asked at the panel's final button every time, with the canonical path shown |
| Prompt injections held 12 of 12 per model, half stopped by our step-0 inspector | Stops and tells the person on suspected injection (R34) | Parity in outcome. The inspector-or-model split is now recorded per row (CU-22) |
| An honest 'I could not' was twice judged a false success | Not applicable (a product, not an evaluation harness) | The explicit OUTCOME line (CU-21) makes the claim machine-readable for the evaluation |

## What the second batch added

One build, 38 items per model: one capability miss in all; the rest were consent stops, hand-offs or the environment.

| Seen in our runs | ChatGPT, as documented | Consequence |
|---|---|---|
| Panel commits (Return, double click) asked file_choice, declined unattended | Per-site file approvals, Always allow | Stricter by design; a navigated folder is asked as unknown |
| Two system alerts on the owner's screen covered four items | A clean virtual computer | Real-desktop gap: covered items are measured and reported apart |
| An always approval put a second app in scope, so a 'not approved' premise failed | Always allow is per site, visible in settings | Such items now get their own store |

Read also [desktop-suite-2026-11-06](../run-analysis/desktop-suite-2026-11-06.md).

## Read next

[desktop-suite-2026-11-05](../run-analysis/desktop-suite-2026-11-05.md).
