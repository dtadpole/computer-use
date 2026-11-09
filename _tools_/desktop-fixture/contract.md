---
title: Desktop fixture contract
created: 2026-11-02T08:34:00Z
modified: 2026-11-09T12:55:00Z
level: L1
version: 0.13.0
description: What CU Fixture guarantees to the desktop driver, the verifiers and the evaluator - identity, placement, the private control channel, what the agent can and cannot see, and how a screen's outcome is judged.
status: unverified
grounded_in:
  - source: _context_/team-operations/decision-log.yaml (D-012, D-024)
---

# Desktop fixture contract

- **Identity.** CU Fixture (`ai.reflection.cu.fixture`) and CU Ledger (`ai.reflection.cu.ledger`, same executable,
  `--role ledger`), ad-hoc signed by `build.mjs`. Per-app approval names them; they are the only apps synthetic
  input may reach until the local-input pause lands (D-024).
- **Placement.** `--offscreen`: borderless windows at -30000, never shown, accessory policy. Self-tests use it;
  nothing appears on the owner's display. Without it the windows are titled and shown, for agent runs, hanging 20 pt
  below the top of the display's visible area (x from 120, CU Ledger from 800, 40 pt cascade), clear of a bottom overlay. A window that would open under another app's floating window
  (layer 1-19: alerts, panels) moves rightwards along its row, then lower rows, to the first free spot - never left of its
  default and never onto the other fixture app's windows; with no free spot it keeps its default.
- **Appearance.** Aqua, black on white, system fonts, so pixels are the same in light and dark mode.
- **Menus.** CU Fixture, Document and Log, then Edit (Cut, Copy, Paste, Paste and Match Style, Select All to the first responder), so
  copy and paste work by keyboard and the fixture's own titles keep their places.
  The menu-compose screen (CU-238) adds Message and Later while it is open: Send on Shift-Command-D, a disabled Mark
  as Read before Send Now on Option-Command-J (not Option-Command-D, macOS's Dock-hiding hotkey), Delete on a plain Backspace (enabled on the Outbox list only), and
  Send Later on Option-Command-L (not Shift-Command-L, the Search With Google service) in a lazily filled menu, plus a stand-in Services submenu in the app menu (an owner-style service and AppKit's
  'Services Settings…' marker, CU-250; not the real Services menu); each only records that it fired. A message preview (an AXGroup, neither entry nor list)
  takes the focus on a click; there Delete is enabled and a plain Backspace deletes the previewed message (Mail's viewer).
  The open-selection screen (CU-252, CU-269: the stand-in for Finder) adds File (Open on Command-O, Open With >
  Terminal / TextEdit) while open; its rows carry AXFilename and a /tmp sandbox AXURL (strings only, nothing on disk),
  Command-Down on the list opens, and two drop targets are titled Terminal.app and Payload.app - each open only records
  what it would have opened.
- **Named controls.** The named-controls screen (CU-245, CU-258, CU-261) builds up to six entries (`fields`) and six buttons
  (`buttons`) with the names the harness gives, each at most 60 characters: an entry carries its name as its label and
  title element; a button records only 'pressed' with its index; `areas` (CU-253) adds up to six multi-line text areas
  (AXTextArea) named the same way. Its state reports entry and area lengths (and area line counts), never their text.
- **AXManualAccessibility (CU-329).** The application element answers `AXManualAccessibility` as an Electron app does:
  no value until set, then the stored boolean; listed and settable. Every outside write is recorded in order (value
  only, event `manual-ax`); `manualAX` reports the value and the writes, `manualAXPreset {on}` sets true or clears it
  to no value without a write (the leave-alone case), `manualAXSelfTest` writes once in process and reads back.
- **Channel.** JSON lines on the launching process's stdin and stdout: `hello`, `reset`, `open {task, params}`,
  `state`, `act {step}`, `targets` (frames with each control's class), `windows` (content sizes and each content's top-left in global points), `screen` (the primary display's points and
  backing scale), `render {window,
  path}`, `ax` (the app's own accessibility elements, with a drawn list's rows as non-view children named by `title` and `parent` (CU-19), and its visible text), `trigger` (posts the overlay-late notification without a key, a test seam), `clipboardSave` / `clipboardRestore` (S5, CU-62: CU Fixture keeps the owner's pasteboard in memory for a run and writes it back, also when it quits; a concealed or transient board is not read and replies `{skipped: 'concealed'}`; replies carry counts only), `clipboardSelfTest` (the stash on a private pasteboard), `clipboardSentinel` / `clipboardSentinelClear` (CU-230: fixture text on an empty board this app may read without asking, for a paste with no own copy; cleared only if nothing else wrote since; booleans and counts only. Named limit: a copy landing in the microseconds between the last change-count check and the clear or write is not seen - the check narrows that window, it cannot close it) with `clipboardSentinelSelfTest` (its rules on a private pasteboard), `menuItemForKey` (the menu item a key equivalent reaches, title and action, nothing run), `sandboxAX` (CU-252: open-selection's selected rows as Accessibility shows them in process - role, AXFilename, AXURL), `menuAX` (CU-238: what AppKit serves Accessibility for menu-compose's own menus - title, enabled, key character, modifier bits, virtual key - read in process), `quit`. The Edit menu binds Cut, Copy, Paste, Paste and Match Style (Command-Option-Shift-V, CU-233; the payment screens record its plain-text paste as `paste`) and Select All. `windows` also reports each window's `alpha`, `level` and `clickThrough`. Closing stdin ends the app. Only the
  launcher holds it.
- **What the agent sees.** Only `params`: what a person would see. Expected values, judges and oracle plans stay
  in `tasks.mjs`.
- **Facts.** `state` returns the event log (press, edit, toggle, select, menu, dialog, drop, save and task
  events), the current values of named controls, and open windows. File tasks are judged from the sandbox directory
  itself, under `/tmp`; a task's `prepare` writes its files there before the screen opens. A secure field reports
  only `[secure, N chars]`; its value never leaves the app.
- **Input evidence.** A local event monitor logs every input event the app receives into `state.input`: kind,
  window and global points (top-left), the target under it, button, click count, scroll deltas, key code,
  characters, the focused field of a key event, modifiers, and the posting process's `pid` and synthetic `tag`
  (`eventSourceUserData`). It needs no grant. Screens `input-recorder` (odd-sized targets, a text field, mouse-moved on), `marker-standin` (sRGB
  #FF00FF, matched with red and blue above 230, green below 100) and `secure-marker` serve the desktop verifiers.
- **Oracle.** `act` performs a step on the app's own controls through the code a person's input reaches. It proves
  a screen completable and machine-checkable. It does not prove the OS path; agent runs do (M7).
- **Retina.** This Mac has one 1920x1080 display at scale 1. A 2x path must be shown with a simulated scale.

## Read next

[INDEX.md](INDEX.md).

A visible task window comes to the front when it opens, as a person sets up a run; offscreen windows never do.

**Owner-rule overlays (CU-14).** Screen `overlay` (open it in CU Ledger, role `ledger`): a borderless window over `x, y, width,
height` (global top-left points) with `alpha` (default 0.02), `level` (`floating` default, or `normal`), `clickThrough`
(default false: it takes the clicks) and `afterTrigger` with `delayMs`: hidden until CU Fixture receives the Insert key
(kVK_Help, 0x72; the agent's keypress `INSERT`), then shown `delayMs` later. The fact `overlay-shown` records when it appeared.

**Panel style (CU-39).** `export-file` and `open-file` take `panelStyle: 'window'` to show their save or open panel as its own
window (`begin`) instead of a sheet on the main window - the modal case of file panels, for the read-only marker check.
