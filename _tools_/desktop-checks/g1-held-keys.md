---
title: G1 live check - a helper killed mid-hold, the next start releases Shift
created: 2026-11-06T15:20:00Z
modified: 2026-11-06T16:33:58Z
version: 0.5.0
level: L1
status: unverified
description: The plan cu-verifier reviews before the first live run of g1-held-keys.mjs (CU-94, Part of CU-64) - preconditions and owner-away guards, the kill identity, the post-kill flags checkpoint, the release, the fallback and alert, the report.
grounded_in:
  - source: cu-verifier's G1 requirements and design review (inbox, 2026-11-06)
  - source: cu-coordinator's decision of one G1 plan (inbox, 2026-11-06)
  - source: cu-developer-one's agent-core checks from PR 222 (inbox, 2026-11-06)
---

# G1 live check

CU-64 G1: a helper that dies while a hold keeps a key down leaves that key down in the owner's whole login session;
the next helper's start must release it before anything else (helper 0.2.30's held-keys marker, the driver's
`releasedStale`, agent core's `released_stale` and notices). This check proves it on the Mac. It holds the owner's
Shift on purpose, so it runs only after cu-verifier has reviewed this plan and [the script](g1-held-keys.mjs), under
his announced enforced hold, and cu-coordinator is told before and after.

How to run it (cu-verifier, 2026-11-06): take the desktop-run hold first, then wait under it until HID idle reaches
300 s. HIDIdleTime resets on the helper's own posted events too, so right after any desktop run the idle guard refuses
('the Mac was used 14 s ago'); a reset while you hold the desktop means a person, so stop then.

Every run - A (the hold), B (the release), the fallback press - is `cli.mjs run --env macos-desktop --model scripted`
in a child process, with CU_HOME set to the private home and `--held-marker` under it. The helper's peer check accepts
only the compiled entry points (PeerCheck.swift, D-029 a, design 0.3.3), so a run started from the check's own process
would be refused before its hello; the check widens nothing.

## Before anything is started (each refuses, exit 2, nothing posted)

| Guard | How |
|---|---|
| Not near step 4 | `--step4-at <ISO>` more than 30 minutes away, before or after; without it, `--no-step4-booked` is required |
| Owner away | IOHIDSystem `HIDIdleTime` of at least 300 s (a read: no input, no capture) |
| Shift up now | the session flags read below |
| Private home | `--cu-home` absolute and not the owner's `~/.computer-use`; no marker already in it |
| Right code | the installed helper 0.2.31 or later (its `Info.plist`, read with `plutil`), and `hold_key` in the driver's action list (#206 on main) |
| CU Fixture shown | the check builds and launches CU Fixture visible with its input recorder open (the driver launches no app, and a run captures only its apps' windows), and refuses if it has no window on screen (CGWindowList: owner pids and layers only); it stays open through run B and the fallback and is closed on every way out |
| An alert reaches a person | `--alert-roster <TEAM.yaml>` and the inbox tool (`--inbox`, default `DEFAULT_INBOX` in [g1-held-keys.mjs](g1-held-keys.mjs): the team's shared `session-inbox.py` under the home directory) both present |
| The installed helper | the owner's installed, signed `CUHelper.app` linked (a symlink, never a copy) into the private home; refused if there is none |
| The owner's consent | a copy of the owner's own `tty` 'always' record for CU Fixture, read only from their store; refused if there is none (nothing is granted here: D-033, D-038) |

The marker is kept under the private home: both runs are launched with `heldMarkerPath`, which the driver passes as
`--held-marker`. The owner's `~/.computer-use/helper/held-keys.json`, where a live helper keeps it by default, is
never read or written by the check. (The production default stays the owner's home: held keys are session-wide, and
any next helper must find the marker.)

## Rehearsal first

`--rehearse` does everything above and run A on the real Mac: it reads the marker, the verified peer and the `ps`
path, and reports whether it would kill (`rehearsal.wouldKill`, and the refusal if not). Then it kills nothing; the
5 s hold ends by itself, the flags are read, and the fallback runs only if Shift is still down. Verdict `rehearsed`
(exit 0) when the identity holds; no run B.

## The steps

1. Run A (agent core, scripted): `hold_key` `SHIFT` for 5 s on CU Fixture. The hold is seen when the marker names a
   pid.
2. About 1 s into the hold, kill -9 run A's helper, only when all of these hold, re-read immediately before the kill
   (the only await between the reads and the kill is the `ps` call): the marker names a pid; `ps` answers for that
   very pid; its `comm` equals the real path of the installed bundle's executable, compared whole; the value right
   after `--socket` in its command line, a whole argument, starts with `realpath(<cu-home>)/run/`, the check's own
   socket directory; and run A has neither ended nor reported `local_input`. The driver in the CLI refuses an
   unverified helper (`peerCheck: require`), so a run that reached its hold has a verified helper, and the socket
   argument ties that pid to this check. Never by name; any mismatch means no kill, no second run, and an inconclusive
   result.
3. Read the session flags right after the kill: Shift must be DOWN. If it is not, the hazard was not reproduced and the
   result is inconclusive, never a pass.
4. Run B (scripted, waits only) starts as soon as run A's CLI has exited (it holds the run lock; run A is ended for
   it after 2 s), and Shift is watched from the kill on. Run B's helper has started when the marker is rewritten
   `released` (or already gone). Expected: Shift up within 4 s of the kill; the marker gone after run B.
5. Fallback: if Shift is still down 3 s after run B's helper started, or 5 s after the kill whatever run B is doing,
   the check ends run B (it holds the run lock) and starts a fallback run that presses Shift once; that run's helper
   start also releases what the marker names. It watches Shift for up to 8 s, then reads it again. A probe cannot
   release it without the grant, so this goes through a helper. If the press is refused or Shift is still
   down, it stops and alerts: on stderr and as an urgent inbox message from the running seat to cu-coordinator,
   "press and release Shift once on the Mac" (exit 4). If even the inbox send fails, stderr says so. Shift stays
   down at most about 1 s + 5 s + the fallback helper's start (a few seconds), so under 10 s typically; if the
   fallback helper is slow, the alert comes at the latest about 14 s after the hold began.
6. Local input at any point before the kill stops the check: no kill, no second run. The driver's own local-input stop
   ends the hold; the flags are read, and the fallback runs only if Shift is still down. After the kill, run B still
   runs, because it is the release.

## What passes

All of these: Shift DOWN after the kill; Shift up through run B's release within the bounds; the marker gone after
run B; and the agent-core record (cu-developer-one's checks, names only):

- run A's events: the `hold_key` action `failed`, `helper_lost`, `heldAtLoss` `{keys: ['SHIFT'], buttons: []}`, its
  notice naming SHIFT as perhaps still down; and that notice printed;
- run B's events: `released_stale` with keys `['SHIFT']`, buttons `[]`, posted 1 (0: released at A's own start,
  reported later), and its notice printed.

Verdicts and exits: `pass` 0, `fail` 1, `refused` 2, `inconclusive` or `aborted` 3, Shift left down 4 (the alert).

## What it records

A JSON report (`--report`, default `<cu-home>/g1-report.json`, mode 600, also printed): every flags read with its time
and label, marker states, the two pids and the executable path, run ids, timings (hold seen, kill, run B up, Shift
up), the reasons. No screenshots beyond what the runs take of CU Fixture.

## Running it (cu-verifier)

Preconditions: 0.2.31 installed with its post-install check passed, #221 and #206 on main, step 4's slot clear.
Announce, hold, run:

```
node _environments_/macos-desktop/run-lock.mjs hold --seat cu-verifier --minutes 10 --reason 'G1 live check' --wait-free 60
node _tools_/desktop-checks/g1-held-keys.mjs --rehearse --seat cu-verifier --cu-home /tmp/cu-g1-<stamp>/home --alert-roster <TEAM.yaml> --step4-at <ISO>
node _tools_/desktop-checks/g1-held-keys.mjs --seat cu-verifier --cu-home /tmp/cu-g1-<stamp2>/home --alert-roster <TEAM.yaml> --step4-at <ISO>
```

Then release the hold and tell cu-coordinator the verdict. Exit 4 means a person must press and release Shift once
now.

## Review map

| Requirement | Where | Pinned by |
|---|---|---|
| Kill identity (marker pid, ps pid, comm whole, `--socket` a whole argument under the check's run dir; run A not ended, no local input; all re-read before the kill) | `killRefusal`, step 2 | the kill-identity, re-read and mid-hold local-input tests |
| Runs through an entry point the helper accepts | `startCliRun`, `cliArgs`, `childEnv` | the CLI-run test |
| Shift DOWN after the kill, else inconclusive | step 3, verdict | the inconclusive test |
| Failed fallback stops and alerts with the human fix | `fallback` | the run-B and hang tests |
| Bound from the kill even if run B hangs | the release loop, `FALLBACK_AFTER_KILL_MS` | the hang test |
| Idle gate, step-4 booking, private home | step 0 | the guards test |
| Local input aborts (no kill, no second run) | `abortA` | the local-input test |
| Old helper or no `hold_key` refused before any hold | the launcher | the refusal test |
| Alert reaches a person (inbox to cu-coordinator) | `alertRouteProblem`, `sendAlert` | the route and alert tests |
| Owner's consent copied, never granted; helper linked | `copyApprovals`, `linkHelper` (desktop-proof's) | the consent test |
| `--rehearse`: no kill, no run B, identity reported | the rehearse branch | the rehearse test |
