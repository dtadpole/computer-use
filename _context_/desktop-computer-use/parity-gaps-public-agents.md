---
title: Parity gaps against public computer-use agents - six capabilities with a proposed test each
created: 2026-11-06T04:07:14Z
modified: 2026-11-06T18:33:19Z
level: L1
version: 1.3.0
description: Where our desktop computer use falls short of the documented Anthropic computer use toolset, OpenAI's computer tool and ChatGPT desktop Computer Use, on displays, scale, clipboard, scrolling, input vocabulary and long tasks, each with a proposed test.
status: unverified
grounded_in:
  - source: _context_/run-analysis/desktop-suite-2026-11-06.md
  - source: _context_/desktop-computer-use/parity-from-runs.md
  - source: 'dtadpole/computer-use main, macos-desktop environment.mjs, input-plan.mjs, keys.mjs, agent-core adapter-claude.mjs'
  - source: platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool (fetched 2026-11-06)
  - source: learn.chatgpt.com/docs/computer-use (fetched 2026-11-06)
  - source: developers.openai.com/api/docs/guides/tools-computer-use (fetched 2026-11-06)
---

# Parity gaps against public computer-use agents

Today's runs (one 1920 by 1080 scale-1 display, items of 2 to 6 steps) cannot show these gaps; each needs its own
test. Code facts are from computer-use main; public facts from the three sources above.

| Gap | Ours today | Public agents | Proposed test |
|---|---|---|---|
| 1 Multiple displays | Captures and acts on the main display only | ChatGPT covers every display in locked use | Dry-run world with a second display at negative and positive origins and the fixture window on it; the click lands, the hit window holds across the seam, a window spanning both is handled |
| 2 Retina scale 2 | Per-axis mapping proven through the simulated-scale capture seam only; no model run at scale 2 | Anthropic tells integrators to account for the 2x ratio on macOS | Rerun six precision items (small-print, stepper, date-entry, context-menu, drag-to-folder, scroll-find) at simulated scale 2, both models; pass within one item of scale 1, miss distance logged |
| 3 Clipboard | Copy, cut and paste chords allowed; the driver never reads the pasteboard; no item uses them | ChatGPT acts on clipboard state in the target app | Item: copy an invoice number in CU Ledger, paste it in CU Fixture; the judge requires the pasted value and fails a stale paste |
| 4 Scroll precision | Pixel deltas with held modifiers; no item measures overshoot | Anthropic scrolls by wheel clicks with modifiers | Screen with a 300-row list and a nested horizontal grid; "open row 237", "show column Q"; record scrolls to target and overshoots |
| 5 Input vocabulary | Chords with repeat, modifier-held clicks; no timed key hold, separate button down and up, or cursor query | Anthropic offers hold_key, left_mouse_down and up, cursor_position | Items for Command-click multi-select, Shift-click range, Option-drag copy, and a shortcut learned from its menu; each needed member is filed if a model reaches for it |
| 6 Long tasks | Every screenshot stays in the request; caps 20 steps, 10 minutes, 1 USD | Anthropic warns that over 20 images tightens image limits and advises clearing old results | A 50-step grid-entry item at 80 steps, 20 minutes, 3 USD; tokens per step and images per request recorded, then rerun with old screenshots cleared |

Gaps 1 and 2 also belong to cu-developer-three's display work (D-049); the tests here are the evaluation side.
Gaps 3 to 6 need new fixture screens, designed in
[third-batch-screens](../evaluation-design/third-batch-screens.md).

## Status at 18:30Z

- Gap 2: 24 of 24 at simulated 1.04 and 1.32 (CU-61, CU-71); no real Retina display yet.
- Gap 3: the clipboard item passes for both models (CU-62).
- Gap 4: far and horizontal scrolling pass (CU-63); overshoot is measured, 0 to 1 column, and nested
  scrolling passes for both models (CU-90).
- Gap 5: hold and press-hold are being built (CU-64, CU-85 to CU-88); hover-only values now have an item
  (S10), whose first live pair exposed a leftover pointer (CU-108).
- Gap 6: pruning works, but is off by default for thinking models (CU-65, CU-84).
- Gap 1 stays open: this Mac has one display (CU-60).

## Read next

[parity-from-runs](parity-from-runs.md).
