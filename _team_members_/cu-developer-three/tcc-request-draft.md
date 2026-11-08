---
title: Draft of the owner's single TCC request for CUHelper
created: 2026-11-02T09:50:00Z
modified: 2026-11-05T16:30:00Z
level: L1
version: 0.7.0
description: cu-developer-three's draft, for cu-coordinator to send, of the one owner request that grants Screen Recording and Accessibility to the helper app alone - what is granted, the signing choice, the exact steps and checks, what stays forbidden, and the residual risk.
status: unverified
grounded_in:
  - source: _context_/team-operations/decision-log.yaml (D-024, D-025, D-029, D-031)
  - source: dtadpole/computer-use _designs_/desktop-extension/helper-boundary.md@0.3.1
  - source: _context_/desktop-computer-use/tcc-request-questions.md@1.0.0
  - source: dtadpole/computer-use _environments_/macos-desktop/helper/INDEX.md@0.2.0
---

# Owner TCC request - draft for cu-coordinator

**Status (2026-11-05, D-031).** The owner chose option 1 (self-signed `CU Helper Signing`, cu-developer-three's signing
builds may use it through codesign after one Always Allow) and allowed copy, cut and paste in desktop runs.
cu-coordinator sent this request (0.5.0) on 2026-11-05 at 12:17 UTC.

The helper's boundary is on main: PR #184 (f9726ae3b - peer check, one-run lifetime, indicator, held-input release)
and PR #196 (9f6822d5b - design 0.3.3's entry list, peer environment screening, release on every exit path). The red
team confirmed B1 and B2 closed on 9f6822d5b, the blockers D-029 named. Still wanted before the request goes out:
cu-verifier's live boundary rerun (accepted driver and indicator, an announced run). The coordinator announces the
session as the one desktop run and holds the desktop-run lock for it.

## What is asked

| | |
|---|---|
| App | **CUHelper** - `~/.computer-use/helper/CUHelper.app`, bundle id `com.reflection.cu-helper` |
| Grants | **Screen & System Audio Recording** and **Accessibility** - nothing else |
| Not asked | Input Monitoring (the pause runs on the HID idle counter, D-025), Full Disk Access, Automation; nothing for Terminal, node, DSH or any browser |
| Signing | the owner's choice below - it decides whether the grant survives helper updates |

## The signing choice (Q-D2)

macOS keys the grant to the app's designated requirement. Ad hoc, that is the code hash, so every helper change
loses the grant (measured).

1. **Self-signed certificate, created once (recommended).** Keychain Access > Certificate Assistant > Create a
   Certificate: name `CU Helper Signing`, type *Code Signing*, self-signed root. The grant then survives rebuilds.
   The first build with it asks *codesign wants to sign using key "CU Helper Signing"*: choose **Always Allow**. This
   lets later builds by the helper's developer seat sign through codesign; the private key never leaves the keychain
   and no seat reads it. *Decided (D-031):* this option, and cu-developer-three may run the signing builds.
2. **Apple Development certificate**, if the owner has one: as 1, with that identity's name.
3. **Ad hoc.** No keychain step; after every helper change, re-grant (about twenty times through M9).

## Steps (about ten minutes, the owner at the Mac)

**On the Mac mini, not your own Mac.** The team, DSH and the helper run on the Mac mini (`the Mac mini`, user
`owner`, its one 1920x1080 display). Every step below - the certificate, `install.sh`, both switches and the app
approvals - happens there, in the `owner` GUI session, over Screen Sharing (`vnc://the Mac mini`). The certificate
goes into that user's login keychain on the Mac mini; one made on another Mac does not help. If `install.sh` stops at
codesign, it removes the half-built app (helper 0.2.7) and says what to fix; never grant a build whose designated
requirement is a `cdhash` when the certificate was meant.

0. Dismiss the system alert that has been frontmost since 2026-11-01 08:50 (UserNotificationCenter).
1. Install at the fixed path from a checkout of dtadpole/computer-use at the current `origin/main` (since the
   cutover, D-042; before it, a reflection worktree), e.g. `~/computer-use` - option 1: `CU_HELPER_IDENTITY="CU Helper Signing" bash
   ~/computer-use/_environments_/macos-desktop/helper/install.sh`
   (option 3: the same without `CU_HELPER_IDENTITY`). It builds `~/.computer-use/helper/CUHelper.app`, prints its
   designated requirement - a certificate leaf for option 1, a `cdhash` for option 3 - and says so if it changed
   since an earlier build (then earlier grants do not apply).
2. Before: the same command's self-test, run through LaunchServices as the driver runs it, prints
   `self-test: pass`, `launched by launchd: True` and all four grants off. Nothing is prompted.
3. System Settings > Privacy & Security > **Accessibility** > **+** > choose `~/.computer-use/helper/CUHelper.app` >
   on. Then **Screen & System Audio Recording** > **+** > the same app > on. Adding with **+** means the helper never
   has to ask.
4. After: `open -g -n -a ~/.computer-use/helper/CUHelper.app --args --selftest --out /tmp/cu-helper-after.json`
   (or `install.sh` again, which rebuilds the same code to the same requirement) - `screen`, `accessibility` and
   `postEvents` true, `listenEvents` false.
5. First capture, with the owner present: cu-coordinator starts one announced scripted run of agent core's `cli.mjs`
   on the CU Fixture app only, from a shell without `NODE_OPTIONS`, `NODE_PATH`, `DYLD_*` or `LD_*` (the helper
   refuses a driver started with them, and agent core says which to unset). macOS may show *CUHelper is requesting
   to bypass the system private window picker and directly access your screen* - choose **Allow**. If it returns
   later, a run pauses; the agent never answers it.
6. While any run uses the helper, a red **● Computer use active** panel shows at the top right of every display.
7. If a run does not start, `log show --last 10m --predicate 'subsystem == "com.reflection.cu-helper"'` shows the
   helper's start, its decision on the driver and why it ended (reason codes and pids only).

## Revoke at any time

Turn either switch off in System Settings, or `tccutil reset ScreenCapture com.reflection.cu-helper` and
`tccutil reset Accessibility com.reflection.cu-helper`; deleting the certificate ends signed updates.

## What stays forbidden after the grant

Synthetic input only to the team's fixture apps until the local-input pause and the exclusions are proven on them
(D-024); one announced desktop run at a time; terminals, password managers, System Settings, our own and other
agents' apps and OS authentication prompts are never in scope (D-025), in agent core and in the helper.

## Residual risk (helper-boundary.md)

The helper serves only a peer that is genuine Node.js running one of agent core's entry points from the owner's
reflection checkouts, with no code-loading options or environment, one run at a time, with the panel on screen. A
same-user process can still use a running helper by imitating that driver - running our own entry point, rewriting
its process title so its arguments look like ours, or attaching a debugger to the real driver (this Mac's node is
signed to allow that) - or by reading the run's token while it exists. The panel makes it
visible, the one-run lifetime keeps the window short, and cu-researcher red-teams the boundary. A per-run click in the
helper's own dialog is held as an owner option, because it would stop unattended evaluation runs.

## Measured after the grant (fixture app only)

Q-D1 (do our tagged posts move the HID idle counter), Q-D3 (`pid` mode), Q-D8 (does the capture alert recur on
macOS 27), the capture rate and AX hit-testing - reported by cu-developer-three in its records.
