---
title: Evidence audit of the ULTIMATE_GOAL 2.0 verdict (CU-53)
created: 2026-11-06T04:13:54Z
modified: 2026-11-06T04:13:54Z
level: L1
version: 1.0.0
description: cu-verifier's audit (D-049) that every issue, decision, PR, run and record the verdict cites still resolves, and that its claims hold on today's computer-use main and the installed helper; findings and the fix for each.
status: ratified
grounded_in:
  - source: _team_members_/cu-verifier/ultimate-goal-2-verdict.md@0.9.9
  - source: _context_/team-operations/decision-log.yaml
---

# Evidence audit of the ULTIMATE_GOAL 2.0 verdict (CU-53)

Audited 2026-11-06 against verdict 0.9.9, computer-use main 94e2b1b0b and the installed CUHelper 0.2.25
(executable sha256 c3d752f5...).

| Layer | What was checked | Result |
|---|---|---|
| 1. Direct citations | 21 Linear issues, 3 decisions, 1 link, the grounding | issues as stated: 19 Done, CU-11 Todo (step 4, stated open), CU-48 Backlog (the named limit); D-043, D-047, D-048 in decision-log.yaml; link resolves; grounding stale (finding 2) |
| 2. Each issue's verification note | the PRs and runs each Done issue's note cites | every Done issue carries verifier evidence; 39/39 PRs merged in dtadpole/computer-use; 21/22 runs resolve, one missing (finding 1) |
| 3. Claims on today's build | the suites behind the rows | agent-core 202/202, live-view 47/47, desktop-suite 14/14, computer-use-mcp 60/60, macos-helper 33/33 (live unit checks included) |

## Findings and fixes

1. CU-12's run 20261105T171042Z-35dcb7 no longer resolves (its /tmp directory was removed after the 0.2.16
   check). Re-proven on main 94e2b1b0b and 0.2.25 with the tracked _tools_/live-view/live-probe.mjs: 3/3 (no frame
   outside the scope, the watch token refused control with 403, pause, resume, take over, hand back and stop). Run
   20261106T040938Z-44bf5b; noted on CU-12.
2. The verdict's grounded_in named the frozen copy that D-042 removed. The goal moved unchanged, byte for byte,
   still 2.0.0, to ULTIMATE_GOAL.md. Re-pointed in verdict 0.9.10.
3. My CU-4 note gave agent-core as 204/204; it is 202/202. Corrected on CU-4; the verdict is unchanged.
4. linear.py's issue query reads comments(last:5), which on a long thread does not return the verification note,
   so show cannot display it. This audit read every comment (first:100). Reported to the tool's owner.
5. Run evidence lives under /tmp, which a reboot clears. The verdict rests on the issues' notes and the records,
   and each live claim has a tracked probe to re-prove it (live-probe.mjs, the Q-D15 gate, the desktop suite).

Nothing found changes a row's state. The verdict stays at 8 of 9 rows; step 4 (CU-11) remains.
