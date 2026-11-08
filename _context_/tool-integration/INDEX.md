---
title: Tool integration for computer use
created: 2026-11-01T16:58:52Z
modified: 2026-11-01T16:58:52Z
version: 1.0.0
description: 'How a DSH session and a heddle session can call the [cu] computer-use agent as a tool (milestone M4), from source reading and a stub-server probe.'
grounded_in:
  - source: _team_members_/cu-researcher/responsibilities.md (2.0.0, items 1 and 2)
  - source: _designs_/system-architecture/integration-surface.md (design 0.8.1)
---

# Tool integration

Instance of [`_context_`](../INDEX.md). The goal's integration row asks that a DSH session and a heddle session can
call the agent as a tool and get the final screenshot and a trajectory link back.

| Article | Answers |
|---|---|
| [dsh-mcp-stdio](dsh-mcp-stdio.md) | How DSH mounts an MCP stdio server: layers, naming, start-up, images, the 60 s timeout |
| [heddle-tool-path](heddle-tool-path.md) | The smallest heddle change: our own plugin now, images in tool results as the request to [hd] |

The consent side - which channel reaches a person - is in [MCP clients](../model-capabilities/mcp-clients.md) and
[DSH approval modes](../model-capabilities/dsh-approval-modes.md).

## Read next

[dsh-mcp-stdio](dsh-mcp-stdio.md).
