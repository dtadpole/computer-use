---
title: '[cu] Verifier - Handover'
created: 2026-11-08T04:15:13Z
modified: 2026-11-08T04:15:13Z
level: L2
version: 1.0.0
description: 'What a fresh session of [cu] Verifier needs - live state, open PRs and asks, the scripts, and the next step.'
status: unverified
grounded_in:
  - source: the seat's own state, 2026-11-08 0415Z (cu-coordinator's move notice, inbox 20261108T041401)
---

# [cu] Verifier - Handover

Start here, then [responsibilities](responsibilities.md) and the [verdict](ultimate-goal-2-verdict.md).

```text
WHERE: code worktree ~/computer-use--cu-verifier (main checkout ~/dtadpole/this repository); records
~/reflection--cu-verifier; helper scripts in /tmp/cu-verifier-*.sh and /tmp/cu-verifier-proofs/ (lost on reboot).

LIVE: helper 0.2.49 installed, post-install complete (Q-D15 5/5, step 4 20261108T021005Z-2cc922). The Confirm prompt
(0.2.50) and --ask-owner are on main, not installed. Tables re-signed on main 309c60328: D-059 one open cell (CU-209),
D-061 none. Verdict 0.9.50: seven of nine hold; consent waits on CU-209, then CU-135's chain; human control on step 4.

PRS: #554 (mine, owner-step4 CU_ASK_OWNER=1, both OKs) to land. #470 then #555 (CU-218, CU-220) OK'd.
#529 (0.2.51, CU-209) OK at 792cb63d6. #556 guide OK, held until the 0.2.51 post-install passes.

NEXT: 1) #555 on main: run post-555.sh (consent-keys P0/P2/P3, CU Ledger L2) and paste-desktop-Notes; close CU-218,
CU-220 (L2 asking = CU-219's named over-ask). 2) 0.2.51 installed: post-install.sh EXPECT=0.2.51, Q-D15, step 4,
cu209-live.mjs, a Return on badge-form changes nothing; close CU-209; re-sign D-059; release #556.
3) Owner session: CU_ASK_OWNER=1 at the Mac (Return only with CU Fixture in front, his deliberate click after
a second confirms, Cancel or timeout = 5-minute backoff); unset over Screen Sharing. Then CU-11, CU-119, #313,
CU-203's in-person rows, CU-16, the verdict.

ASKS: owner time and mode via cu-coordinator. Every desktop run under an idle-checked hold; no input outside
CUHelper (D-056).
```
