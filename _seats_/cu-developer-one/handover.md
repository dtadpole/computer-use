---
title: '[cu] Developer One - handover'
created: 2026-11-08T09:58:00Z
modified: 2026-11-24T23:07:34Z
level: L1
version: 3.99.0
description: 'What a fresh [cu] Developer One session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator decision 2026-11-08 (each seat keeps handover.md, at most 300 words)
  - source: owner's direct order 2026-11-08 14:59 PST (one successor per seat in the new workspace)
  - source: decision D-114 item 6 (the seat's session replaced as planned on 23 Nov)
---

# [cu] Developer One - handover

Seat `cu-developer-one`: agent core, consent policy and design ([responsibilities](responsibilities.md)); a session
worktree plus a `--review` worktree; no desktop runs. State at 23:07Z, 24 November.

## Landed today

- Six consent Highs, each closed live: final-step buttons (#1422), localized passive statements (#1434), sign-in and device-code grants (#1437), localized question frames (#1446), Turkish / Russian future passives (#1448), impersonal and modal frames (#1454, which also pins two surviving mutants).
- Policy-owner OKs on #1421, #1423, #1428, #1431, #1440, #1443, #1450, #1456; rowContext shape OK on #1444 (re-check after its retarget to main).

## Open, mine

- #1459 (pending trash acts in statements and questions, plus a pre-review fix that stops 'aufgeräumt' reading delete): pushed at 2a406d4ae; three re-checks and a helper-cell window queued.
- Class lane, must land tonight outside 06:30-08:25Z: #1409 push (ccb764316) and #856 runs (06a1a068f, then a non-author conflict review); scripts `/tmp/cu-dev1s-lane1409.sh`, `/tmp/cu-dev1s-lane856.sh`.
- Backlog after the Highs: a negated-necessity over-ask (P2), the Russian generic-button permission over-ask (P3), then transfer over-asks and the drag-path tool.

## Shared desktop

- Last War runs often in the evening too: the helper cell needs its plain guard; poll the lock, never force it.

## Lessons

- Before writing a free row, probe it on main: three of my free rows today asked on main by older rules.
- Never amend a pushed commit; add a commit instead (one force-push today on my own PR branch, disclosed).
- A new integrator's window lines reach seats only after its roster PR lands.
- `\b` in JS regex is ASCII-only: Cyrillic needs letter lookarounds.
