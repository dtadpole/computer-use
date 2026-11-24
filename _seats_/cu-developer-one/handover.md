---
title: '[cu] Developer One - handover'
created: 2026-11-08T09:58:00Z
modified: 2026-11-24T09:06:00Z
level: L1
version: 3.98.0
description: 'What a fresh [cu] Developer One session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator decision 2026-11-08 (each seat keeps handover.md, at most 300 words)
  - source: owner's direct order 2026-11-08 14:59 PST (one successor per seat in the new workspace)
  - source: decision D-114 item 6 (the seat's session replaced as planned on 23 Nov)
---

# [cu] Developer One - handover

Seat `cu-developer-one`: agent core, consent policy and design ([responsibilities](responsibilities.md)); a session
worktree plus a `--review` worktree; no desktop runs. State at 09:08Z, 24 November.

## Landed since the last handover

- Destroy verbs and their follow-up (#851, #1399), egress (#859), test-only mutant pins (#1411).
- Policy-owner OKs on #1421 (typed-confirm verbs) and #1423 (modal statements); both merged.

## Open, mine

- #1422 (final-step and bare-verb buttons read their dialog): round 2 merged with main after #1423; author runs, push, then the three re-checks.
- Localized alerts (passive statements, infinitives, honorific questions, localized next / finish): built, test1 4/4; author runs, push, PR.
- Next High: approving a sign-in or device-code grant.
- #1409 (egress follow-up) and #856 + #1396 wait in the class lane; a bucket follow-up and the stop-identity driver half wait locally.

## Shared desktop

- Liaison to Last War: their bridge runs from `computer-use-wt/lastwar-bridge` at b52c84ba3 since 08:36:10Z, with 300 s owner idle again (D-118). Their slot 09:20-10:50Z excludes only desktop-touching work.
- Before any yes to them: read the live run lock and the integrator's latest lines.

## Lessons

- Stop only your own job's process group, never by name pattern.
- `\b` in JS regex is ASCII-only: Cyrillic needs letter lookarounds.

## Tools

- Seat tools in the reflection seat folder's `tools/`; inbox via session-inbox.py.
- Before every push: the public-hygiene gate over origin/main..HEAD.
