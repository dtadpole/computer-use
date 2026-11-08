---
title: The helper's menu-key read
created: 2026-11-08T11:55:00Z
modified: 2026-11-08T12:32:00Z
level: L1
version: 0.3.0
description: How CUHelper answers menuKey - which menu items of the frontmost approved app a key chord fires - from what AppKit serves Accessibility, and what that read cannot see.
status: unverified
grounded_in:
  - source: _designs_/system-architecture/menu-key.md (the agent-core rule this read serves)
  - source: 'Linear CU-235 measurement part 1 and CU-238 (in-process reads of AppKit menus, 2026-11-08)'
---

# The helper's menu-key read

`menuKey {keyCode, flags}` names the items a chord fires, so agent core can judge the chord as a click on them
([menu-key](../system-architecture/menu-key.md)). The helper reads, per element, role, title, enabled and the four
`AXMenuItemCmd*` attributes of the frontmost approved app's menu bar - never a value - bounded at depth 10 and 4000
items.

**What AppKit serves (measured):** the key character is upper case for every letter; Shift, Option and Control are
modifier bits 1, 2 and 4, and 8 means no Command; a non-character key also carries its kVK code. Disabled and Option
alternate items are listed.

**Match:** equal modifier sets, then the virtual key, or the layout's character for the key (Command held, as
Dvorak - QWERTY Command needs) - unshifted with Shift as a modifier, or shifted with Shift used up ('1' and '!').
Every match is returned, at most 8.

**Fail closed:** a failed or partial walk, another app in front, a layout with no character for the key, or a miss
beside an empty top-level menu or menu-bar item (filled or built lazily; the first, Apple's, excepted by position) is
unreadable, never none. A later duplicate of an earlier item's key reads with no character but keeps its modifiers
(CU-238): a key-less item whose non-zero modifiers equal the chord's, or a chord whose matches are all disabled, is
unreadable too.

**Services (CU-250):** a hit or focused menu item carries `menuPath` (titles from the menu bar or a context menu's
top, at most 10 levels) and `servicesMenu: true` when a submenu on the way is the Services menu; menuKey items carry
the flag too. With no distinguishing attribute, the Services item counts by AppKit's own localized title, or by the
marker AppKit puts in its submenu ('Services Settings…', 'No Services Apply'), in the current language or English.

**Not seen:** shortcuts in lazily filled submenus below the top level - Services shows Accessibility only 'No Services
Apply' while its shortcuts stay hidden - and a later duplicate on Command alone behind an enabled first match.
