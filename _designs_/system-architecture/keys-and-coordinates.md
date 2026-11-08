---
title: Key names, modifiers and coordinate spaces
created: 2026-11-01T09:24:10Z
modified: 2026-11-05T16:23:12Z
level: L1
version: 0.4.1
description: The canonical key names and their aliases, who normalises and who maps them to input events, how held modifiers behave, and the frame and viewport coordinate spaces.
status: unverified
grounded_in:
  - source: _context_/chatgpt-computer-use/api-action-handling.md@1.0.0
  - source: _context_/chatgpt-computer-use/comparison-anthropic-tool.md@1.0.0
  - source: _team_members_/cu-developer-two/headless-chrome-measurements.md@1.1.0
---

# Key names, modifiers and coordinates

## Canonical keys

`agent-core` normalises every key name, case-insensitively, to one canonical upper-case name during validation;
the Claude adapter first splits xdotool chords such as `ctrl+shift+t` with `parseKeyCombo`. Drivers receive
canonical names only and map them to their input system, including editing commands where a platform needs them
(macOS `META+A` is `selectAll`). `agent-core/lib.mjs` exports `CANONICAL_KEYS`, `normalizeKey` and
`parseKeyCombo`; a driver's suite proves its table covers every canonical name (R15).

| Canonical | Aliases accepted |
|---|---|
| `ENTER` | `RETURN` |
| `ESCAPE` | `ESC` |
| `TAB`, `SPACE`, `BACKSPACE`, `INSERT` | - |
| `DELETE` | `DEL` |
| `HOME`, `END`, `PAGEUP`, `PAGEDOWN` | `PAGE_UP`, `PAGE_DOWN` |
| `ARROWUP`, `ARROWDOWN`, `ARROWLEFT`, `ARROWRIGHT` | `UP`, `DOWN`, `LEFT`, `RIGHT` |
| `CTRL` | `CONTROL` |
| `SHIFT` | - |
| `ALT` | `OPTION` |
| `META` | `CMD`, `COMMAND`, `SUPER`, `WIN` |
| `F1` to `F12` | - |
| one printable character (`A`, `1`, `/`) | lower case is the same key |

Anything else is `unsupported_key`, never dropped.

## Modifiers

- `keypress` presses its keys in order and releases them in reverse: `["CTRL", "A"]` is one chord.
- `keys` on `click`, `double_click`, `triple_click`, `drag`, `move` and `scroll` are held for that action only,
  then released, even when the action fails (R16).
- `type` inserts text into the focused control; a newline becomes `ENTER` and a tab `TAB`, nothing else is
  interpreted.
- Browser chords: `CTRL` or `META` with `A`, `Z`, `Y` carry editing commands; `F5`, `CTRL+R` or `META+R` reload;
  `ALT+ARROWLEFT`, `ALT+ARROWRIGHT`, `META+[`, `META+]` go back or forward; `CTRL` or `META` with `L`, `T`, `N`, `W`, `Q`
  are `unsupported_action` with a message naming `navigate`; copy, cut and paste use the per-run clipboard
  ([environment-behaviour](environment-behaviour.md)).

## Coordinate spaces

- **Frame pixels** are the pixels of the screenshot the model saw. Models, adapters, the loop, policy and the
  trajectory use frame pixels only.
- **Viewport pixels** are CSS pixels at device scale factor 1 (R10); default viewport 1440x900 (R9).
- The environment owns the frame (at most scale 1, fixed per run): it captures with `clip.scale`, so no image is
  resized in Node, and maps every pointer coordinate and scroll delta per axis in `perform`, multiplying by
  `viewport.width / frame.width` and `viewport.height / frame.height` of the image Chrome actually returned, since
  Chrome rounds sizes at fractional scales.
- The launcher passes the adapter's `maxImage` as `frame`; the trajectory header records the resulting `scale`.
  Claude on the gateway takes 1440x900 at scale 1 ([adapters](model-adapters.md)).
- A `zoom` image shows its region at full resolution; later coordinates stay in the full frame.
- Validation refuses points outside `[0, frame.width) x [0, frame.height)`; nothing is clamped.

The perception check clicks odd-numbered pixels at scale 1 and 0.75 and reads the hits from the fixture page.
