---
title: '[cu] Coordinator - handover'
created: 2026-11-08T04:15:00Z
modified: 2026-11-08T10:20:00Z
level: L2
version: 2.1.0
status: unverified
description: 'What a fresh [cu] Coordinator session needs to take over the seat mid-flight, after the 8 Nov repository replacement.'
grounded_in:
  - source: owner's order of 2026-11-08 via hd-coordinator (scrub and replace dtadpole/computer-use; re-home the seats into workspace b40a6ee8)
---

# [cu] Coordinator - handover

**Repository (8 Nov).** This public repository replaced the old one: one root commit `6314c0c`, code and records
together, history private in dtadpole/computer-use-history (old checkout `~/dtadpole/computer-use-history`, its
pre-push hook refuses this repository). Main checkout `~/dtadpole/heddle/_projects_/computer-use` (DSH workspace
"dtadpole/heddle · computer-use"); seat worktrees `~/computer-use--<seat>`, the paths the installed helper admits.
The live roster `TEAM.yaml` (session ids), the member-review log and the re-home record stay private in the
reflection checkout `~/dtadpole/reflection/_projects_/computer-use/`, edited from a reflection worktree by PR.
The seats were re-homed into that workspace on 8 Nov; each old session is archived once its successor finishes a
goal round (the private re-home record lists each), then the old sessions' working-directory symlink goes.

**Public hygiene.** Every push passes `node ~/dtadpole/heddle/_tools_/public-hygiene/gate.mjs --range
origin/main..HEAD`; cu-integrator lands code and records PRs, the coordinator's included, on one non-author OK at the
head (the coordinator reviews records PRs). Linear's GitHub app does not see this repository yet (owner item): link
PRs with `linear.py pr` and move states by hand on merge. Pre-8-Nov PR numbers are history PRs (AGENTS.md).
Before a release-like change, hd's `verify-publication.py` (seven checks) is the reference.

**Goal.** ULTIMATE_GOAL 2.0; complete only when cu-verifier judges every row passing. Verdict 0.9.34: seven of nine
rows hold live. Consent and safety waits on open High/Urgent under-asks (CU-145 / CU-171, D-063); human control
waits on the owner session (step 4 CU-11, G2 CU-119, CU-135's real-panel chain) - in person with confirmPhysical
(~15 min, helper 0.2.51 installed) or over Screen Sharing with 5-minute hands-off starts (~25 min).

**Every 15 minutes.** Inbox (`python3 ~/dtadpole/reflection/_tools_/session-inbox/session-inbox.py check|read
--roster ~/dtadpole/reflection/_projects_/computer-use/TEAM.yaml --me cu-coordinator`), supervise and revive with
`~/dtadpole/reflection/_tools_/session-relay/session-relay.py`, renew goals near 230 rounds, Linear triage, one
member review, decisions into `_context_/team-operations/decision-log.yaml` (last D-069), a Chinese summary to the owner.

**Rules that bite.** No seat calls ask_user_question - it blocks the turn (D-031); synthetic input only through
CUHelper (D-056); the owner-idle rule follows input (D-066, D-068); only cu-verifier sets Done; never read ~/.dsh, ~/Library or home folders.

**Owner items.** A time and mode for the owner session; dismiss two notification alerts; quit Typeless; the
Mac-wide paste setting (D-052); connect the new repository to Linear's GitHub app; initiative scope.
