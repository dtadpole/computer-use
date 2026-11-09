---
title: CU Fixture launches only under the desktop-run lock
created: 2026-11-09T02:40:00Z
modified: 2026-11-09T02:40:00Z
level: L1
version: 0.1.0
description: "CU-305: launchFixture refuses unless its process runs inside a live desktop run (run.json held by itself or an ancestor) or under a live hold of the seat it declares (CU_DESKTOP_SEAT); the rule moves from each caller into the launcher."
status: proposed
grounded_in:
  - source: "CU-305 (three launches outside any hold on 8-9 Nov: the gate's phase 1, the nightly's phase 1 - CU-304 - and a seat's cross-check runs; cu-verifier's 23:50Z series saw nine foreign CU Fixture processes)"
  - source: "cu-coordinator 02:20Z: design note first, with cu-integrator's holder-process case (a lock held by the caller's seat, or an exported token)"
  - source: "_environments_/macos-desktop/run-lock.mjs on main 65f6748 - run.json {seat, runId, pid}, hold.json {seat, until, keeperPid}, the keeper's sentinel entry; _tools_/nightly-regression/nightly.mjs (acquireDesktopRun, then child test processes)"
---

# Fixture launch lock (CU-305)

## Rule

`launchFixture` (`_tools_/desktop-fixture/client.mjs`) checks the lock before it spawns. It starts CU Fixture when
either of these holds, and otherwise refuses with `fixture_unlocked`, a message naming the two ways in:

1. **Inside a run.** `run.json` holds a live run (not the keeper's sentinel) whose `pid` is this process or one of its
   ancestors. This covers the nightly's and the gate's phase 2, which acquire the run and then start the test
   processes, and an agent run that launches the fixture itself. The ancestors come from a `ps -o ppid=` walk, at most
   32 steps.
2. **Under the caller's own hold.** `hold.json` holds a live hold whose seat equals the seat the caller declares:
   `options.seat`, else the environment's `CU_DESKTOP_SEAT`. A seat that runs a series under
   `run-lock.mjs hold --seat S` exports `CU_DESKTOP_SEAT=S` to it.

Both are read without the mutex; launching is not admission. The check only refuses, and nothing is written.

## The holder-process case

A hold's keeper is detached, so it is never an ancestor of the series it protects, and rule 1 cannot see a hold.
Rule 2 is the exported token: the holder names its seat to its own children. A random token in `hold.json` would add
nothing, because every seat is the same Unix user and `hold.json` is world-readable. The lock guards against
accidents (all three incidents were callers that never thought of the lock), not against a seat that sets a
variable to another's name. A seat that names itself while another seat holds the Mac is refused, because the seats
differ.

## Callers

- The nightly's and the gate's phase 2: rule 1, no change. cu-integrator, confirm that the gate's node-tests-fixapps
  step runs under a process that holds `run.json`, as the nightly does.
- Seat series (verifier runs, cross-checks): take the hold and export `CU_DESKTOP_SEAT`.
- `_verifiers_/desktop-fixture/check.mjs` passes `CU_VERIFY_SEAT` as `options.seat`.
- `_tools_/desktop-checks`, which already checks the hold itself: unchanged.
- Hermetic tests: `options.lockDir` points at a scratch lock, never `/tmp/cu-desktop-run`.

## Tests and limits

- Rows: no lock refuses; another seat's hold refuses; one's own hold launches; a run held by an ancestor launches; a
  sentinel or a dead pid refuses; an expired hold refuses.
- Mutants: the check dropped; the seat comparison dropped; the ancestor walk replaced by "any live run".
- Named limit: a process started outside the holder (`env -i`, a detached job) that sets `CU_DESKTOP_SEAT` to the
  holding seat passes. That is accepted, because the lock is a coordination rule (D-053, D-066), not a sandbox.
- The `desktop-fixture` suite INDEX says it launches the real app under the lock.
