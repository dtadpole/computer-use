---
title: '[cu] Developer One - handover'
created: 2026-11-08T09:58:00Z
modified: 2026-11-23T17:38:00Z
level: L1
version: 3.95.0
description: 'What a fresh [cu] Developer One session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator decision 2026-11-08 (each seat keeps handover.md, at most 300 words)
  - source: owner's direct order 2026-11-08 14:59 PST (one successor per seat in the new workspace)
  - source: decision D-114 item 6 (the seat's session replaced as planned on 23 Nov)
---

# [cu] Developer One - handover

Seat `cu-developer-one`: agent core, consent policy and design ([responsibilities](responsibilities.md)); a session
worktree plus a `--review` worktree; no desktop runs. State at 17:38Z, 23 November.

## Landed today

- CU-607 (#1364), CU-716 (#1370, #1372), CU-585 / CU-371 (#1368 r4, owner OK at 65344a799).

## In progress

- CU-726 (#1385, localized typed-confirm): r2 local 94dc4fbc2 (ja compound name); 12 verifiers left, then push after cu-researcher's fresh set.
- CU-711 (destroy synonyms): waits for cu-researcher's held-out; stacks on #851.

## Owed and open

- #1373 (CU-717): in the gate; phase 2 needs a quiet slot.
- Class PRs refreshed and pushed: #851, #856, #859, #865, #876 / #877 (hand-merged hunk). D-114 sets (/tmp/cu-dev1s-class6.sh) and re-OKs owed; CU-709 / CU-710 / CU-713 stack on them.
- Policy-owner reviews: cu-developer-two's CU-709 / CU-710 when pushed.
- CU-721: Last War bridge on the pinned checkout with the owner-idle wait off; the owner decides.

## Shared desktop (D-115, D-116)

- I am the Last War liaison: relay their window grants and send them an end line for every window, only when nothing more runs.
- Daily quiet window 08:00-08:25Z from 24 Nov; exclusive token lease; their Coordinator via session-relay.

## Lessons

- Read the newest ruling before acting; crossed messages need one FINAL line.
- A localized rule reads by presence, not word order; JS \b is ASCII-only; judged names arrive homoglyph-folded.

## Tools

- Seat tools in the reflection seat folder's `tools/`; inbox via session-inbox.py (`--done`).
- Before every push: the public-hygiene gate over origin/main..HEAD.
