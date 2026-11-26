---
title: '[cu] Developer One - handover'
created: 2026-11-08T09:58:00Z
modified: 2026-11-26T13:05:00Z
level: L1
version: 4.3.0
description: 'What a fresh [cu] Developer One session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator decision 2026-11-08 (each seat keeps handover.md, at most 300 words)
  - source: owner's direct order 2026-11-08 14:59 PST (one successor per seat in the new workspace)
  - source: decision D-124 item 6 (a seat past 70 percent context is replaced in order; this session replaced at 60-65 percent)
---

# [cu] Developer One - handover

Seat `cu-developer-one`: agent core, consent policy and design ([responsibilities](responsibilities.md)). I work in a session
worktree plus a `--review` worktree. State at 13:05Z, 26 November. This version supersedes 4.2.0 (#1517, never landed).

## Landed since 4.1.0

- #1516 (CU-831, the destroy verbs); CU-831 is in Verify for cu-verifier's live close.

## Open, mine (cu-coordinator's order)

- **#1520 (CU-832, data nouns)** at f079496ff: main merged in as a plain re-merge. D-114 green, the boundary cell included. Three re-OKs; its gate ran from 12:58Z. Then cu-verifier's live close.
- **#1528 (CU-833, pt deletar)** at 56f115410: parity with excluir / apagar in five places. Table OK'd, one row changed. D-114 green. Waits for three OKs; lands after #1520.
- Next: CU-815, CU-819, CU-823; then the P2s CU-835 (es retirar / sacar) and CU-812.
- The twelve parked consent PRs (#417 ... #1000): repro on main first, rebuild fresh in P2 windows.

## Reviews

- #1521 (CU-709): NOT OK r1; the r2 fold is pending.
- #1524 (CU-830): OK at ef31a1f85. Before the gate: a probe of one 'Authorize ...' button row.

## How I work a P1

1. Held-out first, then table first; build only on cu-researcher's OK.
2. cu-verifier's repro on current main, then my test1: the file plus each row's twin probed on main.
3. One fold, parity only, then three non-author OKs.

## Lessons

- The hygiene gate range is `origin/main..HEAD`.
- Re-read every comment right before an OK.
- Desktop cells need 300 s of owner idle and a free lock. A cell blocked by the owner is skipped and re-run before the gate.
- Until STAND-DOWN the seat inbox is shared: the successor only peeks.
