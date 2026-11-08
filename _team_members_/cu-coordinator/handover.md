---
title: '[cu] Coordinator - handover'
created: 2026-11-08T04:15:00Z
modified: 2026-11-08T04:15:00Z
version: 1.0.0
description: 'What a fresh [cu] Coordinator session needs to take over the seat mid-flight.'
grounded_in:
  - source: owner request relayed by hd-coordinator 2026-11-08T04:09Z (sessions to move to a DSH workspace on ~/dtadpole/this repository)
---

# [cu] Coordinator - handover

**Goal.** ULTIMATE_GOAL 2.0 (desktop computer use on native macOS); complete only when cu-verifier judges every row passing.
Verdict 0.9.34: seven of nine rows hold live. Two remain:

- **Consent and safety** - blocked by open High/Urgent under-asks under CU-145 / CU-171 (D-063 bar). The D-059 and
  D-061 tables are re-signed (#553, meta 289/0/0, D-064/D-065/D-069).
- **Human control** - needs the owner session: step 4 (CU-11), G2 (CU-119), CU-135's real-panel chain (#313).
  Two modes (owner-checklist.md): in person with confirmPhysical (CU-203, ~15 min, needs helper 0.2.50 installed)
  or over Screen Sharing with 5-minute hands-off starts (~25 min).

**Every 15 minutes** (schedule prompt): inbox, health/supervise (revive stalled seats; renew goals near 230 rounds),
Linear triage (`/tmp/cu-coord/lin.py`; Urgent/High under-asks block CU-16), one review in roster order
(`execution-review-log.jsonl`), decisions into `decision-log.yaml` (last D-069), land with `/tmp/cu-coord/land.sh`,
Chinese summary to the owner with the session ask and the checklist link.

**Rules that bite.** Synthetic input only through CUHelper (D-056, no exceptions); owner-idle rule follows input
(D-066, D-068: no TTY/env exemption, only a hardware Confirm click); only cu-verifier sets Done; records PRs are
landed by their author; never read ~/.dsh, ~/Library or home folders.

**Owner items.** A time and mode for the owner session; dismiss two notification alerts; quit Typeless; the Mac-wide
paste setting (D-052); GitHub app; initiative scope; say 继续 to rearm the coordinator goal.

**Paths.** Records `~/reflection--cu-coordinator/_projects_/computer-use/`; code main checkout
`~/dtadpole/this repository` (symlink `~/computer-use`), seat worktrees `~/computer-use--<seat>`.
