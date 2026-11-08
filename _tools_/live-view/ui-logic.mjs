/**
 * The live view's decisions, kept out of the page so they have unit tests (working agreement: logic that would live
 * untested in a page moves to a tested module). The browser loads this file as an ES module; Node tests import it.
 * Nothing here touches the DOM.
 *
 * Desktop runs (desktop-extension human-control.md): the same page and the same controls, but no remote input - take
 * over only changes the run state, the person uses the Mac itself (Q-D7) - and none of the browser's own controls.
 */

/**
 * The fixed marker every live-view window title carries (app-policy.md: a browser window showing our live view is
 * excluded by window). The helper and agent core's `isExcludedWindow` look for it with a contains test; it leads the
 * title so no truncation at the end can cut it. Must equal agent core's `LIVE_VIEW_TITLE_MARKER` (a test holds them).
 */
export const TITLE_MARKER = '[cu live view]'

/** Element ids of the browser's own controls; hidden on desktop runs, where there is no page to drive. */
export const BROWSER_ONLY = Object.freeze(['nav', 'back', 'forward', 'reload', 'dialog', 'dialog-accept', 'dialog-dismiss'])

/** The run buttons and the `controlsFor` key that enables each; their ids are stable for verifiers. */
const RUN_BUTTONS = Object.freeze([['pause', 'pause'], ['resume', 'resume'], ['take-over', 'takeOver'], ['hand-back', 'handBack'], ['stop', 'stop']])

/**
 * Which controls a sender sees enabled in a run state (design: live-control.md, run-tokens.md). `kind` is the run's
 * environment (`browser` by default, `desktop`, or null before one is attached): only a browser run is driven with
 * the page's pointer and keys, so `drive` is false for any other.
 */
export function controlsFor(state, source, kind = 'browser') {
  const control = source === 'control'
  const live = state !== 'finished'
  return {
    pause: live && state === 'running',
    resume: control && state === 'paused',
    takeOver: control && ['running', 'paused', 'awaiting_consent'].includes(state),
    handBack: control && state === 'taken_over',
    stop: live,
    consent: control && live,
    guide: control && live,
    drive: control && state === 'taken_over' && kind === 'browser',
  }
}

/** Whether the page must call the person: a pending consent request, or a hand-off the agent asked for. */
export function needsAttention(state, pending = [], handoff = false) {
  if (state === 'finished') return false
  return pending.length > 0 || (state === 'taken_over' && handoff === true)
}

/** A pointer position over the displayed screen as fractions of it, or null outside it. */
export function toFraction(clientX, clientY, rect) {
  if (!rect || !(rect.width > 0) || !(rect.height > 0)) return null
  const fx = (clientX - rect.left) / rect.width
  const fy = (clientY - rect.top) / rect.height
  if (!(fx >= 0 && fx < 1 && fy >= 0 && fy < 1)) return null
  return { fx, fy }
}

/** Fractions of the screen to viewport CSS pixels (the server side of `toFraction`). */
export function fromFraction({ fx, fy }, viewport) {
  if (typeof fx !== 'number' || typeof fy !== 'number' || !(fx >= 0 && fx < 1 && fy >= 0 && fy < 1)) return null
  return { x: fx * viewport.width, y: fy * viewport.height }
}

const MOUSE_BUTTONS = ['left', 'middle', 'right']

function modifiersOf(event) {
  return { alt: Boolean(event.altKey), ctrl: Boolean(event.ctrlKey), meta: Boolean(event.metaKey), shift: Boolean(event.shiftKey) }
}

/** A DOM mouse event over the screen as a live-view input event, or null when it is outside or not forwarded. */
export function mouseInput(event, rect) {
  const action = { mousedown: 'down', mouseup: 'up', mousemove: 'move' }[event.type]
  if (action === undefined) return null
  const at = toFraction(event.clientX, event.clientY, rect)
  if (at === null) return null
  return {
    type: 'mouse', action, ...at,
    button: action === 'move' ? 'none' : (MOUSE_BUTTONS[event.button] ?? 'left'),
    clickCount: action === 'move' ? 0 : Math.max(1, Math.min(3, event.detail || 1)),
    modifiers: modifiersOf(event),
  }
}

/** A DOM wheel event as a live-view input event (pixel deltas). */
export function wheelInput(event, rect) {
  const at = toFraction(event.clientX, event.clientY, rect)
  if (at === null) return null
  const scale = event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? 800 : 1
  return { type: 'wheel', ...at, deltaX: event.deltaX * scale, deltaY: event.deltaY * scale, modifiers: modifiersOf(event) }
}

/**
 * A DOM key event as a live-view input event, or null when it is not forwarded: auto-repeats of modifiers, input-method
 * composition, and the person's own paste chord, which the page turns into a text event from the paste instead.
 */
export function keyInput(event) {
  const action = event.type === 'keydown' ? 'down' : event.type === 'keyup' ? 'up' : null
  if (action === null || event.isComposing === true || typeof event.key !== 'string') return null
  if (event.repeat === true && ['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) return null
  if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'v') return null
  return { type: 'key', action, key: event.key, modifiers: modifiersOf(event) }
}

/**
 * The bundle id a `new_app` request asks about, or null: agent core names it as `app` when it can, else as the
 * request's `recipient` (a start app) or its target's app.
 */
export function appOf(request = {}) {
  if (request?.class !== 'new_app') return null
  for (const value of [request.app, request.recipient, request.target?.origin]) if (typeof value === 'string' && value.length > 0) return value
  return null
}

const KIND_WORDS = Object.freeze({ key: 'key press', pointer: 'pointer movement or click' })

/**
 * The value of a `new_app` request's `appNamedBy` that means agent core's hit test at the action's point named the app
 * (CU-38, Q-D11): its window owns the point the agent aimed at. The page reads this field and nothing else for it - not
 * the free-text `what`, not a guess from `target` and the action - because a key action's target is the focused
 * element and a frontmost app is not at the point, and only agent core knows which one it asked about.
 */
export const NAMED_BY_HIT_TEST = 'hit_test'

/** What the agent wanted to do at a point, by canonical action type, for the human-only lines. */
const POINT_VERBS = Object.freeze({
  click: 'click', double_click: 'double-click', triple_click: 'triple-click', move: 'move the pointer to', drag: 'drag from', scroll: 'scroll at',
})

/**
 * The human-only line of a `new_app` request whose app agent core named by its hit test at the action's point, or null
 * (CU-38): the window of another app covers where the agent wants to act - an overlay such as a dictation bar (Q-D11)
 * - so the person is told to quit or move it rather than approve an app the agent never meant to use. It names the
 * bundle id only, as the request does (trajectory-privacy.md), and lives in the page alone: the model's view and the
 * trajectory stay as they are.
 */
export function coveredPointLine(request = {}) {
  const app = appOf(request)
  if (app === null || request.appNamedBy !== NAMED_BY_HIT_TEST) return null
  const verb = POINT_VERBS[request.action?.type] ?? 'act at'
  return `A ${app} window covers the point the agent wants to ${verb} - quit or move it rather than approve it.`
}

/**
 * For a `file_choice`, what approving does in that kind of panel (CU-50), from the request's `panel` (agent core puts
 * the target's marker there: save, open, unknown, or null when unmarked). A Save panel writes a file where it points;
 * an Open panel hands the app the chosen file to read - the case to watch, since it can carry a file out. The wording
 * does not presuppose a known file: the destination, when known, is already in the request's text.
 */
export function filePanelLine(request = {}) {
  if (request.class !== 'file_choice') return null
  if (request.panel === 'save') return 'Save panel: approving lets the app write a file where the panel points (the destination above, if known).'
  if (request.panel === 'open') return 'Open panel: approving gives the app the file chosen in the panel to read - it could send it elsewhere.'
  return 'File panel of unknown kind: approving may let the app write a file or read the one chosen.'
}

/**
 * One consent request as the page shows it: its text, a human-only `note` (null for none, see `coveredPointLine`) and,
 * for the control token, the answers it offers. A `new_app` request names the bundle id, since that is what the
 * person approves (app-policy.md); the lifetimes are the ones the request offers (`always` only for apps), so no
 * button sends a lifetime run control would quietly turn into `once`. Without `lifetimes` the browser's answers stay
 * as they were: once, for this run, decline. The note is information, so a watcher sees it too.
 */
export function consentView(request = {}, canAnswer = false) {
  const app = appOf(request)
  const text = app !== null
    ? `New app: allow the agent to use ${app}?${request.what ? ` (${request.what})` : ''}`
    : request.summary ?? request.what ?? `${request.class ?? 'action'} on ${request.origin ?? ''}`
  const note = coveredPointLine(request) ?? filePanelLine(request)
  if (!canAnswer) return { text, app, note, choices: [] }
  const offered = Array.isArray(request.lifetimes) ? request.lifetimes : ['once', 'batch', 'run']
  const choices = [{ label: 'Approve once', approved: true, lifetime: 'once' }]
  if (offered.includes('run')) choices.push({ label: 'Approve for this run', approved: true, lifetime: 'run' })
  if (offered.includes('always')) choices.push({ label: app !== null ? `Always allow ${app}` : 'Always allow', approved: true, lifetime: 'always' })
  choices.push({ label: 'Decline', approved: false, lifetime: 'once' })
  return { text, app, note, choices }
}

/**
 * Whether a state event makes a `point_covered` line stale. Agent core raises it just before it asks about the covering
 * app (a hit-test `new_app`, in every mode), and every ask goes running -> awaiting_consent -> running, so those two
 * hops keep it: the line is what an unattended run's watcher has to see. Any other change - a pause, a take-over, the
 * end, a pause during the ask - means the person acted or the run moved on.
 */
export function clearsCovered(event) {
  if (event?.type !== 'state') return false
  const ask = (event.prior === 'running' && event.state === 'awaiting_consent') || (event.prior === 'awaiting_consent' && event.state === 'running')
  return !ask
}

/** The notice kind agent core sends on run control when another app's window covered an action's point (CU-38). */
export const POINT_COVERED = 'point_covered'

/** A bundle id's shape (the desktop driver's own rule): no spaces, so no window title can pass for one. */
const BUNDLE_ID = /^[A-Za-z0-9][A-Za-z0-9.-]{0,254}$/

/**
 * The covered point a `point_covered` notice (or a hello's `covered`) reports, as `{ app }`, or null: a notice without
 * a bundle id is agent core's clear after an action went through. Only a bundle id is kept, whatever else comes, and
 * anything not shaped like one counts as none (trajectory-privacy.md: an unapproved app is named by bundle id only).
 */
export function coveredOf(detail) {
  const app = detail?.app
  return typeof app === 'string' && BUNDLE_ID.test(app) ? { app } : null
}

/** The page's state before the first event; `reduce` folds each event into it. */
export function initialView() {
  return { state: 'connecting', source: null, kind: null, runId: null, pending: [], handoff: null, dialog: null, pausedBy: null, localInput: null, environmentState: null, message: null, covered: null }
}

/**
 * Fold one stream event into the page's view, returning a new view (the page renders whatever this returns). The
 * hello and `attached` say which environment the run has; `state` events say who paused (`source`, so a pause from
 * `local_input` is the person's own input on the Mac); `localInput` carries only its time and kind;
 * `environment_state` is the desktop's facts (scope, local input, secure input), rebuilt on every change. A
 * `point_covered` notice holds `covered` (bundle id only) until agent core clears it or the run state changes in a way
 * that makes it stale (`clearsCovered`).
 */
export function reduce(view, event) {
  const next = { ...view }
  switch (event?.type) {
    case 'hello':
      Object.assign(next, {
        state: event.state, source: event.source, runId: event.runId ?? null, kind: event.environmentKind ?? null, pending: event.pending ?? [],
        dialog: event.environmentState?.dialog ?? null, environmentState: event.environmentState ?? null,
        pausedBy: event.state === 'paused' ? event.pausedBy ?? null : null, handoff: event.state === 'taken_over' ? event.handoff ?? null : null,
        localInput: null, covered: coveredOf(event.covered),
      })
      break
    case 'attached':
      Object.assign(next, { kind: event.environmentKind ?? null, environmentState: event.environmentState ?? null, dialog: event.environmentState?.dialog ?? null })
      break
    case 'state':
      next.state = event.state
      // A message notice stays until the run goes on again (a resume, a hand back) or ends.
      if (event.state === 'running' || event.state === 'finished') next.message = null
      next.pausedBy = event.state === 'paused' ? event.source ?? null : null
      if (event.state !== 'taken_over') next.handoff = null
      if (event.state !== 'paused') next.localInput = null
      if (clearsCovered(event)) next.covered = null
      break
    case 'consent_request':
      next.pending = [...view.pending.filter((request) => request.id !== event.request.id), event.request]
      break
    case 'consent_resolved':
      next.pending = view.pending.filter((request) => request.id !== event.id)
      break
    case 'notice':
      if (event.kind === 'handoff') next.handoff = { reason: event.reason ?? null }
      if (event.kind === POINT_COVERED) next.covered = coveredOf(event)
      else if (event.kind !== 'handoff') next.message = messageOf(event) ?? next.message
      break
    case 'environment':
      if (event.kind === 'dialog') next.dialog = event.noticeKind === 'held' ? { type: event.dialogType, message: event.message } : null
      break
    case 'localInput':
      next.localInput = { at: event.at ?? null, kind: event.kind === 'key' ? 'key' : 'pointer' }
      break
    case 'environment_state':
      next.environmentState = event.environmentState ?? null
      break
    default:
      break
  }
  return next
}

/** Whether a desktop run's screen is waiting for its first approved app: watch frames are captures, none before. */
export function waitingForApp(view) {
  if (view.kind !== 'desktop' || view.state === 'finished') return false
  const scope = view.environmentState?.scope
  return !(Array.isArray(scope) && scope.length > 0)
}

/**
 * The notice the page shows about the person at the Mac, or null (human-control.md): the local-input pause, which only
 * a person resumes; secure input, whose typing is the person's; and a local-input stop that run control could not
 * turn into a pause (the input came while it was not running), which only take over and hand back clear. Last, as
 * information rather than a hold on the run, another app's window that covered the point of the agent's last action
 * (CU-38, Q-D11; bundle id only), for watchers too: nothing on the page can fix it, a person at the Mac can.
 */
/** The notice kind for a desktop run whose approved apps show no window (CU-100). */
export const NO_APP_WINDOW = 'no_app_window'

/**
 * CU-100 (design no-app-window.md): the driver's latest capture or watch frame found no window of an approved app.
 * The page says so in place of the black frame, for watchers too; only a person at the Mac can open the app.
 */
export function noAppWindowShown(view) {
  return view.kind === 'desktop' && view.state !== 'finished' && view.environmentState?.noAppWindow === true
}

function baseNotice(view) {
  const control = view.source === 'control'
  if (view.state === 'finished') return null
  if (view.state === 'paused' && view.pausedBy === 'local_input') {
    const what = KIND_WORDS[view.localInput?.kind] ?? 'input'
    const then = control ? 'It stays paused until you press Resume; it never resumes by itself.' : 'It stays paused until someone with the control link resumes it.'
    return { kind: 'local_input', text: `A person's own ${what} on the Mac paused the agent. ${then}`, resume: control }
  }
  if (view.kind !== 'desktop') return null
  if (view.environmentState?.secureInput === true) {
    return { kind: 'secure_input', text: 'Secure input is on (a password field): typing there is the person\'s, so the agent hands key actions to you. Hand back when done.', resume: false }
  }
  if (typeof view.environmentState?.localInput === 'string' && view.state !== 'paused') {
    const then = control ? 'Take over, then hand back, to let it go on.' : 'Someone with the control link can take over and hand back to let it go on.'
    return { kind: 'local_input', text: `A person's own input on the Mac stopped the agent's input. ${then}`, resume: false }
  }
  if (noAppWindowShown(view)) {
    const apps = (view.environmentState.scope ?? []).join(', ') || 'the approved app'
    return { kind: NO_APP_WINDOW, text: `No window of ${apps} is on screen, so there is nothing to show - open it on the Mac (it may be closed, minimized or hidden, or on another Space or display); the run stops if none shows.`, resume: false }
  }
  const covered = coveredOf(view.covered)
  if (covered !== null) {
    return { kind: POINT_COVERED, text: `A ${covered.app} window covered the point of the agent's last action - quit, move or dismiss it.`, resume: false }
  }
  return null
}

/**
 * The notice the page shows (see baseNotice), with agent core's latest message notice (messageOf) after it - so 'your
 * first keystroke may have carried SHIFT' sits beside the pause it explains - or alone when nothing else is shown.
 */
export function noticeFor(view) {
  const base = baseNotice(view)
  const message = view.state === 'finished' ? null : view.message ?? null
  if (message === null) return base
  if (base === null) return { kind: message.kind, text: message.text, resume: false }
  return { ...base, text: `${base.text} ${message.text}` }
}

/** The longest message line the page shows from a notice; agent core's are one sentence. */
export const MESSAGE_MAX = 300

/**
 * A notice agent core sends with its own sentence (`message`) - released_stale, held_at_local_input, held_at_loss
 * (CU-64) and any later kind - as `{ kind, text }`, or null without one. The page shows the text as written (as text,
 * never markup), so a new kind reaches the person without a page change.
 */
export function messageOf(event) {
  if (typeof event?.message !== 'string' || event.message.trim().length === 0) return null
  const text = event.message.trim()
  return { kind: typeof event.kind === 'string' ? event.kind : 'notice', text: text.length > MESSAGE_MAX ? `${text.slice(0, MESSAGE_MAX - 1)}…` : text }
}

/** The window title: the marker first, then the state or the call for attention. */
export function pageTitle(state, attention = false) {
  return `${TITLE_MARKER} ${attention ? '(!) computer-use needs you' : `computer-use - ${state}`}`
}

/**
 * Everything the page renders from its view: which elements are hidden or disabled (by stable id), the controls, the
 * notice, the attention line and the title. On a desktop run every browser-only control stays hidden in every state
 * and nothing is driven; take over shows a hint that the person uses the Mac itself.
 */
export function pageFor(view) {
  const desktop = view.kind === 'desktop'
  const control = view.source === 'control'
  const controls = controlsFor(view.state, view.source, view.kind)
  const hidden = {}
  const disabled = {}
  for (const [id, key] of RUN_BUTTONS) {
    hidden[id] = !control && key !== 'pause' && key !== 'stop'
    disabled[id] = !controls[key]
  }
  hidden.nav = !controls.drive
  hidden.dialog = !(view.dialog && controls.drive)
  for (const id of ['back', 'forward', 'reload', 'dialog-accept', 'dialog-dismiss']) hidden[id] = false
  if (desktop) for (const id of BROWSER_ONLY) hidden[id] = true
  hidden['drive-hint'] = !controls.drive
  hidden['desktop-hint'] = !(desktop && control && view.state === 'taken_over')
  hidden['guide-form'] = !controls.guide
  hidden.note = !controls.handBack
  const notice = noticeFor(view)
  hidden.notice = notice === null
  hidden['notice-resume'] = !(notice?.resume === true && controls.resume)
  hidden['screen-wait'] = !waitingForApp(view)
  hidden.screen = noAppWindowShown(view)
  const handoff = view.handoff !== null && view.handoff !== undefined
  const attention = needsAttention(view.state, view.pending, handoff)
  const reason = view.handoff?.reason ? `: ${view.handoff.reason}` : ''
  const attentionText = view.pending.length > 0 ? 'The agent is waiting for your decision.' : `The agent handed control to you${reason}.${desktop ? ' Use the Mac itself, then hand back.' : ''}`
  return {
    controls, hidden, disabled, notice, attention, attentionText,
    title: pageTitle(view.state, attention),
    screenLabel: desktop ? 'the approved apps on the Mac' : 'the agent\'s browser',
  }
}

/** One line for the page's event log; never shows a token. `kind` names the run's environment for its notices. */
export function describeEvent(event, kind = 'browser') {
  switch (event?.type) {
    case 'hello': return `connected as ${event.source}; run ${event.runId ?? ''} is ${event.state}`
    case 'attached': return `environment: ${event.environmentKind ?? 'unknown'}`
    case 'state': return `state: ${event.prior} -> ${event.state}${event.source ? ` (${event.source})` : ''}`
    case 'control': return `${event.command} from ${event.source}: ${event.ok ? 'ok' : `refused (${event.error})`}`
    case 'consent_request': {
      const app = appOf(event.request)
      return `consent needed: ${app !== null ? `new app ${app}` : event.request?.summary ?? event.request?.what ?? event.request?.class ?? event.request?.id}`
    }
    case 'consent_resolved': return `consent ${event.approved ? 'approved' : 'declined'} by ${event.answeredBy}`
    case 'step': return `step ${event.step}${event.summary ? `: ${event.summary}` : ''}`
    case 'notice': {
      if (event.kind !== POINT_COVERED) return `notice: ${event.kind}${event.reason ? ` - ${event.reason}` : ''}`
      const covered = coveredOf(event)
      return covered !== null ? `desktop: a ${covered.app} window covered the point of the agent's last action` : 'desktop: an action went through; the covered-point notice is cleared'
    }
    case 'environment': return `${kind === 'desktop' ? 'desktop' : 'browser'}: ${event.kind}${event.url ? ` ${event.url}` : ''}`
    case 'localInput': return `local input on the Mac (${event.kind === 'key' ? 'key' : 'pointer'})`
    case 'environment_state': {
      const facts = event.environmentState ?? {}
      const flags = [facts.secureInput === true ? 'secure input on' : null, typeof facts.localInput === 'string' ? 'local input holds the agent' : null].filter(Boolean)
      return `desktop: ${(facts.scope ?? []).length} approved app(s)${flags.length > 0 ? `, ${flags.join(', ')}` : ''}`
    }
    case 'guidance': return 'guidance queued for the agent'
    case 'finished': return `finished: ${event.result?.status ?? ''}`
    default: return String(event?.type ?? 'event')
  }
}
