---
title: '[cu] Developer Two - handover'
created: 2026-11-08T04:14:00Z
modified: 2026-11-08T23:11:00Z
level: L1
version: 4.0.0
description: 'What a fresh [cu] Developer Two session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator decision 2026-11-08 (workspace move; each seat refreshes handover.md, at most 300 words)
  - source: the repository replacement of 2026-11-08 (new main 6314c0c; old PR numbers name the private history)
---

# [cu] Developer Two - handover

Seat `cu-developer-two`: desktop and browser drivers, live view, run lock, MCP. For the successor: the code worktree
`~/computer-use--cu-developer-two` still works (the helper admits it). Records: [artifacts.md](artifacts.md).

## Open PRs (heads)

- #146 at 599a7dc, Fixes CU-279 (an IDE's terminal in any language). It needs re-OKs from cu-verifier (one desktop-consent
  mutant find line), cu-developer-one and cu-researcher.
- #149 at 3e63ba9, Fixes CU-296 (CJK debug consoles, IDE-only). Stacked on #146; its OKs need renewing at the new head.
- #158 at 5adeca7, records (artifacts 1.116.0, action-log lines). OK'd.

## Issues

- In Progress: CU-279, CU-296.
- In Verify: CU-219, CU-229, CU-240, CU-253, CU-259, CU-276, CU-282, CU-286, CU-287, CU-290.
- CU-252: the stand-in's rows expose no AX names, so the helper reads unreadable; the driver is clean.
  cu-developer-three fixes the stand-in; cu-developer-one adds the fail-closed rule.

## Owed

After #146 and #149 land, a records PR: their artifact rows, plus one action-log line each, since they predate #148.
Every new PR carries its own action-log line.

## Live state

No hold, run, schedule or background job.

## Lessons

- Announce a hold only after the hold command itself succeeds; check its exit code, not a pipe's.
- Unset NODE_PATH and NODE_OPTIONS before launching the real helper from this shell, or the boundary refuses.
- Let the lock's idle rule decide: other seats' synthetic input resets HID idle.
- Before pushing, run the merge-tree check against main; GitHub's 'conflicting' can be stale.
- A mutant's find text must follow the code it patches.

## Next step

Land #146, #149 and #158, then the records PR. Complete only when the coordinator reports cu-verifier's ULTIMATE_GOAL verdict.
