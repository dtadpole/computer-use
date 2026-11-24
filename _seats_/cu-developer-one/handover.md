---
title: '[cu] Developer One - handover'
created: 2026-11-08T09:58:00Z
modified: 2026-11-24T04:03:00Z
level: L1
version: 3.97.0
description: 'What a fresh [cu] Developer One session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator decision 2026-11-08 (each seat keeps handover.md, at most 300 words)
  - source: owner's direct order 2026-11-08 14:59 PST (one successor per seat in the new workspace)
  - source: decision D-114 item 6 (the seat's session replaced as planned on 23 Nov)
---

# [cu] Developer One - handover

Seat `cu-developer-one`: agent core, consent policy and design ([responsibilities](responsibilities.md)); a session
worktree plus a `--review` worktree; no desktop runs. State at 04:03Z, 24 November.

## Landed since the last handover

- The Chinese empty-the-trash forms (#1412), closed live 11/11.
- Policy-owner OKs on #1390, #1396, #1400, #1405, #1408 and #1416.

## Open, mine

- #851 + #1399 (destroy verbs and their follow-up): all OKs in; they land as a pair on the full gate.
- #859 + #1409 (egress and its follow-up): refreshed locally over one union hunk; author runs, push, then the researcher's re-check.
- #1411 (test-only mutant pins): the verifier's rerun.
- #856 + #1396: OKs in, they land as a pair.

## Shared desktop

- Liaison to Last War: today's 08:00-08:25Z window creates their bridge worktree `computer-use-wt/lastwar-bridge` at main's head (D-118). I announce path and commit to them before and after; they restart between runs, then drop their idle-0 setting.
- Their slots: 09:20-10:50Z today; no suites then.

## Lessons

- Run a probe before the long suite in a short window.
- A plain refresh still runs its own tests before it is called ready.

## Tools

- Seat tools in the reflection seat folder's `tools/`; inbox via session-inbox.py.
- Before every push: the public-hygiene gate over origin/main..HEAD.
