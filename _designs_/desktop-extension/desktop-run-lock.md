---
title: Desktop-run lock
created: 2026-11-02T09:53:32Z
modified: 2026-11-09T23:10:00Z
level: L1
version: 0.7.1
description: One desktop run team-wide on the shared Mac (D-024, D-028) - the lock in /tmp/cu-desktop-run, its refusal that names the holder but never the pid, stale takeover, why desktop runs need a seat, and the hold whose token says who may end it (CU-327).
status: unverified
grounded_in:
  - source: _context_/team-operations/decision-log.yaml (D-024, D-028)
  - source: _environments_/macos-desktop/run-lock.mjs
  - source: Linear CU-327 (a nested script's exit trap freed its seat's outer hold, 9 Nov)
  - source: Linear CU-341 (R1c's first window lost to Homebrew's node under _VOLTA_TOOL_RECURSION, 9 Nov); cu-coordinator 23:03Z
---

# Desktop-run lock

One desktop run at a time, team-wide (D-024; R90, R91 in D-028): the Mac has one display, keyboard and pointer. The
desktop driver takes the lock (`run-lock.mjs`) before it launches the helper.

| Part | Contract |
|---|---|
| place | `/tmp/cu-desktop-run`, a plain directory owned by this user; a symlink or another account's directory is refused |
| mutex | `mkdir .lock` inside it, atomic; retried for at most 10 seconds |
| entry | one `run.json`: `{seat, runId, pid, startedAt}`, written by exclusive create, removed on release and at process exit |
| refusal | a live entry refuses a second run `resource_refused`, reason `desktop_run_active`, naming the holder `{seat, runId, startedAt}`, never the pid (the message reaches the model) |
| stale | an entry whose pid is dead, or that does not parse, is stale and taken over |

## Seat

Desktop runs require a seat (`startRun({seat})`, `cli.mjs run --env macos-desktop --seat <seat>`), as browser runs
do; one without is refused before the driver starts.

## The hold and its sentinel

A check or step 4 is several runs in a row, so a seat holds the Mac first (CU-75, D-053): `run-lock.mjs hold --seat S
--minutes N [--reason R] [--wait-free SECONDS]` writes `hold.json` `{ seat, since, heldAt, until, reason, token }` (at most 30
minutes; a seat's chain, from `since`, at most an hour; `heldAt` is this hold's own start, CU-120), and
`acquireDesktopRun` refuses other seats `desktop_held` while it is live. The order is
hold, then wait for an active run (`--wait-free`), then run - never check 'free' and then hold.

A fresh hold on this Mac's lock refuses after local input in the last 300 s (`owner_active`) or when `HIDIdleTime` is
unreadable (`owner_idle_unknown`), CU-191; extensions are exempt, since the helper's input resets that counter.

For code older than 010dd7b52, which never reads `hold.json`, the CLI's hold starts a keeper (CU-106) keeping a
sentinel `{ seat, runId: 'hold', sentinel: true }` in `run.json` while the hold lives; the holder's runs swap it out
and back by one rename each. Every hold, swap and sentinel change is a line of `hold.log`.

A fresh hold prints its `token` (CU-327). The seat holding again with it extends the hold; without it the call nests,
gets its own token, and can neither shorten nor end the outer hold. `release --token` ends the hold with the holder's
token, only that nested holder with its own, and refuses any other; a tokenless release removes the newest nested
holder first, else ends the hold. So a nested script's exit trap frees only itself, and the minutes still run out.

A held script's driver must be the agent's own node: the helper's boundary admits only the Node.js Foundation's signed
binary. Under the harness, `_VOLTA_TOOL_RECURSION=1` makes `~/.volta/bin/node` pass through to the next node on PATH -
Homebrew's when `/opt/homebrew/bin` follows - which the helper refuses (`not a genuine node binary`) and the hold window
is lost. So a held script unsets `_VOLTA_TOOL_RECURSION`, puts `volta which node`'s folder first on PATH, and refuses to
start unless `process.execPath` is under `~/.volta/tools/image/node` (CU-341 R1c, 9 Nov).

A waiting phase 2 goes first (D-073, CU-276): `run-lock.mjs wait --seat S` registers `waiting.json` `{ seat, pid,
since }` while its process lives (at most 30 minutes), and another seat's fresh hold, re-hold or extension is then
refused `phase2_waiting`; the live hold is never cut short.

## Known gap

A killed run leaves its entry behind until its pid is dead. If macOS reuses that pid for another process, the dead
run's lock stays alive and blocks every desktop run until someone clears it.
