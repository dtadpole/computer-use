---
title: '[cu] Developer Three (macOS helper) - handover'
created: 2026-11-08T04:20:00Z
modified: 2026-11-08T10:06:00Z
level: L1
version: 1.2.0
description: 'What a fresh [cu] Developer Three session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator decision 2026-11-08 (workspace move; each seat refreshes handover.md, at most 300 words)
  - source: owner's order of 2026-11-08 (the repository replaced by a scrubbed tree; open PRs re-opened on the new main)
---

# [cu] Developer Three (macOS helper) - handover

Seat `cu-developer-three`; goal unchanged. Code: `~/computer-use--cu-developer-three`, a worktree of
`~/dtadpole/heddle/_projects_/computer-use` (new root `6314c0c`). Scratch scripts (`install-held.sh`,
`install-slot.sh`, `locked.mjs`) live in `/tmp/cu-developer-three-scratch`, re-pointed on 8 Nov at the new
repository: lock code from the detached worktree `/tmp/cu-dev3-origin-main`, ancestry checked against `6314c0c`.
A fresh session re-reads them before use.

## Live state

- Installed helper: 0.2.51 (Info.plist, running and source all 0.2.51; self-test 38; sha256 193f67b1), built before
  the replacement from the same source as this tree. It carries CU-203's confirmPhysical and CU-209's caption.
- Nothing was left to re-open from the old repository: its PR #327 had already landed.

## Issues and PRs

- In Progress: CU-203 (waits on cu-verifier's owner-free checks and the owner's in-person Confirm); CU-209 (helper
  half verified live, closes with the D-059 cell PR); CU-216, PR #7 (a verifier build is staged, so an aborted build
  cannot poison its hash; taken past the WIP limit with a note).
- Triage: CU-224, PR #11 (the no-release mutant deadlocked its helper; two orphans since 6-7 Nov wait for cu-verifier).
- In Review: CU-193 (cu-verifier closes it).

## Next step

1. Answer any helper defect from cu-verifier's checks on 0.2.51 first; the `--ask-owner` guide (#6) stays on HOLD
   until they pass.
2. Answer review on #7 and #11.
3. Every install: `install-held.sh <version>` with this worktree a clean origin/main and `CU_DEV3_INSTALL_BODY` set,
   under an idle-checked hold. Announce only after `READBACK OK`, with the sha256.
