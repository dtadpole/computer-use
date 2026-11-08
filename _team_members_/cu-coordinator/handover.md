---
title: '[cu] Coordinator - handover'
created: 2026-11-08T04:15:00Z
modified: 2026-11-08T12:52:00Z
level: L2
version: 2.2.0
status: unverified
description: 'What a fresh [cu] Coordinator session needs to take over the seat mid-flight, after the 8 Nov repository replacement.'
grounded_in:
  - source: owner's order of 2026-11-08 via hd-coordinator (scrub and replace dtadpole/computer-use; re-home the seats into workspace b40a6ee8)
---

# [cu] Coordinator - handover

**Repository.** This public repository (root `6314c0c`, 8 Nov) holds code and records; history is private in
dtadpole/computer-use-history. Main checkout `~/dtadpole/heddle/_projects_/computer-use` (DSH workspace
"dtadpole/heddle · computer-use"), seat worktrees `~/computer-use--<seat>`. The roster `TEAM.yaml`, the member-review
log and the re-home record (closed 8 Nov: all old sessions archived) stay private in the reflection checkout, edited
from a reflection worktree by PR. Every push passes the public-hygiene gate; cu-integrator lands every PR on one
non-author OK at the head. Linear's GitHub app links PRs and moves `Fixes` issues to Verify.

**Goal.** ULTIMATE_GOAL 2.0, complete only when cu-verifier judges every row passing (verdict 0.9.51: seven of nine
rows live). Consent and safety waits on the open Urgent/High children of CU-145 and CU-171 (D-063); D-071 keeps
live model runs in the fixture apps until CU-232 is verified (CU-230 is). Human control waits on the owner session
(step 4 CU-11, G2 CU-119, CU-135's real-panel chain): in person with confirmPhysical (~15 min) or over Screen
Sharing with 5-minute hands-off starts (~25 min).

**Every 15 minutes.** Inbox, health (revive stalled or errored seats, renew goals near 230 rounds), Linear triage
(severity is the coordinator's), one member review, decisions into the decision log (D-070 and D-071 in #28; then
D-072, script-handled web keys a named limit, and D-073, node-only Urgent landings during holds), a Chinese summary.

**Rules that bite.** No seat calls ask_user_question (D-031). Probe through runTask before calling a hole live
(CU-243, CU-244). A measurement plan runs on one non-author OK (D-070). No CUHelper process of any build outside
the desktop-run lock; release a hold when its series ends. Check a live row's chords against macOS system hotkeys
and Services. Synthetic input only through CUHelper (D-056); the idle rule follows input (D-066, D-068).

**Owner items.** A time and mode for the owner session; dismiss two notification alerts; quit Typeless; the
Mac-wide paste setting (D-052); Linear initiative scope.
