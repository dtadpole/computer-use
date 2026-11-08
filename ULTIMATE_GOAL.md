---
title: Computer Use Ultimate Goal
created: 2026-11-01T09:06:25Z
modified: 2026-11-02T08:25:00Z
level: L2
version: 2.0.0
description: What completes the computer-use project - an agent that operates apps on the owner's Mac through screenshots and operating-system mouse and keyboard input, scoped to apps the owner approves, with ChatGPT-grade consent and human control, every part judged by a verifier.
status: unverified
grounded_in:
  - source: owner request in the dsh session 2026-11-01 (learn how computer use on ChatGPT works and implement our own in this repository)
  - source: owner correction and choice 2026-11-02 (it is computer use, not browser use; native macOS, app-scoped) - decision D-024
  - source: _context_/chatgpt-computer-use/product-desktop-computer-use.md
goal_state: pursuing
as_of: 2026-11-02
evidence: the verifiers under _verifiers_/, one per row below; version 1 (browser use) was achieved on 2026-11-01 (D-023)
---

# Ultimate Goal

**This project is complete when a DSH or heddle session can hand a natural-language task to our computer-use
agent, the agent completes it by seeing the screen and driving mouse and keyboard in apps on the owner's Mac, and a
person can watch, approve, take over and stop it, the way ChatGPT's Computer Use works on macOS.**

Computer use operates a whole desktop - any app, window, menu, file dialog and the flow between apps. Browser use,
version 1 of this goal, only acts inside the pages of one browser; it stays as one environment
([D-024](_context_/team-operations/decision-log.yaml)).

| Part | Satisfied when |
|---|---|
| environment | our own helper app, the only process granted Screen Recording and Accessibility, sees and acts in macOS apps the owner approves, on the owner's Mac |
| perception | every step returns a screenshot of the target app or display at a declared resolution; Retina and downscaling are mapped back, and a check proves a click lands on the intended point |
| action contract | the GA computer action set - `click`, `double_click`, `drag`, `move`, `scroll`, `keypress`, `type`, `wait`, `screenshot` - runs as operating-system input, batched and in order; an unsupported or malformed action is refused by name |
| agent loop | one loop runs against more than one model behind adapters; every run is bounded by steps, wall time and cost, and can be cancelled |
| consent and safety | each app needs the owner's approval (once or always, revocable); terminal apps, DSH and ChatGPT, our own control page, password managers and OS security or authentication prompts are never operated; a consequential action pauses for a human decision; on-screen instructions escalate instead of being followed |
| human control | a person can watch live, pause, take over, hand back and stop; automation pauses when the person uses the keyboard or mouse |
| integration | a DSH session and a heddle session call it as a tool, and the result includes the final screenshot and a trajectory link |
| trajectory | every step's screenshot, actions, model summary and safety decisions are recorded and replayable, with nothing captured outside approved apps |
| evaluation | a desktop fixture suite (at least 20 tasks with machine-checkable outcomes in the team's own fixture apps and sandboxed files) and at least 10 injection screens run unattended, with pass rates per model and build |

## What this file deliberately does not say

- **Not "controls the whole Mac".** Only approved apps, never the exclusions above; the grants belong to our
  helper alone.
- **Not Windows or a Linux VM.** They can follow on a later owner decision.
- **Not "better than ChatGPT".** Parity of behaviour and of human control is the bar; scores are recorded.
- **Not "inside the heddle repository".** The code lives in this reflection project.
