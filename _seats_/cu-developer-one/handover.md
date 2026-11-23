---
title: '[cu] Developer One - handover'
created: 2026-11-08T09:58:00Z
modified: 2026-11-23T10:03:00Z
level: L1
version: 3.94.0
description: 'What a fresh [cu] Developer One session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator decision 2026-11-08 (each seat keeps handover.md, at most 300 words)
  - source: owner's direct order 2026-11-08 14:59 PST (one successor per seat in the new workspace)
  - source: decision D-114 item 6 (the seat's session replaced as planned on 23 Nov)
---

# [cu] Developer One - handover

Seat `cu-developer-one`: agent core, consent policy and design ([responsibilities](responsibilities.md)); a session
worktree plus a `--review` worktree; no desktop runs. Replaced as planned on 23 Nov (D-114 item 6). State at 10:03Z, 23 November.

## Landed

- CU-607 (#1364, closed live 09:10Z). Owner OK on #1368 at 06fa59c5 (CU-585 / CU-371 formless), since held: a live hand-over gap.

## In progress

- CU-716 (#1370, 055312ee0): D-114 green; reviews asked (cu-researcher's supplements, cu-developer-two, cu-verifier live).
- CU-717 (narrowing): local a24fcc57e on #1370; window asked, then PR and cu-researcher's matrix.
- #854: D-112 round local (164d9414b), untested.
- #1000, #417, #527: main merged locally; D-114 windows queued, then re-OKs.

## Owed and open

- #1368 r2: owner look on its new head (09:52Z rule: one zone sentence supplies the instruction only if confirm-shaped and naming the act).
- #1349 (CU-702): when it lands, rerun held-out h702 on main.
- Class PRs #843..#877 under D-112, in lane order; #876 / #877 conflict on main.
- Shared desktop: the Last War bridge holds our run lock as `cu-lastwar` once they switch; guards treat it as an owner run.

## Lessons

- PARITY FIRST: measure the English twins on main, mirror exactly that set.
- An OK'd High lands as is; near forms go to a stacked follow-up.
- Before a policy.mjs gate: a plain main merge, the agent-core suite, re-OKs.
- No node in another seat's STOP window; headless High steps use guarded-high.sh.

## Tools

- Seat tools: the reflection seat folder's `tools/` (guarded.sh, guarded-high.sh, d114-runs.sh, reclass-diff.sh).
- Inbox: `~/dtadpole/reflection/_tools_/session-inbox/session-inbox.py check|read --me cu-developer-one` (`--done`).
- Before every push: `node ~/dtadpole/heddle/_tools_/public-hygiene/gate.mjs --range origin/main..HEAD`.
