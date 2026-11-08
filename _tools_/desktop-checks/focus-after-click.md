---
title: CU-226 focus after a click - the measurement plan
created: 2026-11-08T10:22:00Z
modified: 2026-11-08T10:32:00Z
level: L1
version: 0.1.1
description: The live measurement of whether a key or typed string right after a click is judged on the focus from before the click - guards, steps, what is recorded and how it is read.
status: unverified
grounded_in:
  - source: CU-226 (cu-researcher's suspected click-then-key race; cu-coordinator's triage - measurement first)
  - source: D-056 (input only through CUHelper), D-066 (owner idle at least 300 s)
---

# CU-226 focus after a click - the measurement plan

**Question.** The loop judges a `type` with one focus read taken right after the helper answered the click before
it. Does that read sometimes still show the focus from before the click?

**Guards, before any input.** The seat holds the desktop (`run-lock.mjs hold`), no run is active, and the owner has
been idle for at least 300 s (D-066). Every input is a `cli.mjs run --model scripted` through CUHelper (D-056), into CU
Fixture only; each run's local-input pause stays armed, and a failed or paused run stops the series.

**Steps.** For each attempt, launch CU Fixture on consent-cells (`copyRow` on), then run one scripted plan:

- start `none` (nothing focused): one batch [click the plain entry Password, type x];
- start `entry`: first [click the unnamed paste entry, type q], then the same batch.

Default 30 attempts per start (`--runs`). One attempt takes a few seconds.

**Read.** The type event's judged target. Password is fresh: the hand-off `password_field`, declined unattended,
nothing typed. Anything else is stale: no target, or the previous entry. The fixture's own record says whether x
reached the entry. The `entry` start's first pair counts as a second measurement, judged on the paste entry.
Each row also gives the milliseconds from the click's last record to the type's decision record, so a clean series
still shows its margin.

**Report.** One JSON line per attempt (run id, start, read, verdict) and a summary with the stale run ids, recorded on
CU-226. Any stale read makes the race real and goes to cu-developer-one's fix. No stale read in 60 attempts closes the
issue as measured.
