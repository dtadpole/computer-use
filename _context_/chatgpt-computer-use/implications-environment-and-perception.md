---
title: Requirements for our computer use, environment and perception
created: 2026-11-01T09:18:00Z
modified: 2026-11-01T09:37:50Z
level: L1
version: 1.1.0
description: Requirements R1 to R13 for the execution environment and screen perception of a self-built computer-use system that matches ChatGPT behaviour
status: unverified
grounded_in:
  - source: developers.openai.com/api/docs/guides/tools-computer-use (fetched 2026-11-01)
  - source: developers.openai.com/api/docs/guides/tools-computer-use-integration (fetched 2026-11-01)
  - source: learn.chatgpt.com/docs/computer-use (fetched 2026-11-01)
  - source: _context_/model-capabilities/claude-images.md (gateway probes 2026-11-01)
  - source: _context_/team-operations/decision-log.yaml (D-006, D-008)
---

# Requirements, environment and perception

Levels: **MUST** for parity with ChatGPT's baseline behaviour, **SHOULD** for strong parity, **LATER** for
follow-up stages. Each row cites the article it derives from. IDs never change or get reused; a new requirement
takes the next free number and sits beside related rows. Continues in
[actions and loop](implications-actions-and-loop.md).

## Environment

| ID | Level | Requirement | From |
|---|---|---|---|
| R1 | MUST | Run the agent browser as isolated Chromium (installed Chrome, headless, over CDP per D-008): a fresh throwaway profile, no inherited environment secrets, extensions off, Chrome's sandbox on | [isolation](safety-isolation-and-approvals.md) |
| R2 | MUST | Enforce the site allow and block lists (exact domain or all subdomains) at the network layer (CDP request interception), not only by URL checks before navigation | [browser toolset](api-sdk-browser-toolset.md) |
| R3 | MUST | Keep one environment alive per run, stored separately from model conversation state | [api](api-contract.md) |
| R4 | MUST | Tag every tool call with its execution site and apply that site's policy | [work and dots](product-work-and-dots.md) |
| R5 | SHOULD | Run generated code in a disposable least-privilege boundary away from API credentials, with limits enforced inside it and network held to an allow-list | [code execution](api-code-execution.md) |
| R6 | LATER | Native macOS app control through Screen Recording and Accessibility, gated by per-app approval; only after the owner approves it (D-006) | [desktop](product-desktop-computer-use.md) |
| R7 | LATER | Hosted desktop or VM for Linux desktop tasks, since Docker is unavailable; owner approval first (D-006) | [environments](comparison-environments.md) |

## Perception

| ID | Level | Requirement | From |
|---|---|---|---|
| R8 | MUST | Capture a screenshot whenever UI state is unknown and one after every action batch | [api](api-contract.md) |
| R9 | MUST | Send each screenshot within the model's limits, resized by us, near 1280x800 to 1440x900: OpenAI `detail: "original"` under 30,000 patches; Claude toolset at most 2,576 px on the long edge and 4,784 visual tokens, which the gateway rejects rather than shrinks | [actions](api-action-handling.md), [Claude images](../model-capabilities/claude-images.md) |
| R10 | MUST | Keep one coordinate space: device scale factor 1; remap after downscaling or cropping | [actions](api-action-handling.md) |
| R11 | SHOULD | Offer structured page reads with text, element refs and roles beside screenshots, bounded by our own size caps (the SDK sets none for elements or page size) | [browser toolset](api-sdk-browser-toolset.md) |
| R12 | SHOULD | Provide region zoom at full resolution without changing the coordinate frame; until it exists, withhold the Claude `zoom` member through `configs` | [Anthropic tool](comparison-anthropic-tool.md) |
| R13 | LATER | Approved developer diagnostics (console, network, DOM) through CDP | [browsers](product-browsers.md) |

**Inference:** R1 to R3 plus R8 to R10 form the smallest working slice on a Mac with headless Chrome; the rest
can follow.
