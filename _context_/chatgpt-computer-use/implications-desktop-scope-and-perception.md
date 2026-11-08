---
title: Requirements for our desktop computer use, app scope, perception and helper identity
created: 2026-11-02T08:52:32Z
modified: 2026-11-02T08:52:32Z
level: L1
version: 1.0.0
description: Requirements R63 to R78 for the app scope, screen perception and helper identity of computer use on native macOS, app-scoped, as re-scoped by D-024
status: unverified
grounded_in:
  - source: learn.chatgpt.com/docs/computer-use (fetched 2026-11-02)
  - source: support.claude.com/en/articles/14128542-let-claude-use-your-computer-in-cowork (fetched 2026-11-02)
  - source: code.claude.com/docs/en/desktop (fetched 2026-11-02)
  - source: developer.apple.com/documentation/screencapturekit/sccontentfilter (fetched 2026-11-02)
  - source: developer.apple.com/documentation/technotes/tn3127-inside-code-signing-requirements (fetched 2026-11-02)
  - source: platform.claude.com/docs/en/build-with-claude/vision (fetched 2026-11-02)
  - source: ULTIMATE_GOAL.md (2.0)
  - source: _context_/team-operations/decision-log.yaml (D-024, D-025)
  - source: _context_/desktop-computer-use/macos-capture-and-input.md
  - source: _context_/desktop-computer-use/macos-identity-and-background.md
  - source: _context_/desktop-computer-use/mechanics-sources.yaml
  - source: _context_/desktop-computer-use/computer-vs-browser-use-sources.yaml
---

# Requirements, desktop scope, perception and identity

Levels as in [environment and perception](implications-environment-and-perception.md), plus **MAY**, an allowed
option. Continues in [action and safety](implications-desktop-action-and-safety.md).

## App scope

| ID | Level | Requirement | From |
|---|---|---|---|
| R63 | MUST | Act and capture only in apps the owner approved by bundle ID, once or always, revocable at the next action | [D-024], [cu] |
| R64 | MUST | Never capture or operate, whatever is approved: terminals and code runners (Script Editor, Automator, Shortcuts), DSH, ChatGPT, our live view (by window, in any browser), password managers, System Settings (whole), OS authentication and security prompts | [D-024], [D-025] |
| R65 | MUST | Check scope and exclusions at each action against the frontmost app, the app under the point and the focused element; an app a click opens is unapproved; hand an excluded front app to the person | [cow], [vs] |
| R66 | MUST | Never read or write the system pasteboard; refuse copy, cut and paste chords until the owner allows them | [D-025] |
| R67 | SHOULD | Give approvable apps that run code, such as IDEs, at most click-only access | [ccd], [D-025] |

## Perception

| ID | Level | Requirement | From |
|---|---|---|---|
| R68 | MUST | Capture only through a ScreenCaptureKit filter that includes approved apps' windows and excepts our own and excluded ones; never `CGWindowListCreateImage` (alerts) or `NSWindow.sharingType` | [SCK-filter], [macOS15-RN], [capture] |
| R69 | MUST | One `SCScreenshotManager` still per step, cursor hidden; a minimised or closed target window is a named error, not a black frame | [SCK-shot], [WWDC22-10155] |
| R70 | MUST | Capture at point size (`.nominal`) or the largest scale within the gateway budget (2,576 px long edge, 4,784 tokens), which rejects rather than shrinks | [Claude-vision], [probe] |
| R71 | MUST | Map image pixels to global points (origin at the main display's top-left) per axis, `x_pt = origin_x + x_img/(s·backingScale)`; prove clicks land within one point at scales 1 and 2 | [capture], [goal] |
| R72 | MUST | Locate the target's display from its window bounds, never cache screens, and end the run when displays change, never remapping silently | [CGDirectDisplay.h], [NSScreen-screens] |
| R73 | MAY | Capture one window, occluded content included, only with input that reaches it without the pointer | [WWDC22-10155] |

## Identity and permissions

| ID | Level | Requirement | From |
|---|---|---|---|
| R74 | MUST | One helper `.app` (bundle ID, `LSUIElement`, `NSScreenCaptureUsageDescription`) alone holds Screen Recording and Accessibility, plus Input Monitoring only if the pause proves to need it | [identity], [D-025] |
| R75 | MUST | Sign it with a stable identity so its designated requirement survives rebuilds; an ad hoc requirement is the cdhash, so grant nothing while ad hoc | [TN3127], [probe] |
| R76 | MUST | Launch it through LaunchServices, never as a child of node or a shell, which TCC charges to their host | [ES-responsible], [identity] |
| R77 | MUST | Raise no TCC prompt without the owner: preflight only, answer `not_granted`, and attempt no capture, post, event tap or `tccutil reset` before the single owner request is granted | [WWDC19-701], [D-025] |
| R78 | SHOULD | Measure whether macOS 27 re-confirms Screen Recording (reported monthly, raised by capture itself); name it in the owner request; a lapsed grant ends the run | [9to5Mac], [tinyapps] |

[goal]: ../../ULTIMATE_GOAL.md
[D-024]: ../team-operations/decision-log.yaml
[D-025]: ../team-operations/decision-log.yaml
[vs]: ../desktop-computer-use/computer-vs-browser-use.md
[capture]: ../desktop-computer-use/macos-capture-and-input.md
[identity]: ../desktop-computer-use/macos-identity-and-background.md
[probe]: ../desktop-computer-use/probe-results-2026-11-02.json
[cu]: https://learn.chatgpt.com/docs/computer-use
[cow]: https://support.claude.com/en/articles/14128542-let-claude-use-your-computer-in-cowork
[ccd]: https://code.claude.com/docs/en/desktop
[SCK-filter]: https://developer.apple.com/documentation/screencapturekit/sccontentfilter
[SCK-shot]: https://developer.apple.com/documentation/screencapturekit/scscreenshotmanager
[macOS15-RN]: https://developer.apple.com/documentation/macos-release-notes/macos-15-release-notes
[WWDC22-10155]: https://developer.apple.com/videos/play/wwdc2022/10155/
[Claude-vision]: https://platform.claude.com/docs/en/build-with-claude/vision
[CGDirectDisplay.h]: /Library/Developer/CommandLineTools/SDKs/MacOSX.sdk/System/Library/Frameworks/CoreGraphics.framework/Headers/CGDirectDisplay.h
[NSScreen-screens]: https://developer.apple.com/documentation/appkit/nsscreen/screens
[TN3127]: https://developer.apple.com/documentation/technotes/tn3127-inside-code-signing-requirements
[ES-responsible]: https://developer.apple.com/documentation/endpointsecurity/es_process_t/responsible_audit_token
[WWDC19-701]: https://developer.apple.com/videos/play/wwdc2019/701/
[9to5Mac]: https://9to5mac.com/2024/08/14/macos-sequoia-screen-recording-prompt-monthly/
[tinyapps]: https://tinyapps.org/blog/202409180700_disable_sequoia_nag.html
