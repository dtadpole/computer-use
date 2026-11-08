---
title: Desktop helper boundary claims
created: 2026-11-02T09:51:16Z
modified: 2026-11-02T10:15:38Z
level: L1
version: 0.4.0
description: What the desktop-helper-boundary verifier claims about CUHelper's D-029 peer boundary before the grant - impostors and code-loading drivers refused before a byte, a project driver accepted with an on-screen indicator, one helper at a time, no lingering without a driver.
status: unverified
grounded_in:
  - source: _designs_/desktop-extension/helper-boundary.md@0.3.2
  - source: _context_/team-operations/decision-log.yaml (D-029)
---

# Claims

| # | Claim | Mutant that must fail it |
|---|---|---|
| B1 | An impostor driver (a copy named like agent core's cli.mjs outside the project roots) is refused as 'not an allowed entry point': exit 3, no byte sent | peer-unchecked |
| B2 | A driver with code-loading options (--require) or environment (NODE_OPTIONS) is refused as 'loads other code' | peer-unchecked, flags-allowed |
| B3a | An in-project script that is not a listed entry point ([not-an-entry.mjs](not-an-entry.mjs)) is refused as 'not an allowed entry point'; judged only from a home checkout | peer-unchecked, broad-entry |
| B3b | The listed stand-in driver is accepted (hello, token) and the indicator is on screen while it is connected (helper-boundary.md 0.3.5); skips until the helper lists it | no-indicator (once listed) |
| B3c | The stand-in only awaits the hello and sends bye: its one socket write is a bye, it names no other request (the condition of its listing) | - |
| B4 | A second boundary helper on the same lock exits 4; a helper with no driver exits 2 within 12 s | no-single-instance, lingers |

The stand-in passes exact launch pins (--driver-node, --driver-entry) and a clean environment, so each refusal comes
from the rule under test. Pending: the accepted case and the indicator while connected (D-029 (c)) need the real
driver to start the helper with --enforce-boundary, or the stand-in on the entry list; cu-developer-one chose the list (0.3.5).

## Read next

[INDEX.md](INDEX.md).
