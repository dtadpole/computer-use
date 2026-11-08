---
title: Agent-core changes in M8
created: 2026-11-06T10:12:52Z
modified: 2026-11-06T15:24:26Z
level: L1
version: 0.1.5
description: The agent-core changes landed in M8 (from step timing on), each with its rule, the finding behind it and its pull request; continues the follow-ups after 0.3.3.
status: unverified
grounded_in:
  - source: _designs_/desktop-extension/agent-core-follow-ups.md@0.4.7 (the four rows moved here)
  - source: Linear CU-54, CU-61, CU-65, CU-70, CU-76, CU-81
---

# Agent-core changes in M8

These continue [agent-core follow-ups](agent-core-follow-ups.md). Each landed with unit tests in `_tests_/agent-core/`
and is held by a desktop verifier check or a unit test the verifier pinned.

| Change | Rule | Found by | PR |
|---|---|---|---|
| step timing | model turns, performed actions and observations record latency; the result totals it beside token use (CU-54) | D-049 | #122 |
| run-header seams | `run.json` names the input mode and any simulated scale or display region, so simulated frames are never read as real (CU-61, CU-70) | #125 review | #131 |
| long-task context | past 30 images, a request keeps the newest 10; placeholders replace the rest, text stays (CU-65). While a turn carries thinking it prunes only with `--prune-with-thinking allow` for a proven account; a refused cut is resent with the last accepted one and pruning stops (CU-84) | cu-researcher; cu-developer-one | #156, #195 |
| system prompts | clicks or keys on a system privacy/permission prompt, keys while the driver reports one, and `system_prompt` refusals hand off (CU-76) | cu-coordinator | #159, #166, #169 |
| static scripted plans | a static plan written for a desktop region at an integer backing scale plays when the frame shows that region at another (`--simulate-scale`), every coordinate mapped; any other frame stays `frame_mismatch` (CU-81) | cu-developer-two | #183 |
| presses | `left_mouse_down`, moves and waits, `left_mouse_up` in one batch become one drag, so nothing is held across turns; an unpaired press refuses the batch; after a pause, take-over or consent a press needs a fresh move (CU-64) | cu-researcher | #194, #202 |
| held keys and buttons | what a lost helper left down (released by the next), what the run held when the person's input stopped it, and what it held when the helper was lost are recorded by canonical name only and told on run control and the terminal, one notice per release whichever path reports it (CU-64 G1, G2) | cu-verifier | #203 |
| hold_key | `hold_key {keys, duration_ms}` (at most 10 s) is offered only where the environment lists it and judged as the same chord pressed; a held letter or Backspace is reported as one press; a bad duration is refused in seconds (CU-64 H1-H4, R3, R7) | cu-verifier, cu-researcher | #206 |

## Read next

Live-run changes are in [agent-core live runs](agent-core-live-runs.md); the rules behind the rows are in
[desktop rules](desktop-rules.md) and [input and targets](input-and-targets.md).
