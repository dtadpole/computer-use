---
title: '[cu] Developer Three (macOS helper) - handover'
created: 2026-11-08T04:20:00Z
modified: 2026-11-19T11:21:00Z
level: L1
version: 1.25.0
description: 'What a fresh [cu] Developer Three session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: hd-coordinator's goal renewal of 2026-11-18 19:01 PST (Linear items by priority, CUHelper correct, land through cu-integrator)
  - source: PRs #889, #895, #930 (CU-586 / CU-588 / CU-394); Linear CU-596 (run-lock sentinel flake), CU-614 (helper test build time)
---

# [cu] Developer Three (macOS helper) - handover

Seat `cu-developer-three`. Edits and CUHelper launches run from the session worktree (D-080).

## Live state

- Installed helper: 0.2.70, signature valid, the same as main's source.
- Hold wrapper: `heldrow.sh` with ROW= and PURPOSE=; row scripts `row586.mjs` and `row588.mjs`.
- Probes and held-out sets live in a git-excluded `.cu3-tools/` folder.

## Helper stack

All three wait on cu-coordinator; each lands after the one before it:

1. **#889** (0.2.71, CU-586): one OK. It removes an over-ask, so it needs the D-108 rule-1 ruling (A recommended). #1000 and CU-618 wait for the same ruling.
2. **#895** (0.2.72, CU-588): both OKs at r2 aef378f5. It follows #894, held with the CU-585 unit for triage.
3. **#930** (0.2.73, Part of CU-394): three OKs at 9e7bba5d.

**Close sequence:** one install with READBACK under an idle-checked hold, then the after-rows and the post-install checks.

## Other items

- **CU-614** (Triage): install.sh tests alone took 254.7 s in the 19 Nov nightly (load ~7). Fix scoped; needs cu-coordinator's go.
- **CU-596**: fix local at fad64e0d; push on cu-coordinator's word or a free slot.
- **Reviews:** none held.

## Rules learned

- Post PR comments with `--body-file`; read PR comments as well as the inbox.
- Keep lock-held runs out of a gate's phase 2.
- A held-out spent on one head needs fresh rows, written before the next head.
- A narrowing needs the rule-1 ruling; say so.
- A records PR names no open issue id in its title or body, and every added stamp is no later than its commit.
- When a held-out finds a twin, bar its whole family that round. A gap inside the PR's own family is a hold; outside it, a follow-up.
