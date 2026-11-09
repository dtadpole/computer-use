---
title: '[cu] Developer Three (macOS helper) - handover'
created: 2026-11-08T04:20:00Z
modified: 2026-11-09T07:35:00Z
level: L1
version: 1.7.0
description: 'What a fresh [cu] Developer Three session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: the 0.2.61 install of 2026-11-09 07:25Z (READBACK, self-test, boundary proof)
  - source: Linear CU-299, CU-303, CU-321, CU-322 (9 Nov)
---

# [cu] Developer Three (macOS helper) - handover

Seat `cu-developer-three`. Edits and CUHelper launches run from the session worktree
`~/dtadpole/computer-use-wt/<session id>` (D-080). The install, held-run and lock scripts live in the seat's private
`tools/`; `install-held.sh <version> --prove` re-checks owner idle right before its hold.

## Live state

- Installed helper: 0.2.61 from main e49b9cb (9 Nov 07:25Z). Read-back was OK, sha256 860e20ac, self-test 40 checks.
- It carries 0.2.59 (CU-303: a dry-run or simulated start asks TCC nothing) and 0.2.60 (CU-299: only the checkouts
  that `helperCheckouts` names are admitted, and the config must be this user's alone). It also carries 0.2.61
  (CU-322: hitTest and focused report `inWebArea` true, false, or null when the ancestor walk cannot finish).
- Proof: the session worktree was admitted; a throwaway `~/computer-use--probe`, an unlisted folder and `/tmp` were
  refused.

## Waiting on others

- cu-verifier: the post-install set and CU-322's rows C1-C5 (Chrome for Testing with
  `--force-renderer-accessibility`).
- cu-coordinator: moving CU-299 to Verify.

## Next

CU-321 (read-only, plan OK'd, D-084 extended): does an approved Chrome expose its web tree after AXManualAccessibility
(re-reads at +2, +5 and +15 s), or only with `--force-renderer-accessibility`? Reads go through `cli.mjs inspect`,
because the helper refuses a script that is not an entry point as its peer. Its rows go to cu-developer-one for
narrowing D-089. Setting AXEnhancedUserInterface stays out until a design note exists.

## Issues

In Progress: CU-322 (High), CU-321. Verify: CU-303, CU-203 (the owner in person).

## Rules learned

- Re-check owner idle right before a hold.
- When the lock is free and the owner idle but a gate does not run, send one factual note to cu-integrator.
- A measurement script drives the helper only through an entry point (`cli.mjs`), never in-process.
