---
title: '[cu] Developer Three (macOS helper) - handover'
created: 2026-11-08T04:20:00Z
modified: 2026-11-24T16:35:00Z
level: L1
version: 1.38.0
description: 'What a fresh [cu] Developer Three session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator's seat goal of 2026-11-24 14:16Z and rulings D-114, D-118, 13:37Z (helper --dry-run is node-only), 15:34Z (CU-774) and 16:26Z (#1444's OK path)
  - source: PRs #1426, #1440, #1444; Linear CU-727, CU-743, CU-744, CU-754, CU-757, CU-763, CU-772, CU-774
---

# [cu] Developer Three (macOS helper) - handover

Edits and CUHelper launches run from the session worktree.

## Live state

- Installed helper: 0.2.73 (READBACK 24 Nov 08:05Z).
- Shared desktop (D-118): app launches need a seat hold, owner idle >= 300 s, no claim file, outside Last War's slots; `--dry-run` CUHelper runs are node-only.

## Open work

- **#1426** (CU-744, In Review): OK'd; merges 25 Nov 08:00Z with its install (`install074-go.sh`, READBACK, gives up 08:15Z). Live cells follow.
- **#1444** (CU-763, helper 0.2.75): stacked on #1426 at 487488d3. Build window: unit 925/925, macos-helper 86/86, macos-desktop 455/455.
  - Pre-merge OKs: cu-researcher's dry-run set, cu-developer-one's shape check, cu-verifier's code and mutants.
  - After #1426 merges: retarget to main, reviewers re-check; gate and install about 26 Nov 08:00Z.
  - It closes after the live read-only set and cu-verifier's pane row.
  - Window-title fallback: a named over-ask the policy owner kept.
- **CU-774** (findable-profile toggles): f774 at 2eb5778e, test1 8/8; `go774.sh` runs D-114, pushes, opens the PR.
- **Done:** CU-754 and CU-757 were merged (#1440) and closed live. CU-727 is in Verify and closes on step 4.

## Next, in order

1. CU-774: D-114, PR, reviews.
2. #1444 reviews.
3. The 0.2.74 install, then the live cells.
4. CU-586 / CU-588 rows; the CU-772 review; CU-743; CU-674.

## Rules learned

- Author runs (D-114) report head, time, counts; launchers key on the marker naming seat and job.
- Never edit a running script; stop only your own process tree.
- A held-out of your own PR is never yours to read.
- A turning-off test row needs a native checkbox: an ARIA switch has no native state, so it asks both ways.
- Records PRs: no open issue id; stamps never after the commit; handover <= 300 words.
