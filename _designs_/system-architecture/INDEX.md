---
title: computer-use system architecture
created: 2026-11-01T09:24:10Z
modified: 2026-11-08T23:55:00Z
version: 0.9.6
description: Entry point to the M1 contract of our computer-use agent - components, owners and the articles that fix each interface.
grounded_in:
  - source: ULTIMATE_GOAL.md@1.0.0
  - source: _context_/chatgpt-computer-use/INDEX.md@1.0.0
---

# System architecture (approved, M1)

One run: a caller hands a task to the **agent core**, which loops model turn, policy, environment action,
screenshot, until an outcome. Everything crosses one of five interfaces.

```
caller (CLI, MCP tool) -> agent core loop <-> model adapter (claude-gateway | responses | scripted)
                               |  policy + consent gate <-> controller (CLI, live view, caller)
                               v
                          environment driver (chrome-browser; desktop at M5) -> trajectory run dir
```

| Article | Fixes |
|---|---|
| [layout-and-ownership](layout-and-ownership.md) | folders, owners, runtime paths |
| [action-schema](action-schema.md) | canonical actions and results |
| [keys-and-coordinates](keys-and-coordinates.md) | key names, modifiers, scaling |
| [anthropic-mapping](anthropic-mapping.md) | Claude toolset to canonical |
| [environment-driver](environment-driver.md), [environment-behaviour](environment-behaviour.md) | the driver interface; developer-two's decisions |
| [model-adapters](model-adapters.md) | the adapter interface, three adapters |
| [long-task-context](long-task-context.md) | screenshots pruned past a ceiling (CU-65) |
| [agent-loop](agent-loop.md), [run-outcomes](run-outcomes.md) | loop, bounds, cancel, statuses |
| [action-policy](action-policy.md), [action-classes](action-classes.md), [consent-gate](consent-gate.md) | allow, confirm, block, hand-off |
| [consent-authority](consent-authority.md), [run-tokens](run-tokens.md) | who may consent; view and control tokens |
| [site-filter](site-filter.md) | one URL decision, loopback aliases |
| [untrusted-content](untrusted-content.md) | injection, escalation, secrets |
| [trajectory](trajectory.md), [live-control](live-control.md) | records, replay, human control |
| [integration-surface](integration-surface.md) | the M4 tool |
| [traceability](traceability.md), [goal-checks](goal-checks.md) | R1..R53; a check per row |
| [final-answer-lines](final-answer-lines.md) | the ANSWER (D-057) and OUTCOME lines |
| [keyboard-activation](keyboard-activation.md), [menu-key](menu-key.md) | a key activating a button or bound menu item, judged like a click |
| [press-and-drop](press-and-drop.md) | a press or drag judged at control and drop zone |
| [paste-consent](paste-consent.md), [paste-chords](paste-chords.md), [no-focus-count](no-focus-count.md) | paste judged by what it inserts; its chords; no own copy asks |
| [copy-source](copy-source.md), [copy-caption](copy-caption.md) | a copy or drag carries its source's or caption's class |
| [drag-text](drag-text.md) | a text drag onto an entry judged as a paste |
| [password-memory](password-memory.md) | a seen password field stays one when shown |
| [text-entry-focus-click](text-entry-focus-click.md) | a focus click takes no class from the entry's name |
| [frame-focus](frame-focus.md) | the browser focus followed into a cross-origin frame; `frameUrl`, `frameHost`, `defaultButtonRead`; never weaker than the frame-host rules (CU-300, proposed) |
| [reply-text-entered](reply-text-entered.md) | a bare Reply free only with every entry empty |
| [consent-routes](consent-routes.md) | the D-059 route audit and sign-off; [limits](consent-limits.md) |
| [sensitive-classes](sensitive-classes.md) | D-061: sensitive classes' value and name rules |
| [open-questions](open-questions.md) | questions, defaults, review state |

Approved by the coordinator at 687f4336b, design 0.8.1 (D-015). A change is a design revision with a version
bump, proposed to cu-developer-one by inbox.
