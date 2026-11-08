---
title: Desktop evaluation plan - unattended suite runs on two Claude models
created: 2026-11-05T14:01:35Z
modified: 2026-11-08T13:57:08Z
level: L1
version: 1.2.0
description: How the desktop suite is run unattended on model-a and claude-sonnet-5-5, every attempt counted, with the cost estimate under D-034 and the rates reported per model and build.
status: unverified
grounded_in:
  - source: dtadpole/computer-use/_tools_/desktop-fixture/tasks.mjs (37 entries at the first batch, 38 from computer-use 66)
  - source: dtadpole/computer-use/_evaluators_/desktop-suite/INDEX.md
  - source: _context_/evaluation-design/r58-measurement.md
  - source: _context_/run-analysis/full-suite-2026-11-01.md
  - source: _context_/team-operations/decision-log.yaml (D-024, D-033, D-034)
  - source: Linear CU-66 (the D-034 ledger and the 21 USD line, 8 November)
---

# Desktop evaluation plan

## What runs

The desktop suite of cu-verifier's fixture apps (CU Fixture, CU Ledger): **26 tasks and 12 injection screens**, 38
attempts per model (the first batch, CU-8, ran 25 and 12 before drag-across-other-app was added), through `_evaluators_/desktop-suite/run.mjs --announced`, on claude-sonnet-5-5 first, then
model-a. Every attempt counts; a refused, errored or bounded run is a row, never retried away. Rows land as
`_evaluators_/task-suite/results/<date>-cu-researcher-desktop-<model>.jsonl`; `run.mjs --summary` rates them per
model and build, and only a clean build gets a rate.

Preconditions: cu-verifier's runbook steps 1 to 3 pass on the same build; the CLI offers `--env macos-desktop`; both
fixture apps are approved 'always' (done, D-033); one desktop run at a time under cu-verifier's lock, each batch
announced by inbox; synthetic input only to the two fixture apps.

## Cost (D-034: 25 USD shared, caps 20 steps, 10 min, 1 USD per run)

Measured in the first batch (CU-8, 1920 by 1080 display): 0.028 USD per Sonnet run and 0.050 per Opus run, 2.88 USD
for 74 runs. The second batch, 38 runs per model, projects to about 1.1 USD on Sonnet and 1.9 on Opus, about 3 USD in
all. On 8 November about 20.69 USD of D-034 is spent and the team holds a 21 USD line: no batch runs, a Sonnet
rerun of S1-S11 (about 0.33 USD) would cross it, and model-a on S8 and S9 (CU-66) waits for the owner.

## Rates reported

Per model and build, each as k/n with a Wilson 95% interval: task pass; injection compromised, escalated (by origin:
inspector, model) and not escalated; consent recall per class with the model-initiated share; over-asking and benign
false positives; local-input pauses and hand-offs. Failures go into a desktop taxonomy with an owner per cause, as in
the browser record.

## Read next

[r58-measurement](r58-measurement.md).
