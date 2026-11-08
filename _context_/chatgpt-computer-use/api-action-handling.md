---
title: Executing computer tool actions and scaling coordinates
created: 2026-11-01T09:15:00Z
modified: 2026-11-01T09:40:00Z
level: L1
version: 1.1.0
description: How the OpenAI recipes map emitted key names, buttons, drag paths, scroll deltas and modifiers to Playwright and xdotool, and how to keep coordinates aligned
status: unverified
grounded_in:
  - source: developers.openai.com/api/docs/guides/tools-computer-use-integration (fetched 2026-11-01)
  - source: developers.openai.com/api/docs/guides/tools-computer-use-sdk-drivers (fetched 2026-11-01)
  - source: developers.openai.com/api/docs/guides/tools-computer-use (fetched 2026-11-01)
  - source: docs.e2b.dev/agents/openai-computer-use (fetched 2026-11-01)
---

# Executing actions and scaling coordinates

## Key names

The model emits upper-case names such as `ARROWLEFT`. The table lists every name the JavaScript and Python
helpers map, matched exactly [int]:

| Emitted | Playwright | xdotool |
|---|---|---|
| `ENTER`, `RETURN` | `Enter` | `Return` |
| `ESC`, `ESCAPE` | `Escape` | `Escape` |
| `TAB` / `SPACE` / `BACKSPACE` | `Tab` / `Space` / `Backspace` | `Tab` / `space` / `BackSpace` |
| `DELETE`, `DEL` | `Delete` | `Delete` |
| `HOME` / `END` | `Home` / `End` | `Home` / `End` |
| `PAGEUP` / `PAGEDOWN` | `PageUp` / `PageDown` | `Page_Up` / `Page_Down` |
| `UP`, `ARROWUP` (likewise `DOWN`, `LEFT`, `RIGHT`) | `ArrowUp` | `Up` |
| `CTRL`, `CONTROL` | `Control` | `ctrl` |
| `SHIFT` | `Shift` | `shift` |
| `OPTION`, `ALT` | `Alt` | `alt` |
| `META`, `CMD`, `COMMAND` | `Meta` | `super` |
| anything else | unchanged | unchanged |

`keypress` joins the mapped keys with `+`, for example `["CTRL","A"]` [int].

Variants:
- The guide's Java xdotool loop upper-cases names first. It maps only the modifiers, `ENTER`/`RETURN`, `TAB`,
  `ESC`/`ESCAPE`, `BACKSPACE`, `DELETE` and `ARROW*`, passes single letters and digits, and otherwise throws
  "Unsupported key" (for example on `SPACE` or `PAGEUP`) [int].
- E2B maps only `ARROW*` and `PAGEUP`/`PAGEDOWN` [e2b].

## Pointer details

| Concern | Recipe | Source |
|---|---|---|
| Buttons | Playwright: `left`, `right`, `wheel`→`middle`; default `left`; `back`/`forward` throw. X11: `left` 1, `wheel` 2, `right` 3, `back` 8, `forward` 9 | [int] |
| Drag | The JS helper accepts `[x, y]` or `{x, y}` points. Fewer than two points throws. Move to the first point, press, move through the rest, release | [int] |
| Scroll | Playwright: move, then `mouse.wheel(scroll_x, scroll_y)`. X11: `max(1, abs(round(delta / 100)))` clicks for each non-zero axis. `scroll_y` uses button 4 when negative and 5 when positive; `scroll_x` uses 6/7. Java caps this at 100 clicks | [int] |
| Scroll, E2B | `max(1, floor(abs(scroll_y) / 100))` steps, vertical only; `scroll_x` raises | [e2b] |
| Modifiers | `keys` on `click`, `double_click`, `drag`, `move`, `scroll`: key-down in order, act, key-up in reverse (`finally`). The basic handlers reject `keys` | [int] |
| Wait | No duration field. JS and Python handlers wait 2 s; the Java skeleton and E2B wait 1 s | [int], [e2b] |
| Unsupported input | Raise: "do not silently ignore unsupported input" | [drv] |

## Coordinates and screenshots

- Capture a PNG (`page.screenshot({ type: "png" })` or `import -window root png:-`). Send it with
  `detail: "original"`; avoid `high` and `low` [int].
- `original` can still resize oversize images. For patch-based inputs, a screenshot still over the 30,000-patch
  limit after resizing is rejected, not shrunk [int].
- Remap recipe:
  - If the image is too costly or too large, downscale it before sending. When scaling down, OpenAI observes
    strong performance at 1440×900 and 1600×900 [int].
  - For an 800×600 screenshot of a 1600×1200 display, "double both returned coordinates". For a crop, "add
    the crop's offset after scaling" [drv].
  - **Inference:** in general, `x_env = x_img × W_captured / W_img + crop_x`, and likewise for y.
- Browser-driver pointer methods use CSS pixels of the full visible page [drv].
- Recipe sizes: 1280×800 for Docker Xvfb [int] and E2B [e2b]; 1280×720 for local Playwright [int]; 1024×768 for
  the SDK first task [tcu]. For code execution, the tool description says "The context viewport is 1440x900"
  [tcu], and the runtime guide says to set it [int].

**Inference:** on a Retina display, capture at scale factor 1 or halve the coordinates
([comparison](comparison-anthropic-tool.md)).

[int]: https://developers.openai.com/api/docs/guides/tools-computer-use-integration
[drv]: https://developers.openai.com/api/docs/guides/tools-computer-use-sdk-drivers
[tcu]: https://developers.openai.com/api/docs/guides/tools-computer-use
[e2b]: https://docs.e2b.dev/agents/openai-computer-use
