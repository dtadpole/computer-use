---
title: CU-226 focus after a click - the measurement plan
created: 2026-11-08T10:22:00Z
modified: 2026-11-08T10:45:00Z
level: L1
version: 0.2.0
description: The live measurement of whether a key or typed string right after a click is judged on the focus from before the click - guards, steps, what is recorded and how it is read.
status: unverified
grounded_in:
  - source: CU-226 (cu-researcher's suspected click-then-key race; cu-coordinator's triage - measurement first)
  - source: D-056 (input only through CUHelper), D-066 (owner idle at least 300 s)
---

# CU-226 focus after a click - the measurement plan

**Question.** The loop judges a key with one focus read taken right after the helper answered the click before it.
Does that read sometimes still show the focus from before the click?

**Guards, before any input.** The seat holds the desktop (`run-lock.mjs hold`), no run is active, and the owner has
been idle for at least 300 s (D-066). Every input is a `cli.mjs run --model scripted` through CUHelper (D-056), into CU
Fixture only; each run's local-input pause stays armed, and a failed or paused run stops the series.

**Series.** Each attempt launches CU Fixture and runs one scripted plan ending in one batch.

- `type` route, consent-cells: [click the plain entry Password, type x], from nothing focused (`none`) and from the
  unnamed paste entry (`entry`, first [click it, type q]).
- `return` route, consent-keys (cu-verifier): [click Message, press Return] from Notes (first [click Notes, type n]).
  Message's window has the default button Send.

30 attempts per start, quiet, then again with `--load 3` (three agent-core suites looping beside it; cu-researcher).

**Read.** The verdict is the fixture's record (D-012): stale when x reached an entry or Send recorded `sent`. The key
event's judged target is the diagnosis: fresh when it is the clicked entry (Password hands off, Message asks submit,
both declined unattended). A disagreement is its own finding. Each row gives the ms from the click's last record to the
key's decision record, so a clean series still shows its margin.

**Report.** Per attempt one JSON line; a summary with stale and disagreeing run ids, the margin's minimum, and the
detection bound (0 stale in 60 is under 4.9% at 95%; in 120, 2.5%). Recorded on CU-226. Any stale read goes to
cu-developer-one's fix; none in every series closes it as measured, with that bound.
