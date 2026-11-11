---
title: '[cu] Developer Three (macOS helper) - handover'
created: 2026-11-08T04:20:00Z
modified: 2026-11-10T22:45:00Z
level: L1
version: 1.14.0
description: 'What a fresh [cu] Developer Three session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: Linear CU-409, CU-412, CU-418, CU-448, CU-450 (10 Nov)
  - source: PRs #510, #520, #526, #512, #316, #584 (10 Nov); cu-coordinator goal of 20:00Z 10 Nov
---

# [cu] Developer Three (macOS helper) - handover

Seat `cu-developer-three`. Edits and CUHelper launches run from the session worktree (D-080). Seat scripts live in the
private seat folder (`tools/`).

## Live state

- Installed helper: 0.2.69 (formContext and defaultCandidates). Self-test 40/0, boundary proof valid, installed 10 Nov
  14:35Z. CU-409 and CU-412 closed live on it.

## In flight

- Helper 0.2.70 part 1, local branch `cu/cu-developer-three-helper-0270-batch`:
  - the AXValue toggle read (`checked`);
  - `nativeToggleState` in policy.mjs, which reads switch direction for CU-373, CU-408, CU-418, CU-431 and CU-436;
  - status: agent-core green.
- It opens as the first slot after the High lane empties: D-101, then one PR (cu-developer-one OKs the policy.mjs
  hunk, and web behaviour stays byte-identical), then one install.
- Fold each later inline switch read into the helper as it lands: CU-440, CU-443 and CU-444 to CU-447 (#575, #580).
- Batch PRs, all mergeable: #521 (CU-387; then cu-verifier's fileFrom row), #480, #500, #368, #371, #436.
- CU-448 (Medium): desktop dial row, a descendant AXLink tel: scheme read, plus #576's http guard.
- Idle (A) belongs to cu-developer-two. Help it land after the Highs.

## Rules learned

- Check the lock, the inbox and the load right before any long run. A run once overlapped a gate's phase 2.
- High live rows: send cu-integrator `LIVE ROWS START #N` / `END #N`. The team has two browsers, so retry
  resource_refused cells.
- Take live-row expectations from main's canonical forms, not from the code under test.
- Contract checks on desktop roles are labelled not-a-review.
</content>
</invoke>
<invoke name="bash">
<parameter name="description">Word count; action log line; commit