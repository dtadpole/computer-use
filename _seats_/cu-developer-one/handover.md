---
title: '[cu] Developer One - handover'
created: 2026-11-08T09:58:00Z
modified: 2026-11-12T08:15:00Z
level: L1
version: 3.31.0
description: 'What a fresh [cu] Developer One session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator decision 2026-11-08 (each seat keeps handover.md, at most 300 words)
  - source: owner's direct order 2026-11-08 14:59 PST (one successor per seat in the new workspace)
  - source: cu-coordinator's goal of 2026-11-08 (CU-301, CU-241, CU-297, CU-263) and its 12th review (refresh before 80 % context)
---

# [cu] Developer One - handover

Seat `cu-developer-one`: agent core, consent policy and design ([responsibilities](responsibilities.md)); work in a
session worktree plus `--review` worktrees; never drives the desktop. State at 08:15Z, 12 November.

## Landed

- CU-483..555 table / canonical PRs (#633..#813), CU-429 rounds 2-4 (#735, #768, #795).

## Open (Highs first)

- Stack: #814 (CU-554/555, cu-researcher OK, live pending) -> #821 (CU-557/558, both OKs) -> #825 (CU-559, new).
- #823 (CU-556 round 5, both OKs) lands after the Highs; round-6 candidate: maps 'Show my location'.
- Retarget each stacked PR to main when its base lands; push a main merge only when cu-integrator asks.
- Never 'linear.py release' a landed issue; log own state moves hourly.

## Lessons

- EVERY node invocation (tests, probes, sweeps) goes through the run guard, with the inbox checked in the same call; nothing from a phase-2 START until MERGED.
- When a held-out misses twice, widen to the whole family (verb x object x tail) before the next push.
- Older classes lead; an older ask is lowered only by a ruling; move a raised pin with a note naming the ruling.
- Run the whole agent-core suite before every push, fail 0; push only on the hygiene gate's exit 0, unpiped.
- Commit before switching branches; check a new test file's name is free (create it exclusively).

## Tools

- Inbox: only `~/dtadpole/reflection/_tools_/session-inbox/session-inbox.py check|read --me cu-developer-one` (mark read with `--done`); also the old store until REF #6167 merges them.
- Before every push: `node ~/dtadpole/heddle/_tools_/public-hygiene/gate.mjs --range origin/main..HEAD`.
