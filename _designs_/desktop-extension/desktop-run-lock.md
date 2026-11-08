---
title: Desktop-run lock
created: 2026-11-02T09:53:32Z
modified: 2026-11-08T16:07:00Z
level: L1
version: 0.6.0
description: One desktop run team-wide on the shared Mac (D-024, D-028) - the lock in /tmp/cu-desktop-run, its refusal that names the holder but never the pid, stale takeover, and why desktop runs need a seat.
status: unverified
grounded_in:
  - source: _context_/team-operations/decision-log.yaml (D-024, D-028)
  - source: _environments_/macos-desktop/run-lock.mjs
---

# Desktop-run lock

The Mac has one display, keyboard and pointer, so two desktop runs would click into each other's apps. One desktop
run at a time, team-wide (D-024; R90 and R91 in D-028). The desktop driver (`run-lock.mjs`, cu-developer-two) takes
the lock before it launches the helper.

| Part | Contract |
|---|---|
| place | `/tmp/cu-desktop-run`, a plain directory owned by this user; a symlink or another account's directory is refused |
| mutex | `mkdir .lock` inside it, atomic; retried for at most 10 seconds |
| entry | one `run.json`: `{seat, runId, pid, startedAt}`, written by exclusive create, removed on release and at process exit |
| refusal | a live entry refuses a second run `resource_refused`, reason `desktop_run_active`, naming the holder `{seat, runId, startedAt}` - never the pid, since the message reaches the model and the trajectory |
| stale | an entry whose pid is dead, or that does not parse, is stale and taken over |

## Seat

Desktop runs require a seat (`startRun({seat})`, `cli.mjs run --env macos-desktop --seat <seat>`), as browser runs
do; one without is refused before the driver starts.

## The hold and its sentinel

A check or step 4 is several runs in a row, so a seat holds the Mac first (CU-75, D-053): `run-lock.mjs hold --seat S
--minutes N [--reason R] [--wait-free SECONDS]` writes `hold.json` `{ seat, since, heldAt, until, reason }` (at most 30 minutes, a
seat's chain at most an hour: `since` is the chain's start, which a re-hold within the gap keeps; `heldAt` is this
hold's own start, CU-120), and `acquireDesktopRun` refuses other seats `desktop_held` while it is live. The order is
hold, then wait for an active run (`--wait-free`), then run - never check 'free' and then hold.

A fresh hold on this Mac's lock refuses after local input in the last 300 s, since the owner may be at it
(`owner_active`), or when `ioreg`'s `HIDIdleTime` is unreadable (`owner_idle_unknown`), logging it (CU-191).
Extensions are exempt: the helper's input resets that counter. Scratch locks are unchecked; no switch disables it.

Code older than 010dd7b52 never reads `hold.json`, so the CLI's hold also starts a keeper (CU-106) that keeps a
sentinel `{ seat, runId: 'hold', pid: keeper, sentinel: true }` in `run.json` while the hold is live, which older code
refuses as an active run. The holder's runs swap it out and back by one rename each, so `run.json` never lacks a live
entry; the keeper removes the sentinel when the hold ends, is released or is replaced. A killed keeper leaves the hold
binding new code only. Every hold, swap and sentinel change is a line of `hold.log`.

A waiting phase 2 goes first (D-073, CU-276): `run-lock.mjs wait --seat S` registers `waiting.json` `{ seat, pid,
since }` while its process lives (at most 30 minutes), and another seat's fresh hold, re-hold or extension is then
refused `phase2_waiting`; the live hold is never cut short.

## Known gap

A killed run leaves its entry behind until its pid is dead. If macOS reuses that pid for another process, the dead
run's lock stays alive and blocks every desktop run until someone clears it.
