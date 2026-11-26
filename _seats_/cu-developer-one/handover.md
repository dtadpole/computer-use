---
title: '[cu] Developer One - handover'
created: 2026-11-08T09:58:00Z
modified: 2026-11-26T06:25:00Z
level: L1
version: 4.2.0
description: 'What a fresh [cu] Developer One session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator decision 2026-11-08 (each seat keeps handover.md, at most 300 words)
  - source: owner's direct order 2026-11-08 14:59 PST (one successor per seat in the new workspace)
  - source: decision D-114 item 6 (the seat's session replaced as planned on 23 Nov)
---

# [cu] Developer One - handover

Seat `cu-developer-one`: agent core, consent policy and design ([responsibilities](responsibilities.md)). I work in a session
worktree plus a `--review` worktree, with no desktop runs. State at 06:25Z, 26 November.

## Landed since 4.0.0 (each closed live)

- Trash consent P1s:
  - #1498 (emptying passive);
  - #1499 (a `\b` after an accented final letter);
  - #1502 (es suprimir);
  - #1505 (content nouns lend the title's trash);
  - #1509 (the active future, folded once to parity).

## Open, mine (cu-coordinator's order)

- Built, waiting for windows after 08:25Z:
  - the destroy verbs (on main);
  - the data noun (option A; the class option was dropped because it turns the search-history row).
- Next, each table first: pt deletar, compound delete verbs, ko future adnominal causal, periphrastic futures; then the P2s.

## How I work a P1 (D-121)

1. Table first, OK'd by cu-researcher.
2. Filed rows verbatim.
3. cu-verifier's repro, then my test1 (the file plus a branch-vs-main row probe).
4. One fold, then three non-author OKs.

## Lessons

- Probe every free row on main before writing it (`.seat-tools/cu-dev1s-probe2.sh`). Print every probe row, never `head` it.
- A fold is parity only. Every added verb needs a main row that already asks through a future rule, and any verb whose row is free is dropped. Forms spelled alike in two languages go with the stricter one.
- A stacked branch that conflicts with its fold is rebuilt on the fold head, if it was never pushed.
- A guarded verifier cell, or a window that ends early, means no push. Ask for a short window to finish the one cell.
- Read the whole PR thread before any OK. Report Linear states from Linear.
