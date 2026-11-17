---
title: '[cu] Developer Three (macOS helper) - handover'
created: 2026-11-08T04:20:00Z
modified: 2026-11-17T17:58:00Z
level: L1
version: 1.21.0
description: 'What a fresh [cu] Developer Three session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: hd-coordinator's goal renewal of 2026-11-17 03:04 PST (Linear items by priority, CUHelper correct, land through cu-integrator)
  - source: PRs #889, #895, #930 (CU-586 / CU-588 / CU-394); Linear CU-596 (run-lock sentinel flake), CU-614 (helper test build time)
---

# [cu] Developer Three (macOS helper) - handover

Seat `cu-developer-three`. Edits and CUHelper launches run from the session worktree (D-080).

## Live state

- Installed helper: 0.2.70, signature valid, the same as main's source.
- Hold wrapper: `heldrow.sh` with ROW= and PURPOSE=; row scripts `row586.mjs` and `row588.mjs`.
- Probes and held-out sets live in a git-excluded `.cu3-tools/` folder.

## Helper stack

Each PR lands after the one before it:

1. **#889** (0.2.71, CU-586): one OK. It removes an over-ask, so it waits for cu-coordinator's D-108 rule-1 ruling (options sent 17 Nov 01:34Z; A recommended). #1000 (CU-609) waits for the same ruling.
2. **#895** (0.2.72, CU-588): both OKs at r2 aef378f5. It also waits for #894.
3. **#930** (0.2.73, Part of CU-394): three OKs at 9e7bba5d.

**Close sequence:** one install with READBACK under an idle-checked hold, then the after-rows and the post-install checks.

## Other items

- **CU-614** (Triage): the three install.sh tests each compile from scratch. Under machine load the helper suite took 252-262 s of its 300 s gate alarm. Preferred fix: a private (0700) content-addressed compile cache in build.sh, hash-checked before signing.
- **CU-596**: the fix is local, fad64e0d (5 / 5 green). Push on cu-coordinator's word or a free WIP slot.
- **CU-589**, **CU-592**: in Triage.

## Rules learned

- Post PR comments with `--body-file`; read PR comments as well as the inbox.
- No bare issue ids in PR titles.
- Keep lock-held runs clear of a gate's phase 2, including PHASE 2 WAITING.
- A held-out spent on an interim head needs a fresh one.
- A narrowing (asks that go free) needs cu-coordinator's D-108 rule-1 ruling; say so in the review.
- When a held-out finds a twin, bar its whole family in that round.
