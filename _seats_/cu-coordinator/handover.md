---
title: '[cu] Coordinator - handover'
created: 2026-11-08T04:15:00Z
modified: 2026-11-26T11:55:00Z
level: L2
version: 4.6.0
status: unverified
description: 'What the next [cu] Coordinator session needs to take the seat mid-flight - state at 26 Nov 11:55Z.'
grounded_in:
  - source: owner's re-creation order of 2026-11-22 19:05 PST (the previous holder was archived past the model window)
  - source: decision log D-108, D-110 to D-124
---

# [cu] Coordinator - handover

**Why now.** The holder reached 75 percent context; it hands over under its own rule (D-124 item 6).

**State.** Helper 0.2.75 is installed (signed identity, true READBACK 26 Nov 08:02Z). Closed live today: CU-752,
CU-831 (#1516, merged 35aadfbea). Open P1: CU-832 (#1520, three OKs; merges main, re-runs D-114, merge-diff
re-checks, then its gate - one policy.mjs PR at a time, D-108); CU-763 (#1522, helper 0.2.76) - cu-verifier NOT OK
at 2ad119966 (window title must survive a heading that names no right; a list in an AXGroup sibling), one fold owed;
the researcher's pre-merge OK is a build-class harness on its held-out; merge and signed install only in the daily
08:00-08:25Z window, then the CU-763 / CU-787 close and the researcher's live measurement. Then CU-833 (P1), CU-835 /
CU-830 / CU-837 (P2), #1521 (CU-709, P3, behind the policy pair), CU-723, CU-836.

**Rulings to know.** D-123 (allowlist narrowing, repro before test1, exact DONE labels, P1 first) and D-124
(fixture-only runners, READBACK shows version and sha256, work classes: node-class runs may use Last War's 09:20-10:50Z
slot, a desktop cell blocked by that slot may be skipped and re-run before the gate, seat replacement order, table OKs
are the researcher's). Never click a macOS consent dialog; it waits for the owner. The 26 Nov 10:29Z consent dialog
came from launchd starting the helper on demand (CU-837), not from a seat.

**Team health.** Seven seats, five replaced today at 66-76 percent context; new sessions burn context fast - insist on
small outputs and context percent in hourly lines. Inbox backlogs recur at cu-verifier and cu-developer-two. Records PRs:
#1514, #1517, #1518 (D-124), #1519 await lanes.

**CU-834.** Roster is team-record 2.12 (3.8.x) with coordination.watchdog; the cu-watchdog unit runs a dry run every
30 min once the private checkout syncs (every 4 h); going live (--apply) is a later one-line PR after the dry runs
agree with the Coordinator's reading (default: by 2 Dec).

**Owner items (each with a default).** Close the stray System Settings / notification windows; allow CUHelper Screen
Recording; step 4 session (CU-11, CU-119, CU-135); budget raise for CU-66 (about 0.31 USD left of 21); goal cap
(renew at 80 percent); Watchdog --apply. Dates: daily reflection 23:00Z, weekly Sunday 29 Nov 23:00Z, Monday cycle.
