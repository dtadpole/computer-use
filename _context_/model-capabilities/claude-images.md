---
title: Screenshots for Claude through the Conclave gateway
created: 2026-11-01T09:32:00Z
modified: 2026-11-01T09:32:00Z
level: L1
version: 1.0.0
description: The image sizes and counts the gateway's Claude models accept in computer-use tool results, what a screenshot costs, and how accurately the model clicks.
status: unverified
grounded_in:
  - source: 'gateway probes by cu-researcher, 2026-11-01 09.25-09.33 UTC (gateway-probe.py roundtrip and limits; screenshot-history and image-count probes)'
  - source: platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool (fetched 2026-11-01)
---

# Screenshots for Claude through the gateway

Measured on model-a; the round trips gave identical results on claude-sonnet-5-5. Test images were synthetic:
a form with a 220x70 blue SUBMIT and a grey CANCEL button, drawn in flat colours with a 5x7 pixel font.

## Size

| Image | In a toolset `tool_result` | In a user message |
|---|---|---|
| 1280x800 | Accepted | not tested |
| 2576x1449 (92 x 52 = 4,784 visual tokens) | Accepted | Accepted |
| 2600x1300 (long edge over 2,576) | 400, below | Accepted, silently downscaled |
| 2400x1800 (5,590 visual tokens) | 400, below | Accepted, silently downscaled |

The 400 reads `image dimensions 2600x1300 exceed the model's maximum image size (this model accepts at most 2576
pixels on the longer side and 4784 image tokens)`. This matches Anthropic: the toolset takes no display size and
the API does not downscale tool-result images [ant]. We must resize to a long edge of at most 2,576 px and
`ceil(w/28) x ceil(h/28) <= 4784`, then map coordinates back. **Inference:** never route a screenshot through a
user-message image to avoid the check; the silent downscale breaks the coordinate frame.

## Count

- 21 screenshots in `tool_result` history, the last 2100x1181: accepted, and its token count matched full
  resolution. Anthropic documents a stricter per-side limit above 20 images [ant]; it did not trigger here. Stay at
  or below 2,000 px per side anyway.
- 101 small images in one user message: accepted.

## Cost and accuracy

| Measure | Value |
|---|---|
| 1280x800 screenshot | about 1,430 input tokens (5,999 with it, 4,567 without) |
| 2576x1449 screenshot | about 4,880 input tokens (9,449 versus 4,567) |
| SUBMIT click, 1280x800 | (902, 610); true centre (903, 611) |
| SUBMIT click, 2576x1449 | (1706, 1077); true centre (1707, 1078) |

Coordinates came back in screenshot pixels, within one pixel of the centre, and the model read the button label at
both sizes. Real pages are harder; the fixture suite must measure accuracy there.

**Inference:** a 1280x800 or 1440x900 viewport at device scale factor 1 costs about 1,400 to 1,800 tokens a step and
needs no resizing. That matches both vendors' guidance
([actions](../chatgpt-computer-use/api-action-handling.md), [Anthropic tool](../chatgpt-computer-use/comparison-anthropic-tool.md)).

[ant]: https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool
