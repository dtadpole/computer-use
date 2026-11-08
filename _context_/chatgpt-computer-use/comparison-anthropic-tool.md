---
title: Anthropic Claude computer use tool reference
created: 2026-11-01T09:17:00Z
modified: 2026-11-01T09:37:18Z
level: L1
version: 1.1.0
description: Anthropic computer use tool versions per model, platform and beta header, actions per version, resolution guidance, screenshot history advice and the reference implementation
status: unverified
grounded_in:
  - source: platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool (fetched 2026-11-01)
  - source: raw.githubusercontent.com/anthropics/claude-quickstarts/main/computer-use-demo/computer_use_demo/tools/computer.py (fetched 2026-11-01)
  - source: raw.githubusercontent.com/anthropics/claude-quickstarts/main/computer-use-demo/computer_use_demo/tools/groups.py (fetched 2026-11-01)
  - source: platform.claude.com/docs/en/build-with-claude/vision (fetched 2026-11-01)
  - source: _context_/model-capabilities/claude-computer-tool.md (gateway probes 2026-11-01)
---

# Anthropic Claude computer use tool

## Versions, models and headers

| Version | `anthropic-beta` | Models and platforms [ant] | Actions |
|---|---|---|---|
| `computer_toolset_20260801` | none | Claude API, Google Cloud: Opus, Sonnet, Haiku 5.5; Opus 5, Sonnet 5, Opus 4.8, Fable, Mythos | 17 members, no `action` field [ant] |
| `computer_20251124` | `computer-use-2025-11-24` | Opus 4.7, Opus 4.6, Sonnet 4.6, Opus 4.5 everywhere; Opus 5, Sonnet 5, Opus 4.8, Fable, Mythos on AWS, Bedrock, Foundry (header table); 5.5 models on Bedrock | adds `zoom` behind `enable_zoom` [ref-impl] |
| `computer_20250124` | `computer-use-2025-01-24` | Haiku 4.5, Sonnet 4.5 | adds `left_mouse_down`, `left_mouse_up`, `scroll`, `hold_key`, `wait`, `triple_click` [ref-impl] |
| `computer_20241022` | `computer-use-2024-10-22` [ref-groups] | none listed | `key`, `type`, `mouse_move`, `left_click`, `left_click_drag`, `right_click`, `middle_click`, `double_click`, `screenshot`, `cursor_position` [ref-impl] |

Claude 5.5 and later accept only the toolset on the Claude API and Google Cloud; Claude Platform on AWS, Bedrock
and Foundry offer only earlier versions [ant]. **On our gateway only the toolset works:** accepted on model-a,
claude-sonnet-5-5, claude-opus-5, claude-sonnet-5, claude-opus-4-8; earlier versions rejected on all models
(measured 2026-11-01, [gateway]). Members, inputs and exact JSON: [wire shapes](comparison-anthropic-wire-shapes.md).

## Resolution guidance

- Coordinates are in pixels of the screenshot you return; keep the scale factor to map back [ant].
- Opus 4.7 and later (all toolset models) accept 2,576 px long edge and 4,784 visual tokens, earlier models 1,568 px
  and about 1.15 MP; an oversized result image is rejected, not downscaled [ant].
- Desktop 1024x768 or 1280x720; web 1280x800 or 1366x768; avoid above 1920x1080 [ant].
- macOS Retina screenshots are 2x logical coordinates: downscale or halve them [ant].
- Reference scaling targets XGA 1024x768, WXGA 1280x800, FWXGA 1366x768 [ref-impl].

## Loop advice

Prompt a screenshot and self-check after each step; put instruction text before the image; prefer keyboard
shortcuts for dropdowns and scrollbars [ant]. A screenshot costs roughly 1,000 to 1,800 input tokens, the toolset
definition about 4,500 [ant]. Above 20 images a request gets a stricter per-side limit [ant], which images within
3,000 px per side pass [vision]. Default pruning keeps the last three screenshots and prunes every 25 turns, for
the prompt cache; **on Claude 5.1 and later, do not prune on the client**, because removing a screenshot
"invalidates every later thinking block": resize and use server-side tool result clearing instead [ant].

## Reference implementation

A Docker container (Xvfb, Mutter, Tint2, Firefox, LibreOffice, xdotool) with an agent loop and web UI [ant],
[ref-impl]. Screenshots use gnome-screenshot or scrot; `type` sends 50-character chunks at a 12 ms
delay; most actions wait 2 s before the follow-up screenshot, except `type` (immediate), `wait` (after its
duration) and `screenshot`, `zoom`, `cursor_position` (no delay). `wait` and `hold_key` are capped at 100 s,
below the documented 300 [ref-impl].

## Safety

Advised: a dedicated VM or container, no sensitive data, domain allow-lists, human confirmation for
consequential or consent-requiring steps. Classifiers flag injections in screenshots; opt out via support [ant].

[ant]: https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool
[ref-impl]: https://github.com/anthropics/claude-quickstarts/blob/main/computer-use-demo/computer_use_demo/tools/computer.py
[ref-groups]: https://github.com/anthropics/claude-quickstarts/blob/main/computer-use-demo/computer_use_demo/tools/groups.py
[vision]: https://platform.claude.com/docs/en/build-with-claude/vision
[gateway]: ../model-capabilities/claude-computer-tool.md
