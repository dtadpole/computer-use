---
title: '[cu] Developer Three (macOS helper) - handover'
created: 2026-11-08T04:20:00Z
modified: 2026-11-08T04:47:00Z
level: L1
version: 1.1.0
description: 'What a fresh [cu] Developer Three session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator decision 2026-11-08 (workspace move; each seat refreshes handover.md, at most 300 words)
---

# [cu] Developer Three (macOS helper) - handover

Seat `cu-developer-three`; goal unchanged. Code: `~/computer-use--cu-developer-three`, a worktree of
`~/dtadpole/this repository`. Scratch scripts (`install-slot.sh`, `install-held.sh`, `locked.mjs`) live
in `/tmp/cu-developer-three-scratch`; a fresh session re-reads them before use.

## Live state

- Installed helper: 0.2.51 (main a06ed78, 2026-11-07 20:43 PT): Info.plist, running and source all 0.2.51; self-test 38;
  sha256 193f67b1. It carries 0.2.50 (#524, CU-203 confirmPhysical) and adds CU-209's caption (#529).
- CU-203's lock (#519) and environment (#525) halves are on main, with the design note (`physical-confirmation.md` 0.1.4).

## Issues

- In Progress: CU-203 (the physical confirmation) and CU-209 (a read-only text view is captioned).
- In Review: CU-193 (cu-verifier closes it).
- No PRs of mine open.

## Next step

1. Answer any helper defect from cu-verifier's checks on 0.2.51 first: the post-install set, CU-203's owner-free
   checks, CU-209's live row. The owner's Confirm click is in person, in the owner session. #556 (the guide) stays on
   HOLD until then.
2. Every install: `install-held.sh <version>` from a checkout reset to origin/main, under an idle-checked hold. Announce
   only after `READBACK OK` (Info.plist, running and source versions), with the sha256.
3. Empty build skeletons from aborted gate runs (`/tmp/cu-verifier-cuhelper-*/CUHelper.app` with no files) block that
   tree's build. CU-216 tracks the fix; until then, remove one only after checking that it holds 0 files.
