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

**Why now.** The holder reached 75 percent context and hands over (D-124 item 6).

**State.** Helper 0.2.75 installed (signed, true READBACK 26 Nov 08:02Z). Closed live today: CU-752, CU-831 (#1516).
Open P1: CU-832 (#1520, three OKs; main merge, D-114 re-run, merge-diff re-checks, gate - one policy.mjs PR at a time);
CU-763 (#1522, helper 0.2.76) - cu-verifier NOT OK at 2ad119966, one fold owed; the researcher's pre-merge OK is a
build-class harness on its held-out; merge and signed install only in the 08:00-08:25Z daily window, then the CU-763 /
CU-787 close and the live measurement. Next: CU-833 (P1, repro done), CU-835 / CU-830 / CU-837 (P2), #1521 (CU-709,
behind the policy pair), CU-723, CU-836.

**Rulings.** D-123 and D-124: fixture-only runners; READBACK shows version and sha256; node-class runs may use Last
War's 09:20-10:50Z slot; table OKs are the researcher's. Nobody clicks a macOS consent dialog.

**Team.** Five seats were replaced today at 66-76 percent context - insist on small outputs and context percent
hourly. Inbox backlogs recur at cu-verifier and cu-developer-two.

**CU-834.** Roster is team-record 2.12 with coordination.watchdog; the cu-watchdog dry run starts after the private
checkout syncs; --apply by a later PR (default 2 Dec).

**Owner items (with defaults).** Stray windows; Screen Recording for CUHelper; step 4 (CU-11, CU-119, CU-135); budget
for CU-66; goal cap; Watchdog --apply. Dates: daily reflection 23:00Z, weekly Sunday 29 Nov.
