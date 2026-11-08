---
title: OpenAI SDK BrowserToolset driver contract
created: 2026-11-01T09:17:00Z
modified: 2026-11-01T09:35:50Z
level: L1
version: 1.1.0
description: The structured browser-driver alternative to screenshots, with its member methods, confirmation and URL policy, page-read format and file grants
status: unverified
grounded_in:
  - source: developers.openai.com/api/docs/guides/tools-computer-use-sdk-drivers (fetched 2026-11-01)
  - source: developers.openai.com/api/docs/guides/tools-computer-use (fetched 2026-11-01)
  - source: docs.browser-use.com/open-source/customize/integrations/openai (fetched 2026-11-01)
---

# SDK BrowserToolset driver contract

Imports: Node `BrowserToolset` from `openai/helpers/browser` and `ResponsesToolRunner` from
`openai/helpers/responses-tool-runner`; Python `AsyncBrowserToolset` (`openai.lib.browser`) and
`AsyncResponsesToolRunner` (`openai.lib.responses_tool_runner`), plus synchronous variants [tcu], [drv]. Chosen
operations become function tools [tcu]: mostly text and controls, though the default `screenshot` and `zoom`
return images [drv].

## Members

| Group | Methods | Confirmation [drv] |
|---|---|---|
| Default reads | `read_page`, `get_page_text`, `find`, `wait_for`, `screenshot`, `zoom`, `list_tabs` | No |
| Default changes | `click`, `type`, `key`, `scroll`, `scroll_to`, `select_option`, `hover`, `switch_tab`, `close_tab` | Yes |
| Default navigation | `navigate`, `new_tab` | Yes plus URL policy |
| Opt-in pointer | `read_page_scoped`, `click_at`, `drag_path`, `hold_keys`, `hover_at`, `set_checked` | Yes except scoped read |
| Opt-in powerful | `read_diagnostics`, `run_script`, `upload_file`, `download_file` | Always `confirm` |

Select with `members` or `additionalMembers`; enabling all gives 28 tools [drv], [bu].

## Driver interface

Implement `state()` plus only the exposed operations; each receives one validated argument object, with explicit
`null` for an absent tab or target [drv]. `state()` reports tabs `{ id, title, url, active }` with origin-only URLs
and feeds `list_tabs`; V1 titles truncate at 1,024 bytes with `title_truncated`; a failed required state read
stops the run [drv]. Operations can take `{ signal }` (Node) or `cancelled` (Python) [drv].

## Callbacks

- `confirm` receives a detached `{ member, arguments, state, call_id }`; only exactly true approves [drv].
- `urlPolicy` / `url_policy` runs before `confirm`; compare parsed protocol, host, port, never prefixes; it
  cannot stop redirects, popups or embedded resources, so enforce network policy too [drv].
- `confirmReads` gates private reads with `phase: "before_read"` [drv].
- For target-bound consent, disable `key` and refuse null-target `type`; both use focus [drv].

## Read format

`BrowserReadV1` holds `version: 1`, visible `text`, `elements` with unique `ref`, `label` and a role
(`button`, `textbox`, `combobox`, `checkbox`, `radio`, `slider`, `listbox`), and `omitted` coverage codes [drv].
Values appear only where the application allows; recheck refs after approval; refs and labels cap at 256 bytes,
values at 512, with no SDK limit on elements or page size [drv].

## Other contracts

- `zoom` takes `region` `[left, top, right, bottom]`; later coordinates keep the full visible area [drv].
- `click_at` and `drag_path` use CSS pixels; `drag_path` takes 2–100 points; `click_count` is 1–3; modifier
  `keys` are `Control`, `Alt`, `Meta`, `Shift`; `hold_keys` holds 1–8 keys for 1–3,000 ms [drv].
- `wait_for` text is at most 256 bytes, timeout 1–30,000 ms [drv].
- Files move only by caller-issued `grant_id`, approved and permitted once by the file owner; return exactly
  `version: 1`, `status`, `effect`, `cleanup`; only `completed` sets `ok` true [drv].
- `run_script` runs with page privileges; use a credential-free session [drv].
- Throw `BrowserError` with model-safe text for recoverable faults; other errors become generic; invalid results
  or state stop the run [drv].

The booking demo lets you "watch the browser, take control, return control, or stop" [tcu].

[tcu]: https://developers.openai.com/api/docs/guides/tools-computer-use
[drv]: https://developers.openai.com/api/docs/guides/tools-computer-use-sdk-drivers
[bu]: https://docs.browser-use.com/open-source/customize/integrations/openai
