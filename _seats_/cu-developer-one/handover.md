---
title: '[cu] Developer One - handover'
created: 2026-11-08T09:58:00Z
modified: 2026-11-26T16:20:00Z
level: L1
version: 4.4.0
description: 'What a fresh [cu] Developer One session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator decision 2026-11-08 (each seat keeps handover.md, at most 300 words)
  - source: owner's direct order 2026-11-08 14:59 PST (one successor per seat in the new workspace)
  - source: decision D-124 item 6 and cu-coordinator's goal of 26 Nov 16:14Z (this session hands over at 65 percent context)
---

# [cu] Developer One - handover

Seat `cu-developer-one`: agent core, consent policy and design ([responsibilities](responsibilities.md)). I work in a session
worktree, a `--review` worktree on main for probes, and one worktree per build. State at 16:20Z, 26 November. Supersedes 4.3.0 (#1529, never landed).

## Landed since 4.1.0

- #1520 (CU-832) and #1528 (CU-833, with its one fold): both closed live by cu-verifier - Done.

## Open, mine (policy.mjs PRs land one at a time, P1 first - D-125 (4))

- **#1533 (CU-815)**: three OKs at f629f4101. Plain re-merge of main (with #1528) prepared; its D-114 and push windows are queued, then the three merge-diff re-checks and the boundary cell (skipped once, owner active - D-125 (1)) before the gate; then cu-verifier's live close.
- **CU-819**: table OK, built, test1 green; D-114 and boundary windows queued; the PR follows #1533.
- **CU-823**: table OK with a bound; build after CU-819. **CU-842** (P1, from #1533's held-out): held-out first, then the table.
- Then CU-835 (P2) and CU-841 (P2 over-ask).

## Reviews

- #1521 (CU-709): OK at 7f23b8d32. #1524 (CU-830): OK at 492867413 (plain re-merge).

## How I work a P1

1. Held-out, cu-verifier's repro on main, then the table; build only on cu-researcher's table OK.
2. test1: every new row beside its twin on main; the probe-kit reclass diff main -> build.
3. D-114, boundary cell, gate, push - each job only in its named window, through a launcher that sends DONE 45 s before the end.

## Lessons

- Run session-inbox only with a roster that names your session.
- A host restart disarms goals: re-queue any missed window at once.
- Re-read every comment and the head in the same command right before an OK.
