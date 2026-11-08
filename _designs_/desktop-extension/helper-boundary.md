---
title: Helper peer boundary
created: 2026-11-02T09:10:12Z
modified: 2026-11-05T17:09:27Z
level: L1
version: 0.3.7
description: Why the helper must not lend the owner's grants to any same-user process, and the four rules of D-029 - a peer check against a compiled list of entry points, one-run lifetime, a visible indicator, human-only approvals - with the residual risk the owner is told.
status: unverified
grounded_in:
  - source: _context_/team-operations/decision-log.yaml (D-029)
  - source: _team_members_/cu-developer-two/m6-desktop-review.md
---

# Helper peer boundary

The per-run token proves the helper to the driver, not the driver to the helper. Without more, any process running
as the owner could launch `CUHelper.app` with its own socket and token file and act with the owner's grants
(cu-developer-two's finding). D-029 closes that as far as a same-user process can be stopped.

| Rule | How (cu-developer-three, helper) |
|---|---|
| (a) peer check | after connecting, the helper reads the peer's uid and pid (`LOCAL_PEERCRED`, `LOCAL_PEERPID`) and refuses unless the peer is node signed by the Node.js Foundation's team and its arguments name, by realpath inside `~/computer-use` or a `~/computer-use--*` checkout (CU-29; reflection paths no longer served), one entry point of a compiled list - `_tools_/agent-core/cli.mjs`, `_tools_/computer-use-mcp/server.mjs`, `_evaluators_/desktop-suite/run.mjs`, and cu-verifier's `_verifiers_/desktop-helper-boundary/stand-in-driver.mjs` (it only awaits `hello` and sends `bye`) - the one `--driver-entry` names; a refusal closes the socket, logged by pid only; and refused if its exec-time environment holds any `DYLD_*`, `LD_*`, `NODE_OPTIONS`, `NODE_PATH`, `NODE_REPL_EXTERNAL_MODULE` or `NODE_ICU_DATA` |
| (b) one run | the helper serves one run: it exits on `bye`, on socket loss, at the run's wall-time cap, and when no driver connects within 10 seconds of launch; it never listens without a run |
| (c) visible indicator | with any grant and a connected driver the helper shows an always-visible status item or small window; with no grant it may show none, since nothing can act; excluded by bundle id, it is never in scope or captured |
| (d) human approvals | per-app approvals and consent still come only from a human channel ([app policy](app-policy.md)); the helper accepts no approval at all |

The helper checks the launch arguments `--driver-node` and `--driver-entry` against the peer and against its compiled
signing rule and entry list, so arguments alone cannot widen it.

## Why a list, not any `.mjs`

Every listed entry point runs through agent core's policy and consent. If any `.mjs` passed, a same-user process
could write one and drive the helper directly; with the list it must run a listed entry or edit tracked files, which
git shows.

Protocol-conformance checks stay pre-grant: they run the helper with `--dry-run` or `--simulate-ungranted`, where
the peer check is skipped and nothing can act.

## Residual risk (stated in the owner's grant request)

A same-user process can still start a listed entry point (a run under the same policy and consent), edit a listed
entry point or a module it imports (git shows it; nothing blocks it), or read the control-token file and answer
consent, new apps included, as the person ([consent-authority](../system-architecture/consent-authority.md)). The
indicator makes a run visible, the one-run lifetime keeps the window short, and cu-researcher red-teams the
boundary. A per-run confirmation the owner clicks in the helper's own dialog is held as an owner option, since it
would stop unattended evaluation runs.

## Checks

cu-verifier: a non-driver client (a script connecting to a running helper's socket) and node running an unlisted
`.mjs` are refused before any request; the helper exits after `bye` and when no driver connects; with a grant, the
indicator window exists while connected and appears in no run PNG.
