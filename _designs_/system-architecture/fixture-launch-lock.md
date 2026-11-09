---
title: CU Fixture launches only under the desktop-run lock
created: 2026-11-09T02:40:00Z
modified: 2026-11-09T02:40:00Z
level: L1
version: 0.2.0
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
   32 steps. A walk that fails or passes 32 steps finds no ancestor, so it refuses (fail closed).
2. **Under the caller's own hold.** `hold.json` holds a live hold - minutes left and its keeper alive (a stale file
   whose keeper died does not count) - whose seat equals the seat the caller declares:
   `options.seat`, else the environment's `CU_DESKTOP_SEAT`. A seat that runs a series under
   `run-lock.mjs hold --seat S` exports `CU_DESKTOP_SEAT=S` to it.

Read without the mutex (launching is not admission); nothing is written.

## The holder-process case

A hold's keeper is detached, never an ancestor of its series, so rule 2 is the exported token: the holder names its
seat to its children. A random token would add nothing: every seat is one Unix user and `hold.json` is
world-readable. The lock guards against accidents (all three incidents), not against a seat naming another.

## Callers

- The nightly's phase 2: rule 1 (nightly.mjs holds `run.json`). The gate's: rule 1 since 02:26Z, when cu-integrator's
  holder began naming its parent, the suite shell; a sibling before, which the walk refuses.
- Seat series (verifier runs, cross-checks): take the hold and export `CU_DESKTOP_SEAT`.
- `_verifiers_/desktop-fixture/check.mjs` passes `CU_VERIFY_SEAT` as `options.seat`.
- `_tools_/desktop-checks` (which already checks the hold itself) and the step-4 owner verifier declare their `--seat`.
- Hermetic tests: `options.lockDir` points at a scratch lock, never `/tmp/cu-desktop-run`.

## Tests and limits

- Rows (cu-verifier's four included):
  - refused: no lock; another seat's hold; an expired or stale hold; a sentinel; a dead pid; a sibling's, cousin's or
    stranger's run; a failed or over-long walk;
  - admitted: one's own hold; a run held by an ancestor;
  - wording: the refusal names the holding seat and both ways in, never a pid, path or time.
- Mutants: the check dropped; any hold; any live run; the sentinel counted; the keeper ignored; the walk unbounded.
- Named limit: a process outside the holder that sets `CU_DESKTOP_SEAT` to the holding seat passes - accepted, since
  the lock is a coordination rule (D-053, D-066), not a sandbox.
- The `desktop-fixture` suite INDEX says it launches the real app under the lock.
- Out of scope: the fixture site (`_tools_/fixture-site`, a loopback web server). It starts no app and posts no input.
