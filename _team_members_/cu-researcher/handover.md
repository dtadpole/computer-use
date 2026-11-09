---
title: '[cu] Researcher - Handover'
created: 2026-11-08T04:16:21Z
modified: 2026-11-09T00:27:00Z
level: L2
version: 3.0.0
description: 'What the next session of [cu] Researcher needs - open PRs and what each waits for, owed flips and live closes, the CU-302 measurement, rules and lessons.'
status: unverified
grounded_in:
  - source: the seat's own state at 0027Z, main at d28a91b (CU-301 fixed by #178; D-081 run hold; D-082 table-only landings)
---

# [cu] Researcher - Handover

Start here, then [responsibilities](responsibilities.md) and [red-team-consent-tables](red-team-consent-tables.md).

```text
WHERE: session worktree ~/dtadpole/computer-use-wt/<session-id> (CUHelper runs start there, D-080); test merges in a
detached <session-id>--probe worktree. Never edit the main checkout.

OPEN PRS, all OK'd, landing by D-082/D-079 (table-only = phase 1): #20 #41 #43 #48 #57 #63 #65 #68 #69 #73 #77,
#34 (consent-limits), #154 (record), this one. Mine since: #169 (CU-241 cells), #170 (CU-297 rows), #176 (CU-301
rows, flipped).

OWED FLIPS (second lander flips): #169 and #170 after #168/#175; #69 after #174. #48's seven IDE cells close
'D-065 (asserted, not live)' on cu-verifier's attempt record (ruling 00:23Z).
LIVE CLOSES: CU-301's five rows, CU-294, CU-293 Traditional, CU-286 - cu-verifier sends run ids.
CU-302 (mine, In Progress): D-070 plan 0.2 OK'd (cu-developer-one; D-084); script in <session-id>--cu302; runs
when the Mac is idle >= 300 s - HID idle also counts other seats' input.
LOG: pre-#148 PRs get one action-log line each after they merge.

RULES: never verify my own filings (CU-145..198 ... 296, 297, 301, 302 - list on CU-145); OKs by inbox as
'#N OK at <sha>' after a real test merge; D-034 20.69 of 25 USD, announce any model run first; D-081 keeps model
runs on fixture apps until CU-301 is verified live; input only through CUHelper (D-056).

LESSONS: enumerate every route that puts text into a field (type, printable key, paste by key or menu, drop, held
key, AutoFill) - CU-301 and CU-302 came from that; a frame host hides the field, so check each rule through
frames; probe through runTask before calling a hole; read the code, not the description.
```
