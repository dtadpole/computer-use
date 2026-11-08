---
title: Human control across ChatGPT computer-use surfaces
created: 2026-11-01T09:41:45Z
modified: 2026-11-01T09:42:51Z
level: L1
version: 1.0.0
description: How a person watches, is notified, takes over, returns control and stops a ChatGPT computer-use task on each surface
status: unverified
grounded_in:
  - source: learn.chatgpt.com/docs/computer-use (fetched 2026-11-01)
  - source: learn.chatgpt.com/docs/pets (fetched 2026-11-01)
  - source: learn.chatgpt.com/docs/notifications (fetched 2026-11-01)
  - source: learn.chatgpt.com/docs/remote-connections (fetched 2026-11-01)
  - source: learn.chatgpt.com/docs/browser (fetched 2026-11-01)
  - source: learn.chatgpt.com/docs/enterprise/chatgpt-work-overview (fetched 2026-11-01)
  - source: learn.chatgpt.com/docs/dots (fetched 2026-11-01)
  - source: learn.chatgpt.com/docs/dots/computers-and-apps (fetched 2026-11-01)
  - source: learn.chatgpt.com/docs/dots/controls (fetched 2026-11-01)
  - source: learn.chatgpt.com/docs/agent-approvals-security (fetched 2026-11-01)
---

# Human control across ChatGPT computer-use surfaces

| Surface | Watch | Take over and return | Stop |
|---|---|---|---|
| Desktop Computer Use, macOS | Picture-in-picture window, attachable to the pet [pets] | User can take over the computer at any time [cu] | Stop any time; cancel if it uses the wrong window [cu] |
| Desktop Computer Use, Windows | Runs in the foreground of the active desktop [cu] | Agent holds foreground input; use a second device or VM, or stop first [cu] | Stop the task [cu] |
| Work cloud browser | Page screenshots and browser replay in the conversation [wov] | Take over its computer on mobile or desktop when blocked; on-page sign-in pauses the task until **I'm done** [br] | Skip or cancel a sign-in request [br] |
| dots | **Open computer** shows the screen without control [dots-ca] | **Take over**, then **Return control**; for sign-in, **Take over to sign in**, then **Done** [dots-ca], [dots] | **Pause** and **Resume** the main task; delegated tasks and schedules stop separately; nothing is undone [dots-ctl] |

## Being told that input is needed

- **Desktop app:** turn-completion alerts set to never, background only or always; permission and question
  notifications toggle separately. Activity view (Cmd+Option+U; Ctrl+Alt+U) lists unread, running and
  waiting chats; a pet shows **Running**, **Needs input**, **Ready** or **Blocked** [ntf].
- **Phone:** remote connections let the user steer, "Approve commands and other actions" and be notified when
  ChatGPT "completes a task or needs your attention" [rc]. A Windows host must stay unlocked for Computer Use
  [rc].
- **dots:** **Activity** shows tasks waiting for "a decision, app connection, sign-in, or approval"; opening
  the request continues the work [dots-ctl].

## User input during a run

The only documented reaction is in macOS Locked use: local keyboard or pointer input makes ChatGPT relock the
Mac and pause automatic unlock until a manual unlock [cu]. Normal macOS tasks can run in the background
[cu]. No fetched page documents pausing when the user moves the mouse or types.

## Automatic pauses

GPT-6 Astra safety monitoring "runs asynchronously and can pause a task"; a pause "can arrive after the
activity that triggered it". Supported clients let the user review findings and resume; on Codex CLI, mobile
or zero data retention the task ends. Approval review judges single actions beforehand; monitoring can still
pause the task later [aas].

**Inference:** a self-built agent needs a live view separate from the controlled screen, a "needs input"
state that notifies, take over and return as a mode switch that suspends the loop, a stop without implied
undo, and a defined rule for local input during a run, which OpenAI documents only for Locked use.

[cu]: https://learn.chatgpt.com/docs/computer-use
[pets]: https://learn.chatgpt.com/docs/pets
[ntf]: https://learn.chatgpt.com/docs/notifications
[rc]: https://learn.chatgpt.com/docs/remote-connections
[br]: https://learn.chatgpt.com/docs/browser
[wov]: https://learn.chatgpt.com/docs/enterprise/chatgpt-work-overview
[dots]: https://learn.chatgpt.com/docs/dots
[dots-ca]: https://learn.chatgpt.com/docs/dots/computers-and-apps
[dots-ctl]: https://learn.chatgpt.com/docs/dots/controls
[aas]: https://learn.chatgpt.com/docs/agent-approvals-security
