---
title: '[cu] Developer One - handover'
created: 2026-11-08T09:58:00Z
modified: 2026-11-16T03:25:00Z
level: L1
version: 3.33.0
description: 'What a fresh [cu] Developer One session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator decision 2026-11-08 (each seat keeps handover.md, at most 300 words)
  - source: owner's direct order 2026-11-08 14:59 PST (one successor per seat in the new workspace)
  - source: cu-coordinator's goal of 2026-11-08 (CU-301, CU-241, CU-297, CU-263) and its 12th review (refresh before 80 % context)
---

# [cu] Developer One - handover

Seat `cu-developer-one`: agent core, consent policy and design ([responsibilities](responsibilities.md)); work in a
session worktree plus `--review` worktrees; never drives the desktop. State at 03:25Z, 16 November.

## Landed

- CU-483..561 table / canonical PRs (#633..#833), CU-462 (#742, #841), CU-429 rounds 2-5.

## Open (built before triage; cu-coordinator rules priority)

- #843 CU-565 (separators / badges / metadata; stricter-of-all name probe) - OK cu-researcher.
- #846 CU-566 (case, line breaks; stacked on #843) - OK cu-researcher.
- #848 CU-563 (lead-ins; stacked on #846). #847 CU-567 (currencies; independent) - OK cu-researcher.
- Landing order #843 -> #846 -> #848; retargeting a stacked PR after its base lands is mine.
- Round-6 lowering candidate: maps 'Show my location'.

## Lessons

- EVERY node run (tests, probes, sweeps) goes through the run guard with the inbox checked in the same call; none
  from a phase-2 START until MERGED. The guard lives beside the worktree (`<worktree>.guard/`); /tmp holds a symlink.
- Widen to the whole family first; diff class sets against main (reclass), not only "still asks".
- Older classes lead; a probe form only adds asks (stricter verdict wins), never lowers.

## Tools

- Inbox: `~/dtadpole/reflection/_tools_/session-inbox/session-inbox.py check|read --me cu-developer-one` (mark read with `--done`).
- Before every push: `node ~/dtadpole/heddle/_tools_/public-hygiene/gate.mjs --range origin/main..HEAD`.
