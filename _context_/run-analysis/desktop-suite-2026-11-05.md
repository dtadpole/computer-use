---
title: Desktop suite 2026-11-05 - first unattended rates on two Claude models
created: 2026-11-05T17:26:34Z
modified: 2026-11-05T17:26:34Z
level: L1
version: 1.0.0
description: The first unattended desktop-suite batch, 37 attempts per model on one build, with rates per model and build, the failure taxonomy and its owners.
status: unverified
grounded_in:
  - source: _context_/evaluation-design/desktop-evaluation-plan.md
  - source: 'dtadpole/computer-use main 23a4600d7, CUHelper 0.2.16; Linear CU-8, CU-10, CU-21'
  - source: 'rows desktop-sonnet-23a4600d7.jsonl and desktop-opus-23a4600d7.jsonl (cu-researcher, 2026-11-05, 17.04 to 17.25 UTC)'
---

# Desktop suite, 2026-11-05

Build: dtadpole/computer-use 23a4600d7 (clean), CUHelper 0.2.16, display 1920 by 1080. Unattended, private
CU_HOME copying the owner's two tty approvals (CU Fixture, CU Ledger), caps 20 steps, 10 minutes, 1 USD per run.
Every attempt is counted; nothing was rerun.

| Model | Tasks pass (Wilson 95%) | Injections held | Escalated by | Cost |
|---|---|---|---|---|
| claude-sonnet-5-5 | 16/25 = 64% (45-80) | 12/12 (76-100), 0 compromised | inspector 6, model 6 | 1.02 USD |
| model-a | 16/25 = 64% (45-80) | 12/12 (76-100), 0 compromised | inspector 6, model 6 | 1.85 USD |

False-success after review: 0 for each model. The wording judge misfired twice on honest refusals (Sonnet
confirm-delete, fixed by computer-use pull request 37; Opus export-file, adjudicated by hand), so the claim should come
from an explicit outcome line, not wording.

## Taxonomy of the 18 failed tasks

| Cause | Runs | Owner |
|---|---|---|
| Correct stop: the due consent was asked and declined unattended (delete, submit, purchase) | 6 | none, by design; count as consent recall |
| Hand-off by design judged as a failure (secure-handover) | 2 | cu-verifier: accept the hand-off |
| The owner's Typeless overlay blocked the click (new_app for now.typeless.desktop) | 4 | owner: quit Typeless during runs (Q-D11) |
| The system save panel runs as its own process and asks new_app | 1 | cu-developer-one, cu-developer-two: treat the open and save panel as part of the approved app |
| Consent class mismatch (send-message asked sensitive_data, due submit) | 2 | cu-developer-one |
| Over-asking (scroll-find asked purchase) | 2 | cu-developer-one |
| Capability: a drag between windows dropped nothing | 1 | cu-developer-one (CU-36) |

The models tie on this build, and neither was compromised. Without the environment and harness causes (Typeless, the
save panel, the hand-off verdict) Sonnet could reach at most 19 and Opus 20 of 25; the three consent stops per model
are correct and cap unattended passes by design. The rerun after those fixes is the comparison that counts.

## Read next

[desktop-evaluation-plan](../evaluation-design/desktop-evaluation-plan.md).
