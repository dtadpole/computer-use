---
title: nightly-regression
created: 2026-11-06T04:10:00Z
modified: 2026-11-09T04:23:00Z
version: 0.4.1
description: The no-model nightly regression on main - every node suite that starts no app and the fake-helper verifiers, and under the desktop-run lock the helper tests, the fixture suite, every test file that launches CU Fixture, the fixture plans and the dry run - with one retry per failing step, a persistent flake list and a short report.
grounded_in:
  - source: Linear CU-59 (the nightly regression and flake list)
  - source: _context_/team-operations/decision-log.yaml, D-049 (continuity work while step 4 waits)
  - source: Linear CU-304 (25 test files that launch CU Fixture ran in phase 1, outside the lock)
---

# `nightly-regression`

Writer: cu-integrator. Node 24, no npm, no model, no Chrome.

```bash
node _tools_/nightly-regression/nightly.mjs                 # origin/main, reports in /tmp/cu-nightly
node _tools_/nightly-regression/nightly.mjs --node-only     # phase 1 only, no lock
node _tools_/nightly-regression/nightly.mjs --worktree-root ~/dtadpole/computer-use-wt --worktree-prefix '<session-id>--nightly-'
```

On a fresh detached worktree of `--ref` (default `origin/main`, fetched first), made under `--worktree-root`
(default `/tmp`; helper 0.2.60 admits live helper starts only from configured checkouts, so the integrator's nightly
passes the configured worktrees parent, CU-299):

| Phase | Lock | Steps |
|---|---|---|
| 1 | none | `node --test` on every `_tests_/*/` file outside `macos-helper` and `desktop-suite` that starts no app; the fake-helper verifiers `evaluation-suite`, `desktop-perception`, `desktop-action-contract`, `desktop-consent`, `desktop-agent-loop`, `desktop-trajectory`, `desktop-integration`, `desktop-human-control` |
| 2 | the team's desktop-run lock (`/tmp/cu-desktop-run`) as `--seat` | `_tests_/macos-helper` (ad-hoc CUHelper), `_tests_/desktop-suite` (offscreen CU Fixture), `node-tests-fixapps` - every other test file that imports `_tools_/desktop-fixture/build.mjs` or `client.mjs` (CU-304) - then the `desktop-fixture` (fixture plans), `desktop-helper-protocol` and `desktop-helper-dryrun` verifiers |

These are the same steps as cu-integrator's gate, run on main rather than on a PR head. A test file counts as launching CU
Fixture by its import statements (`launchesFixtureApp`), not by a mention in a string or comment.

- **Retry and flakes.** A failing step runs once more. A step that passes on the retry is a flake: its first run's
  failing test names (or `(whole step)`) go into `<out>/flakes.json` with a count, first and last seen, and the last
  five heads. A step that fails twice is a failure.
- **Safety.** Model keys (`ANTHROPIC_*`, `OPENAI_*`, `*_API_KEY` and the like) are stripped from every child's
  environment; `CU_HOME` is a private temporary directory; no step starts Chrome, installs a helper or sends input
  to anything but CU Fixture. Phase 2 takes the lock or waits for it, out a seat's hold or for the owner's idle slot
  (`--lock-wait`, default 900 s; `desktop_held`, CU-75; `owner_active`, D-066), and is otherwise skipped and reported. Leftover processes started from the
  worktree are killed and the worktree removed.
- **Announcing.** `--on-lock` and `--on-release` run a shell command when the lock is taken and after it is
  released (`NIGHTLY_HEAD`, `NIGHTLY_RUN_ID`, `NIGHTLY_SEAT` in the environment), for the team's DESKTOP HELD and
  RELEASED notes.

| Output | What |
|---|---|
| `<out>/<stamp>-<head>/<step>.log`, `<step>.retry.log` | each attempt's output |
| `<out>/<stamp>-<head>/report.json`, `report.md` | the run: per step result, attempts, exit, seconds, counts or verdict |
| `<out>/latest.md` | the last report, also printed on stdout |
| `<out>/flakes.json` | the flake list across runs |

Exit codes: 0 green (flakes allowed), 1 a step failed twice, 2 bad arguments or setup, 3 phase 2 skipped.

| File | Owns |
|---|---|
| [`nightly.mjs`](nightly.mjs) | the run: worktree, child processes in their own process groups with timeouts, the lock, hooks, cleanup, files |
| [`logic.mjs`](logic.mjs) | the pure parts: arguments, the step plan, reading node and verifier output, classification, the flake list, the report |

Tests: [`_tests_/nightly-regression/`](../../_tests_/nightly-regression/INDEX.md). cu-integrator runs it nightly
from its session schedule and sends the report's summary line to cu-coordinator.

**State (0.1.0):** first run 2026-11-06T04:10Z on main `94e2b1b0b`, GREEN - node 970/970, macos-helper 33/33,
desktop-suite 14/14, verifiers 11/11 (desktop-fixture 54 plans); phase 2 waited for another seat's run, then held
the lock 139 s; no flakes, no leftovers.
