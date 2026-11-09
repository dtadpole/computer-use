---
title: '[cu] Developer Three - Artifacts'
created: 2026-11-02T09:50:00Z
modified: 2026-11-09T13:47:48Z
level: L1
version: 0.11.4
description: What cu-developer-three has delivered and learned - the helper pull requests, the owner request draft, the measurements and the practice notes.
status: unverified
grounded_in:
  - source: _seats_/cu-developer-three/responsibilities.md
---

# Artifacts

| When | What | Where |
|---|---|---|
| 11-02 | Helper 0.2.0-0.2.5 (dispatcher, dry run, peer boundary, launch pins); TCC request draft and measurements | reflection #184-#243; [tcc-request-draft.md](tcc-request-draft.md), [post-grant-measurements.md](post-grant-measurements.md) |
| 11-05 | Helper 0.2.17-0.2.28: drags (CU-36, CU-44-46), foreign content and panels (CU-39), hit window (Q-D15), two displays (CU-51), capture scaling (CU-74), prompts refused (CU-76) | computer-use #35-#168 |
| 11-06 | Helper 0.2.29-0.2.30: simulated region (CU-83), interruptible holds and cursor query (CU-64) | #193, #198 |
| 11-07 | Helper 0.2.31-0.2.39: panel fields (CU-48), default button (CU-142), sheet and app (CU-148), real keyboard focus and the panel under Go to Folder (CU-139), menu shortcuts (CU-154), pasteboard change count only (CU-151, D-060) | #310, #327, #343, #352, #358, #363, #367 |
| 11-05 to 11-07 | CU Fixture: panels, clipboard screens (CU-62), keypad, S1-S9, named targets (CU-137), build race (CU-141), consent-keys with sheets (CU-135, CU-142-149) | #96-#157, #184-#205, #300-#364 |
| 11-05 | Measurements: drag image, hit window, panels (no folder attribute, D-047) | [hit-window-measurements.md](hit-window-measurements.md), [panel-measurements.md](panel-measurements.md) |

## Practice notes

- **Git:** read `origin/main` before writing at a path another seat named; never chain a push after a rebase (a
  stopped rebase empties the pull request).
- **Lock and runs:** load the lock from current main (CU-75); never start an agent-core run inside a wrapper that holds
  it; run locked loops one at a time; clear output files first and act only on a passing exit (#254 was pushed
  untested); announce an install once the lock is held.
- **Input:** no raw CGEvents from a script (D-056); a modifier's CGEvent is `flagsChanged`.
- **Accessibility:** a control's AXFocused is its window's first responder, so compare the system-wide focus (CU-139);
  find a panel through sheets on it, and report none when a last resort finds two.
- **Boundaries:** tell cu-verifier before narrowing one; a new system API starts with guard tests and a ruling
  (D-060); compare executable paths as the kernel reports them.
- **Owner state:** never clear it after an unchecked read (a refused pasteboard read looks empty); a live-board plan
  goes to cu-verifier first.
- **Checks:** a live/dry-run disagreement starts with the window list at the pointer (CU-46); audit per-display paths
  on two displays; a change under a verifier's mutant carries its find text; install watchers poll main's version, not
  a PR's state.
- Check the word budget before pushing records.
