---
title: ChatGPT Work execution modes and dots computers
created: 2026-11-01T09:13:00Z
modified: 2026-11-01T09:42:51Z
level: L1
version: 1.1.0
description: Where ChatGPT Work and dots coordinate and execute computer work across cloud VMs and a connected user computer, and how users intervene
status: unverified
grounded_in:
  - source: learn.chatgpt.com/docs/get-started-with-work (fetched 2026-11-01)
  - source: learn.chatgpt.com/docs/enterprise/chatgpt-work-cloud-security (fetched 2026-11-01)
  - source: learn.chatgpt.com/docs/enterprise/chatgpt-work-local-security (fetched 2026-11-01)
  - source: learn.chatgpt.com/docs/enterprise/cloud-local-access (fetched 2026-11-01)
  - source: learn.chatgpt.com/docs/dots/computers-and-apps (fetched 2026-11-01)
  - source: learn.chatgpt.com/docs/dots/controls (fetched 2026-11-01)
  - source: learn.chatgpt.com/docs/agent-approvals-security (fetched 2026-11-01)
  - source: learn.chatgpt.com/docs/enterprise/managed-configuration (fetched 2026-11-01)
---

# ChatGPT Work execution modes and dots

A task has two parts: coordination decides the steps, execution performs tool work; Local computer access
with Work Cloud moves coordination to OpenAI's cloud without moving every tool off the computer [cla].

| Mode | Coordinates | Executes | Notes | Source |
|---|---|---|---|---|
| Local Work | Desktop app (local) | User's computer | Local files, apps, browser | [gsw], [cla] |
| Work Cloud | OpenAI cloud | VM-backed sandbox, reusable or replaced, plus cloud browser | Inherits no local files, apps, sessions, private network | [wcs] |
| Work Cloud with local access | Cloud orchestrator | Connected computer for local steps | App 26.929 or later; new tasks only; cannot switch local to cloud mid-turn; if the computer is unavailable when a new turn starts, an existing task can continue in a cloud container without local tools or local requirements | [cla], [wls] |
| dot cloud computer | Dot | Dot's own computer and browser; can keep state between uses | Works while user devices are off | [dots] |
| dot plus your computer | Dot | One connected personal computer; local Work or Codex tasks | App must stay open; Offline is not revoked | [dots] |

## Human intervention

Watching, Take over and Return control across surfaces are compared in
[human control](product-human-control.md).

- **Sign-in:** a private form sends credentials to the remote browser outside the conversation; reusing a
  saved login needs confirmation [dots].
- **Action review:** before an account-affecting or sharing action, an automatic review checks instructions,
  permissions, custom rules and safety requirements, then proceeds, asks, or hands the step to the user;
  password changes are always the user's [dots-ctl].
- **Custom rules:** Take action without asking; Take action when you say so; Ask before taking action; Hand
  off to you. Rules cannot override built-in safety requirements [dots-ctl].
- **Stop:** Pause stops the main task only; delegated tasks and schedules stop separately; stopping undoes
  nothing [dots-ctl].
- **Safety pause:** GPT-6 Astra monitoring runs asynchronously and can pause a Work task after the triggering
  activity; on Codex CLI, mobile or zero data retention the task ends instead [aas].

## Admin capability switches

"Let agents use cloud computers" groups Use a browser, Allow network access and Allow computer use; it is
shared by dots, Work Cloud and team automations and is independent of Work Cloud access; local computer
access is a separate opt-in [wcs]. Managed configuration names the first two Cloud browser use and Cloud
network access under Cloud computer capabilities [mc]. Local execution requirements do not apply to cloud
computers [cla].

**Inference:** OpenAI separates the planner location from the actuator location; a self-built system should
model each tool call's execution site explicitly and apply that site's policy.

[gsw]: https://learn.chatgpt.com/docs/get-started-with-work
[wcs]: https://learn.chatgpt.com/docs/enterprise/chatgpt-work-cloud-security
[wls]: https://learn.chatgpt.com/docs/enterprise/chatgpt-work-local-security
[cla]: https://learn.chatgpt.com/docs/enterprise/cloud-local-access
[dots]: https://learn.chatgpt.com/docs/dots/computers-and-apps
[dots-ctl]: https://learn.chatgpt.com/docs/dots/controls
[aas]: https://learn.chatgpt.com/docs/agent-approvals-security
[mc]: https://learn.chatgpt.com/docs/enterprise/managed-configuration
