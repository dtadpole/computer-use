---
title: Helper peer boundary
created: 2026-11-02T09:10:12Z
modified: 2026-11-08T21:59:00Z
level: L1
version: 0.3.10
description: Why the helper must not lend the owner's grants to any same-user process, and the four rules of D-029 - a peer check against a compiled list of entry points, one-run lifetime, a visible indicator, human-only approvals - with the residual risk the owner is told.
status: unverified
grounded_in:
  - source: _context_/team-operations/decision-log.yaml (D-029)
  - source: _team_members_/cu-developer-two/m6-desktop-review.md
  - source: 'Linear CU-227 and CU-224 (a held dispatcher lock left two dry-run helpers running for good, 2026-11-08)'
---

# Helper peer boundary

The per-run token proves the helper to the driver, not the reverse: any same-user process could otherwise launch
`CUHelper.app` with its own socket and act with the owner's grants (cu-developer-two). D-029 closes that as far as a
same-user process can be stopped.

| Rule | How (cu-developer-three, helper) |
|---|---|
| (a) peer check | after connecting, the helper reads the peer's uid and pid (`LOCAL_PEERCRED`, `LOCAL_PEERPID`) and refuses unless the peer is node signed by the Node.js Foundation's team running, by realpath inside `~/computer-use`, a `~/computer-use--*` checkout or one the local config's `helperCheckouts` names (CU-295), the one compiled entry point `--driver-entry` names - `_tools_/agent-core/cli.mjs`, `_tools_/computer-use-mcp/server.mjs`, `_evaluators_/desktop-suite/run.mjs`, or `_verifiers_/desktop-helper-boundary/stand-in-driver.mjs` (it only awaits `hello`, sends `bye`) - with no `DYLD_*`, `LD_*`, `NODE_OPTIONS`, `NODE_PATH`, `NODE_REPL_EXTERNAL_MODULE` or `NODE_ICU_DATA` in its exec-time environment; a refusal closes the socket, logged by pid only |
| (b) one run | the helper exits on `bye`, on socket loss, at the run's wall-time cap, and when no driver connects within 10 s; it never listens without a run. Every other end is bounded (CU-227) by a watchdog on its own thread, taking none of the dispatcher's locks: if the orderly end has not exited within 5 s, it releases, on a second thread, what a copy of the held set names - a drag in flight cancelled first with Escape (an app that ignores Escape still gets the drop, a named residual), then every key and button up, tagged - and after about 1 s, posted or not, writes `stopped.json` (reason, released, time) beside the held-keys marker and exits 70; the driver ends the run `helper_lost` and tells the live view. The marker stays as a second net (CU-64 G1) |
| (c) visible indicator | with any grant and a connected driver, an always-visible status item or small window (none without a grant, since nothing can act); excluded by bundle id, never in scope or captured |
| (d) human approvals | per-app approvals and consent come only from a human channel ([app policy](app-policy.md)); the helper accepts no approval |

`--driver-node` and `--driver-entry` are checked against the compiled signing rule and list, so arguments cannot widen it.

## Why a list, not any `.mjs`

Every listed entry runs through agent core's policy and consent; were any `.mjs` allowed, a same-user process could
write one and drive the helper. Conformance checks run with `--dry-run` or `--simulate-ungranted`, where the peer
check is skipped and nothing can act.

## Residual risk (stated in the owner's grant request)

A same-user process can still start a listed entry, edit one or a module it imports (git
shows it), or read the control-token file and answer consent as the person
([consent-authority](../system-architecture/consent-authority.md)). The indicator, one-run lifetime and
red team bound that; a per-run confirmation in the helper's dialog stays an owner option, since it
would stop unattended runs.

## Checks

cu-verifier: a script on the helper's socket and node running an unlisted `.mjs` are refused before any request; the
helper exits after `bye` and with no driver; with a grant, the indicator exists while connected and is in no run PNG.
