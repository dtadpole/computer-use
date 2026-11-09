---
title: Helper peer boundary
created: 2026-11-02T09:10:12Z
modified: 2026-11-09T08:45:00Z
level: L1
version: 0.3.12
description: Why the helper must not lend the owner's grants to any same-user process, and the four rules of D-029 - a peer check against a compiled list of entry points, one-run lifetime, a visible indicator, human-only approvals - with the residual risk the owner is told.
status: unverified
grounded_in:
  - source: _context_/team-operations/decision-log.yaml (D-029)
  - source: _team_members_/cu-developer-two/m6-desktop-review.md
  - source: 'Linear CU-227 and CU-224 (a held dispatcher lock left two dry-run helpers running for good, 2026-11-08)'
  - source: 'Linear CU-299 and D-080 (every seat edits and launches from its session worktree; the old seat worktrees were removed 2026-11-09)'
---

# Helper peer boundary

The per-run token proves the helper to the driver, not the reverse: any same-user process could otherwise launch
`CUHelper.app` with its own socket and act with the owner's grants (cu-developer-two). D-029 closes that as far as a
same-user process can be stopped.

| Rule | How (cu-developer-three, helper) |
|---|---|
| (a) peer check | after connecting, the helper reads the peer's uid and pid and refuses unless the peer is node signed by the Node.js Foundation's team running, by realpath inside a checkout the local config's `helperCheckouts` names, resolved inside the home, not world-writable (CU-295; from 0.2.60 the compiled `~/computer-use` and `~/computer-use--*` roots are gone, CU-299), the one compiled entry point `--driver-entry` names - `_tools_/agent-core/cli.mjs`, `_tools_/computer-use-mcp/server.mjs`, `_evaluators_/desktop-suite/run.mjs`, or `_verifiers_/desktop-helper-boundary/stand-in-driver.mjs` (it only awaits `hello`, sends `bye`) - with no `DYLD_*`, `LD_*`, `NODE_OPTIONS`, `NODE_PATH`, `NODE_REPL_EXTERNAL_MODULE` or `NODE_ICU_DATA` in its exec-time environment; a refusal closes the socket, logged by pid only |
| (b) one run | the helper exits on `bye`, on socket loss, at the run's wall-time cap, and when no driver connects within 10 s; it never listens without a run. Every other end is bounded (CU-227) by a watchdog on its own thread, taking none of the dispatcher's locks: if the orderly end has not exited within 5 s, it releases, on a second thread, what a copy of the held set names - a drag in flight cancelled first with Escape (an app that ignores Escape still gets the drop, a named residual), then every key and button up, tagged - and after about 1 s, posted or not, writes `stopped.json` (reason, released, time) beside the held-keys marker and exits 70; the driver ends the run `helper_lost` and tells the live view. The marker stays as a second net (CU-64 G1) |
| (c) visible indicator | with any grant and a connected driver, an always-visible status item or small window (none without a grant, since nothing can act); excluded by bundle id, never in scope or captured |
| (d) human approvals | per-app approvals and consent come only from a human channel ([app policy](app-policy.md)); the helper accepts no approval |

`--driver-node` and `--driver-entry` are checked against the compiled signing rule and list, so arguments cannot widen it.

## Configured checkouts only (CU-299, helper 0.2.60)

The compiled roots `~/computer-use` and `~/computer-use--<seat>` go. Under D-080 every seat edits and launches from
its session worktree, and the old seat worktrees were removed on 9 Nov. So those roots now admit only folders nobody
uses, and a `~/computer-use--*` created later would be admitted unasked.

- **Admitted:** a script whose real path is a listed entry point inside a `helperCheckouts` checkout, resolved and
  checked as CU-295 says. A path through the `~/computer-use` symlink is still admitted, because the match is real
  path to real path and its target is a configured checkout.
- **Unchanged:** the entry list, the node signing rule, the environment and option rules, and the
  `--driver-node`/`--driver-entry` pins.
- **Residual (D-029, not widened):** `helperCheckouts` lives in the user's own config, and a worktrees entry admits
  any folder one level below it. So a same-user process can still add an entry or create an admitted checkout,
  just as it can edit a listed entry point today. Checking that a child is a git worktree of the main checkout
  (cu-developer-one's option) would not narrow this, because such a process can run `git worktree add` too, so the
  rule stays simple.
- **Fail closed:** with no `helperCheckouts` (missing, unreadable or malformed config) no peer is admitted, and every
  live run is refused before the hello. The start log says `checkouts: configured none - every peer is refused`.
  The post-install check reads that line.
- **Dependents, before the helper lands:**
  - cu-verifier's boundary verifier decides whether it can judge the accepted case by a `~/computer-use(--seat)`
    pattern. It must read the configured checkouts instead (real path inside one), or it skips that case from a
    session worktree.
  - cu-integrator's phase 2 runs from a `/tmp` worktree. Its helper suites use `--dry-run` or
    `--simulate-ungranted` (no peer check), so they are unaffected.
  - A live desktop run from `/tmp` is already refused today.
- **Tests:**
  - Unit: an old seat path that is not configured is refused, no config admits nothing, and a configured worktree
    child and the symlinked main checkout are admitted.
  - helper-sources: no compiled root remains (`layouts`, `checkoutRoot`).
- **Proof after install:** admitted from the session worktree; refused from an unlisted `~/computer-use--probe`
  worktree made for the test and removed after; the start line.

## The helper's one Accessibility write (CU-329, helper 0.2.62)

The helper otherwise only reads Accessibility. It makes one write: `AXManualAccessibility = true` on the application
element of an approved app, the first time in a run that the app is frontmost or activated. Electron apps build their
whole tree only once it is set; Chrome ignores it (CU-321). Up to 0.2.61 the write was never undone. The app kept
building its full tree after the run until it quit, which costs CPU and memory and exposes that tree to every other
Accessibility client the user has granted.

From 0.2.62:

- **Read first.** The helper reads the attribute before writing. If it is already true, set by the user or another
  assistive app, the helper writes nothing and remembers nothing. If the read fails - a timeout or any Accessibility
  error other than "no value" or "unsupported", which mean unset - the helper also writes nothing, since a write it
  could not judge is one it could not undo safely.
- **Restore at every end.** Otherwise the helper writes true and remembers the pid. At every run end - `bye`, socket
  loss, the wall-time cap, and the CU-227 watchdog path - it writes false back for each remembered pid whose process
  still runs. Each write is bounded by the 0.5 s messaging timeout; a hung app costs at most that.
- **Residual.** A helper killed outright (SIGKILL, power loss) restores nothing, so the app keeps the tree until it
  quits. If another assistive app sets the attribute during the run, the helper still writes false at the end. An app
  relaunched during the run has a new pid and is handled as a new app.

## Why a list, not any `.mjs`

Every listed entry runs through agent core's policy and consent; were any `.mjs` allowed, a same-user process could
write one and drive the helper. Conformance checks run `--dry-run` or `--simulate-ungranted`: no peer check, nothing can act.

## Residual risk (stated in the owner's grant request)

A same-user process can still start a listed entry, edit one or a module it imports (git
shows it), or read the control-token file and answer consent as the person
([consent-authority](../system-architecture/consent-authority.md)). The indicator, one-run lifetime and
red team bound that; a per-run confirmation in the helper's dialog stays an owner option, since it
would stop unattended runs.

## Checks

cu-verifier: a script on the helper's socket and node running an unlisted `.mjs` are refused before any request; the
helper exits after `bye` and with no driver; with a grant, the indicator exists while connected and is in no run PNG.
