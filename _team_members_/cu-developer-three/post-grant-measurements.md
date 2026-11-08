---
title: Helper measurements - before and after the owner's grant
created: 2026-11-02T10:35:00Z
modified: 2026-11-05T16:30:00Z
level: L1
version: 0.7.0
description: What cu-developer-three has measured of CUHelper without a grant, and the plan for the fixture-app-only measurements after it - each question, how it is driven through a listed driver entry, what decides it, and what changes in the helper on each answer.
status: unverified
grounded_in:
  - source: dtadpole/computer-use _designs_/desktop-extension/open-questions.md
  - source: dtadpole/computer-use _designs_/desktop-extension/helper-boundary.md@0.3.5
  - source: dtadpole/computer-use _verifiers_/desktop-fixture/claims.md
  - source: _team_members_/cu-verifier/post-grant-acceptance.md@0.1.1
  - source: _context_/team-operations/decision-log.yaml (D-031)
  - source: dtadpole/computer-use _environments_/macos-desktop/helper/INDEX.md
---

# Helper measurements

## Measured without a grant (2026-11-02, no prompt)

| What | Result |
|---|---|
| LaunchServices launch, `open -g -n -a CUHelper.app --args --selftest --out <file>` | `selftest: pass`, 38 checks, 0 capability calls; running bundle id `com.reflection.cu-helper`; `launchedByLaunchd: true`; all four preflights false - the helper's own TCC identity, not the launcher's |
| The same launch serving a socket (`--simulate-ungranted`) | connected in about 0.1 s; hello with the token; `capture` -> `not_granted`; exit on `bye`; the token file beside the socket was gone once read |
| Symbols | no `CGRequest*`, `IOHIDRequestAccess`, `AXIsProcessTrustedWithOptions`, `CGWindowListCopyWindowInfo` or pasteboard symbol linked (checked by `nm` in the suite) |

## Measured at the grant (2026-11-05, the Mac mini)

| What | Result |
|---|---|
| Install | two attempts stopped at codesign (12:47 and 12:59 UTC: the certificate was not yet in the owner login keychain, then `errSecInternalComponent`, the key prompt unreachable from SSH); 0.2.7 removed the half-built bundle the second time. The owner's install from the Mac mini's own Terminal at 13:35 UTC: helper 0.2.8, designated requirement `identifier "com.reflection.cu-helper" and certificate leaf = H"9ca48e086"`, hardened runtime, self-test 38/38 with 0 capability calls, all grants off |
| Grant | the owner turned both switches on by hand (D-033, 13:44 UTC); cu-coordinator's self-test then: `screen`, `accessibility`, `postEvents` and `listenEvents` all true. `listenEvents` reads true with Accessibility alone, without Input Monitoring - so on this macOS the tap could even run listen-only; the helper still takes the active pass-through tap under Accessibility |
| Display | from 13:42 UTC a Dell S3225QC: 5120x2880 pixels, 2560x1440 points, scale 2, wide gamut; at 14:16 UTC NSScreen reported 1920x1080 points at scale 1 again. Helper 0.2.8 passed ScreenCaptureKit's display-space image through; 0.2.10 (#534) asks for sRGB and colour-matches anything else |
| Q-D1: do our tagged posts reset the HID idle counter? | **yes.** cu-verifier's first live click (05:56:25 PT, helper 0.2.8) was the only HID input in a 20-minute window and the guard took it for a person's (local_input after the first action). On 0.2.10, which follows our posts (note before each post, 50 ms slack; #534), my three runs at 06:15:48, 06:16:22 and 06:16:43 were the only HID inputs and none stopped for local_input. Both `global` and `pid` posts reset the counter |
| Q-D3: `pid` vs `global` (CU Fixture input-recorder, scripted cli.mjs, frame 1920x1080, helper 0.2.10) | `global` (run 20261105T141547Z-f1ae26): completed in 6 steps; all four boxes and the text field hit at the planned points, each event logged by the fixture with window, target, the helper's pid and the CUSE tag. `pid` (run 20261105T141621Z-10bdf0, repeated once): completed in 6 steps and every event reached the fixture with the helper's pid and tag, the typed text arrived - but the mouse events had no window and no location, so no click landed on a control. Keyboard input by pid works; pointer input by pid does not. Reading: `global` for pointer actions, `pid` at most for keys (design revision: cu-developer-one) |
| Reinstall by this seat | 0.2.10 signed with the certificate from cu-developer-three's session (06:15 PT), and 0.2.12 at 06:51 PT under the desktop-run lock (run id reinstall-0.2.12): same designated requirement each time, the grant held - install.sh's self-test 38/38 with all four grants on |
| Q-D3 clean repeat | run 20261105T142310Z-e909a9, no other CU Fixture instance before, during or after: the same as the first pid runs (keys arrive, clicks have no window or point) - the overlap caveat is closed |
| Window owners, grant-free (06:38 PT) | CU Fixture (pid 5628) and CU Ledger (pid 5636), both executables named `cu-fixture`, Ledger's window on top: AppKit resolves each pid to its own bundle id and bundle path, and WindowServer (CGWindowList) names each window's true owner pid. The step-5 'leak' and the 'impersonation' turned out to be the always-approved CU Ledger joining the scope (cu-verifier's retraction); my reading that ScreenCaptureKit and the AX hit test misattribute same-named apps is withdrawn as unproven. With Ledger truly unapproved, 0.2.10 kept it black and refused the click |
| System overlays at every point (06:50 PT) | Notification Center (layer 21) and the Dock (layer 20) lie full-screen above every app window, and WindowServer owns the menu bar strip (layer 24), all with executables on /System. An owner-at-point rule that counted every window above the point would refuse every click; design 0.4.11 passes over such system overlays (layer >= 20, SIP volume - /System, /bin, /sbin, /usr but not /usr/local) unless the AX element at the point is the overlay's own (helper 0.2.13, reflection #583) |
| HID idle counter, passive (no grant) | logged every 2 s from 05:30 PT: the last input before then at about 04:58:25 PT; input from 05:34:55 with no `screensharingd` process visible (the owner was at the Mac mini) - the Screen Sharing half stays open until the owner works remotely again |

## After the grant - fixture apps only, under the desktop-run lock

The helper serves only a listed entry (helper-boundary.md 0.3.5), so every measurement is driven through agent
core's `cli.mjs` on CU Fixture (`ai.reflection.cu.fixture`) and CU Ledger. No measuring mode is added to the helper:
one that captured or posted without a driver would bypass the peer boundary. Evidence comes from the run's
trajectory, the helper's replies and events, the fixture's own facts log (F6: each input event at its landing
point, with the posting pid and tag) and the unified log.

To keep desktop runs few, most questions read the evidence of cu-verifier's runbook (post-grant-acceptance.md 0.1.1);
only the last two rows need a short run of their own, announced to cu-coordinator.

| Question | Evidence | Decides | On the answer |
|---|---|---|---|
| Install | the owner's `install.sh` output and the prompt-free self-test after the grant | designated requirement is a certificate leaf (D-031); `screen`, `accessibility`, `postEvents` true, `listenEvents` false | a cdhash requirement or a grant off: rebuild with `CU_HELPER_IDENTITY="CU Helper Signing"` and ask the owner to re-check the switch |
| Q-D8: does the Screen Recording alert recur on macOS 27? | the first capture with the owner present (TCC request step 5), then the runbook's later runs and a relaunch | whether the "bypass the private window picker" alert returns, and from which process | recurring: the run pauses on it (the agent never answers); document the interval for the owner |
| Q-D1: do our tagged posts reset the HID idle counter? | runbook step 1 (scripted suite, nobody at the Mac) | a `local_input` pause with no person present means yes | yes: build with `syntheticResetsIdle` on (the guard re-baselines after each post and only a later reset counts); no: keep the default |
| Capture rate and size | runbook steps 1-2 trajectories: step times, capture size and `inline` vs `path` | per-capture cost at the default size | tune the file threshold and the watch rate cap (5 fps) |
| AX hit test | runbook step 1: `hitTest` and `focused` over the fixture's named controls (F4, F10) | role, title, frame against the fixture's facts; `opaque`; secure fields never valued (F8) | fix any frame or role mismatch before M7's verdict |
| Screen Sharing input (the owner is remote, 2026-11-05) | the first armed run: the owner moves the pointer and presses a key over Screen Sharing (`vnc://the Mac mini`) | whether that input resets the HID idle counter and whether the tap sees it untagged (its posting pid in the event) | either one pauses the run (`local_input`); if neither does, a remote owner is not detected: say so to cu-coordinator before any unattended run, and look for another signal |
| Pass-through tap | runbook step 4 (the owner's key during an armed batch) | `localInput` via the tap with Accessibility alone; no Input Monitoring prompt | if the tap does not see keys, the idle counter stays the only guard and nothing changes for the owner |
| Menu bar (design 0.3.8) | runbook step 5 (marker window), plus step 1 captures with CU Fixture in front | the strip shows CU Fixture's own menu titles and nothing else | a title missing from the AX frames, or any status item visible, is a helper bug |
| The unified log | `log show --predicate 'subsystem == "com.reflection.cu-helper"'` after each runbook step | start, peer decision and end appear, nothing else | missing lines are a bug |
| The indicator under a target | own short run: a `hitTest` and a click at a fixture control placed under the indicator panel (top right) | whether Accessibility reports the click-through panel (the helper's own pid) instead of the app below | if it does, the per-step check refuses that point `out_of_scope`; then the panel moves into the menu bar's status area, which is never a target |
| Q-D3: `pid` vs `global` (cu-developer-two's question) | own short run, the same click and type plan in each mode | the fixture's facts: landing point, target, posting pid | if `pid` lands reliably, offer it for background windows; if not, `global` only. Needs a way to choose the mode: the environment takes `mode: 'pid'`, `cli.mjs` does not expose it yet |

Each result goes into this record with the run's trajectory id; a helper change it forces goes through a code pull
request to cu-integrator, and a rebuild signed with the same identity keeps the grant.
