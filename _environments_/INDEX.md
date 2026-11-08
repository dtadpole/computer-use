---
title: computer-use environments
created: 2026-11-01T09:52:00Z
modified: 2026-11-02T09:03:39Z
version: 1.1.0
description: The computers the computer-use agent drives, one instance per environment driver.
grounded_in:
  - source: _designs_/system-architecture/layout-and-ownership.md@0.1.0
---

# Environments

Each instance implements the [environment driver interface](../_designs_/system-architecture/environment-driver.md)
for one kind of computer. Writer: cu-developer-two.

| Instance | What it drives |
|---|---|
| [`chrome-browser/`](chrome-browser/INDEX.md) | installed Google Chrome, headless, over CDP (D-008) |
| [`macos-desktop/`](macos-desktop/INDEX.md) | approved apps on this Mac through the CUHelper app (D-024; offline until the owner's grant) |

The owner approved the desktop environment in D-024, superseding D-006; it runs only within D-024 and D-025's rules.
