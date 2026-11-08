---
title: Agent-core follow-ups after the desktop design 0.3.3
created: 2026-11-02T11:53:05Z
modified: 2026-11-06T10:13:32Z
level: L1
version: 0.4.8
description: The agent-core changes landed after design 0.3.3 from red-team, verifier, developer and live-run findings, each with its rule, pull request and test.
status: unverified
grounded_in:
  - source: _designs_/desktop-extension/agent-core-changes.md@0.3.7
  - source: _team_members_/cu-researcher/red-team-retest-2.md
---

# Agent-core follow-ups after 0.3.3

These follow [agent-core changes](agent-core-changes.md) C1-C9. Each landed with unit tests in
`_tests_/agent-core/`, and is held by a desktop verifier check or a unit test the verifier pinned.

| Change | Rule | Found by | PR |
|---|---|---|---|
| start apps before the first capture | the helper starts with an empty scope; each start app joins once always-covered or approved via `new_app`; none approved ends `declined` | design 0.3.4 | #201 |
| secure-field text | typing into a secure field, or under secure input, is recorded `[redacted]` on every decision | cu-verifier T2b | #205 |
| `terminal_view` | no typing into a view named as a terminal, console, shell, REPL, notebook or code cell; clicks allowed | red team E5 | #218 |
| clean environment | a desktop `startRun` whose environment holds a loader variable is refused before any helper starts, naming it | cu-developer-three | #229 |
| symlinked start | `cli.mjs` compares real paths, so a symlinked start runs instead of exiting 0 | cu-verifier | #235 |
| clean re-exec | a desktop CLI run re-executes once without loader variables, so DSH shells (`NODE_PATH`) work | integration | #238 |
| terminal consent | `--consent tty` reads only a real terminal and is refused from a pipe; a same-user pseudo-terminal is a residual | red team C1 | #244 |
| per-app pre-approvals | `class@bundle.id` binds to that app and must cover every class an action needs | cu-developer-two | #257 |
| run hooks | `startRun` takes `onEvent` (scrubbed lines), reports `started`, and keeps the live view only on `keepLiveView` | cu-developer-two | #257 |
| `new_app` names its app | every `new_app` request carries `app`, which the recipient need not be | cu-developer-two | #264 |
| copy and paste allowed | C9 reverted: copy, cut and paste chords and menu items pass in approved apps; P9 system chords stay refused | owner, D-031 | #489 |
| terminal lifetimes | terminal consent offers each offered lifetime, one key each (`a` for always); an unoffered key declines | cu-verifier | #498 |
| input mode | `run --env macos-desktop --input-mode global\|pid`; `pid` is keyboard-only after Q-D3 | cu-developer-three | #499 |
| excluded app named | excluded-target blocks and excluded-front hand-offs record the app's bundle id | cu-verifier | #536 |
| desktop instructions | the model gets desktop instructions: approved apps only, black areas, Mac keys, no navigate, fake prompts escalate | live-run check (D-034) | #540 |
| refused capture | a capture refused as a leak reaches neither the model nor the trajectory | D-035 | #562 |
| scope growth noted | an app joining the helper scope mid-run is noted with why (`always`/`approved`), bundle id only | impersonation probe | #566 |

## Read next

[Traceability](traceability.md) maps these to the desktop requirements; rules: [desktop rules](desktop-rules.md),
[helper boundary](helper-boundary.md), [input and targets](input-and-targets.md). Changes landed in M8 are in [agent-core changes in M8](agent-core-m8.md); later live-run changes are in [agent-core live runs](agent-core-live-runs.md).
