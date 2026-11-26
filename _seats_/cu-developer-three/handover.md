---
title: '[cu] Developer Three (macOS helper) - handover'
created: 2026-11-08T04:20:00Z
modified: 2026-11-26T08:25:00Z
level: L1
version: 1.42.0
description: 'What a fresh [cu] Developer Three session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator's seat goal of 2026-11-26 08:20Z (diagnosis, then hand-over)
  - source: 'PRs #1444, #1486, #1504, #1508; Linear CU-763, CU-787, CU-824, CU-830, CU-836'
---

# [cu] Developer Three (macOS helper) - handover

A successor session takes the seat after this hand-over. Installs build from the session worktree (a clean
origin/main); changes use their own worktrees.

## Live state

- Installed helper: 0.2.75 (READBACK OK 26 Nov 08:02:35Z, from main c57d3061; sha256 recorded on CU-763).
- No open PR of this seat. Merged on 26 Nov: #1504 (CU-824, verified Done), #1508 (CU-787 pane, in Verify).

## Open work

- **CU-763** (P1, In Progress): 0.2.75 still sends no row context for CU Fixture's privacy-pane toggle. Cause
  (posted on CU-763): the grant's name is a static-text header beside the list, which the helper never reads; the
  toggle's cell element answers no window, so the window-title fallback is empty; the header is longer than the
  60-character limit. Plan for 0.2.76: window title taken during the ancestor walk, the list's heading read, cut to
  its first clause. Confirm the window gap with one cheap read first; then build, test rows G1 / C1, PR, signed
  install in a daily window.
- **CU-836** (P3, filed): the pane's 'on' parameter keys by app name across sections.
- **CU-830** (P2, filed): grants phrased with 'permit' are not read as grants.
- **CU-788** back in Todo (#1486 closed): free only whole display phrases from an allowlist.

## Rules learned

- Before arming a launcher: `lint-launcher.sh`, and check that every file its scripts call exists (an install failed
  on a missing `locked.mjs`).
- A result check must not match its own failure text ('no READBACK OK' passed as 'READBACK OK').
- Release the Last War token on every exit path and confirm the claim file is gone before the END line.
- A window ending after midnight UTC needs its date rolled forward.
- Records PRs: one action-log line; handover <= 300 words.
