import assert from 'node:assert/strict'
import { test } from 'node:test'

import { LIVE_VIEW_TITLE_MARKER } from '../../_tools_/agent-core/exclusions.mjs'
import {
  appOf, BROWSER_ONLY, consentView, NO_APP_WINDOW, noAppWindowShown, controlsFor, coveredOf, coveredPointLine, describeEvent, fromFraction, initialView, keyInput, MESSAGE_MAX, messageOf, mouseInput, NAMED_BY_HIT_TEST, needsAttention, noticeFor, pageFor, pageTitle, POINT_COVERED, reduce, TITLE_MARKER, toFraction, waitingForApp, wheelInput,
} from '../../_tools_/live-view/ui-logic.mjs'

const rect = { left: 100, top: 50, width: 800, height: 500 }
const FIXTURE = 'com.example.fixture'
const STATES = ['running', 'paused', 'taken_over', 'awaiting_consent', 'finished']
const facts = (fields = {}) => ({ scope: [FIXTURE], pauseArmed: true, localInput: null, secureInput: false, grants: { screen: true }, ...fields })
/** A desktop run's view as the page holds it after a hello. */
const desktopView = (fields = {}) => ({ ...initialView(), kind: 'desktop', state: 'running', source: 'control', environmentState: facts(), ...fields })

test('a watcher may only pause and stop; the control token adds take-over, hand-back, resume, consent and guidance', () => {
  assert.deepEqual(controlsFor('running', 'view'), { pause: true, resume: false, takeOver: false, handBack: false, stop: true, consent: false, guide: false, drive: false })
  assert.deepEqual(controlsFor('running', 'control'), { pause: true, resume: false, takeOver: true, handBack: false, stop: true, consent: true, guide: true, drive: false })
  assert.equal(controlsFor('paused', 'control').resume, true)
  assert.equal(controlsFor('paused', 'view').resume, false)
  const driving = controlsFor('taken_over', 'control')
  assert.deepEqual([driving.drive, driving.handBack, driving.takeOver, driving.pause], [true, true, false, false])
  assert.equal(controlsFor('taken_over', 'view').drive, false, 'only the control token drives')
  assert.equal(controlsFor('awaiting_consent', 'control').takeOver, true)
  assert.deepEqual(Object.values(controlsFor('finished', 'control')).filter(Boolean), [], 'nothing is live after the end')
})

test('attention: a pending request or a hand-off the agent asked for, never after the end', () => {
  assert.equal(needsAttention('awaiting_consent', [{ id: 'a' }]), true)
  assert.equal(needsAttention('taken_over', [], true), true)
  assert.equal(needsAttention('taken_over', [], false), false, 'a take-over the person chose needs no alarm')
  assert.equal(needsAttention('running', []), false)
  assert.equal(needsAttention('finished', [{ id: 'a' }]), false)
})

test('pointer positions map to fractions of the screen and back to viewport pixels', () => {
  assert.deepEqual(toFraction(500, 300, rect), { fx: 0.5, fy: 0.5 })
  assert.equal(toFraction(99, 300, rect), null)
  assert.equal(toFraction(900, 300, rect), null, 'the right edge is outside')
  assert.equal(toFraction(1, 1, { left: 0, top: 0, width: 0, height: 10 }), null)
  assert.deepEqual(fromFraction({ fx: 0.5, fy: 0.25 }, { width: 1440, height: 900 }), { x: 720, y: 225 })
  assert.equal(fromFraction({ fx: 1, fy: 0 }, { width: 1440, height: 900 }), null)
  assert.equal(fromFraction({ fx: '0.5', fy: 0 }, { width: 1440, height: 900 }), null)
})

test('DOM mouse and wheel events become input events with buttons, click counts and modifiers', () => {
  assert.deepEqual(mouseInput({ type: 'mousedown', clientX: 500, clientY: 300, button: 2, detail: 2, shiftKey: true }, rect),
    { type: 'mouse', action: 'down', fx: 0.5, fy: 0.5, button: 'right', clickCount: 2, modifiers: { alt: false, ctrl: false, meta: false, shift: true } })
  assert.equal(mouseInput({ type: 'mousemove', clientX: 500, clientY: 300 }, rect).button, 'none')
  assert.equal(mouseInput({ type: 'click', clientX: 500, clientY: 300 }, rect), null)
  assert.equal(mouseInput({ type: 'mousedown', clientX: 0, clientY: 0, button: 0 }, rect), null)
  assert.equal(wheelInput({ clientX: 500, clientY: 300, deltaX: 0, deltaY: 3, deltaMode: 1 }, rect).deltaY, 120, 'line deltas become pixels')
})

test("DOM key events become input events; modifier repeats, composition and the person's paste chord are not forwarded", () => {
  assert.deepEqual(keyInput({ type: 'keydown', key: 'a', metaKey: true }), { type: 'key', action: 'down', key: 'a', modifiers: { alt: false, ctrl: false, meta: true, shift: false } })
  assert.equal(keyInput({ type: 'keyup', key: 'Enter' }).action, 'up')
  assert.equal(keyInput({ type: 'keydown', key: 'Shift', repeat: true }), null)
  assert.equal(keyInput({ type: 'keydown', key: 'a', isComposing: true }), null)
  assert.equal(keyInput({ type: 'keydown', key: 'v', metaKey: true }), null, 'the paste event carries the text instead')
  assert.equal(keyInput({ type: 'keypress', key: 'a' }), null)
})

test('log lines describe events without tokens', () => {
  assert.equal(describeEvent({ type: 'state', prior: 'running', state: 'paused', source: 'view' }), 'state: running -> paused (view)')
  assert.equal(describeEvent({ type: 'control', command: 'take_over', source: 'view', ok: false, error: 'not_allowed_for_sender' }), 'take_over from view: refused (not_allowed_for_sender)')
  assert.match(describeEvent({ type: 'consent_request', request: { id: 'c1', summary: 'Submit the order' } }), /Submit the order/)
  assert.equal(describeEvent({ type: 'hello', source: 'control', runId: 'r1', state: 'running' }), 'connected as control; run r1 is running')
})

test('the title marker is agent core\'s LIVE_VIEW_TITLE_MARKER and leads every title the page sets', () => {
  assert.equal(TITLE_MARKER, LIVE_VIEW_TITLE_MARKER)
  for (const state of [...STATES, 'connecting']) {
    for (const attention of [false, true]) assert.ok(pageTitle(state, attention).startsWith(`${TITLE_MARKER} `), `${state} ${attention}`)
  }
  assert.ok(pageFor(desktopView({ state: 'awaiting_consent', pending: [{ id: 'a' }] })).title.startsWith(TITLE_MARKER))
  assert.ok(pageFor(initialView()).title.startsWith(TITLE_MARKER), 'before the first event too')
})

test('desktop: no browser control and no remote input in any state for either token; take over only changes the state', () => {
  for (const state of STATES) {
    for (const source of ['view', 'control']) {
      const page = pageFor(desktopView({ state, source, dialog: { type: 'confirm', message: 'x' } }))
      assert.equal(page.controls.drive, false, `${state} ${source}`)
      for (const id of BROWSER_ONLY) assert.equal(page.hidden[id], true, `${id} shown in ${state} for ${source}`)
      assert.equal(page.hidden['drive-hint'], true)
    }
  }
  assert.deepEqual(BROWSER_ONLY, ['nav', 'back', 'forward', 'reload', 'dialog', 'dialog-accept', 'dialog-dismiss'])
  const taken = pageFor(desktopView({ state: 'taken_over' }))
  assert.deepEqual([taken.hidden['desktop-hint'], taken.hidden['hand-back'], taken.disabled['hand-back'], taken.hidden.note], [false, false, false, false])
  assert.equal(pageFor(desktopView({ state: 'taken_over', source: 'view' })).hidden['desktop-hint'], true)
  assert.equal(taken.screenLabel, 'the approved apps on the Mac')
  assert.equal(controlsFor('taken_over', 'control', 'desktop').drive, false)
  assert.equal(controlsFor('taken_over', 'control', null).drive, false, 'nothing is driven before the environment is known')
  // The browser's page is as it was: driven with pointer and keys, its navigation and dialog controls shown.
  const browser = pageFor({ ...initialView(), kind: 'browser', state: 'taken_over', source: 'control', dialog: { type: 'confirm', message: 'Sure?' } })
  assert.deepEqual([browser.controls.drive, browser.hidden.nav, browser.hidden.back, browser.hidden.dialog, browser.hidden['dialog-accept'], browser.hidden['drive-hint'], browser.hidden['desktop-hint']],
    [true, false, false, false, false, false, true])
})

test('the run buttons keep their rules on desktop: a watcher sees pause and stop, the control token all five', () => {
  const watch = pageFor(desktopView({ source: 'view' }))
  assert.deepEqual(['pause', 'resume', 'take-over', 'hand-back', 'stop'].map((id) => watch.hidden[id]), [false, true, true, true, false])
  const control = pageFor(desktopView({ state: 'paused' }))
  assert.deepEqual(['pause', 'resume', 'take-over', 'hand-back', 'stop'].map((id) => control.disabled[id]), [true, false, false, true, false])
})

test('a desktop screen waits for its first approved app instead of failing; a browser screen never waits', () => {
  const waiting = desktopView({ state: 'awaiting_consent', environmentState: facts({ scope: [] }) })
  assert.equal(waitingForApp(waiting), true)
  assert.equal(pageFor(waiting).hidden['screen-wait'], false)
  assert.equal(pageFor(waiting).notice, null, 'waiting is not an error or a notice')
  assert.equal(waitingForApp(desktopView({ environmentState: null })), true, 'no facts yet is no approved app yet')
  assert.equal(waitingForApp(desktopView()), false)
  assert.equal(pageFor(desktopView()).hidden['screen-wait'], true)
  assert.equal(waitingForApp(desktopView({ state: 'finished', environmentState: facts({ scope: [] }) })), false)
  assert.equal(waitingForApp({ ...initialView(), kind: 'browser', state: 'running' }), false)
  assert.equal(waitingForApp(initialView()), false)
})

test('the local-input pause: the stream\'s state and localInput events make the page say the person paused it, with Resume for the control token only', () => {
  let view = reduce(initialView(), { type: 'hello', source: 'control', state: 'running', runId: 'r', environmentKind: 'desktop', environmentState: facts(), pending: [] })
  assert.equal(noticeFor(view), null)
  view = reduce(view, { type: 'state', prior: 'running', state: 'paused', source: 'local_input' })
  view = reduce(view, { type: 'localInput', at: 1_700_000_000_000, kind: 'key' })
  assert.deepEqual([view.pausedBy, view.localInput], ['local_input', { at: 1_700_000_000_000, kind: 'key' }])
  const notice = noticeFor(view)
  assert.equal(notice.kind, 'local_input')
  assert.match(notice.text, /A person's own key press on the Mac paused the agent/)
  assert.match(notice.text, /never resumes by itself/)
  const page = pageFor(view)
  assert.deepEqual([page.hidden.notice, page.hidden['notice-resume'], page.disabled.resume], [false, false, false])
  const watcher = pageFor({ ...view, source: 'view' })
  assert.deepEqual([watcher.hidden['notice-resume'], watcher.hidden.resume], [true, true])
  assert.match(watcher.notice.text, /someone with the control link resumes it/)
  // A person resumes: the notice goes, and so does the input's record.
  const resumed = reduce(view, { type: 'state', prior: 'paused', state: 'running', source: 'control' })
  assert.deepEqual([noticeFor(resumed), resumed.localInput, resumed.pausedBy], [null, null, null])
  assert.equal(noticeFor(reduce(resumed, { type: 'state', prior: 'running', state: 'paused', source: 'view' })), null, 'a watcher\'s pause is not local input')
  // A page that reconnects during the pause learns who paused from the hello.
  const again = reduce(initialView(), { type: 'hello', source: 'control', state: 'paused', pausedBy: 'local_input', environmentKind: 'desktop', environmentState: facts({ localInput: '2026-11-02T10:00:00.000Z' }), pending: [] })
  assert.match(noticeFor(again).text, /A person's own input on the Mac paused the agent/)
  assert.equal(noticeFor(again).resume, true)
})

test('secure input and a local-input stop that run control could not pause are shown from the desktop facts', () => {
  const secure = reduce(desktopView({ state: 'taken_over' }), { type: 'environment_state', environmentState: facts({ secureInput: true }) })
  assert.equal(noticeFor(secure).kind, 'secure_input')
  const handed = reduce(secure, { type: 'notice', kind: 'handoff', reason: 'typing into a secure field is the person\'s' })
  const page = pageFor(handed)
  assert.equal(page.attention, true)
  assert.match(page.attentionText, /handed control to you: typing into a secure field is the person's\. Use the Mac itself, then hand back\./)
  assert.equal(reduce(handed, { type: 'state', prior: 'taken_over', state: 'running', source: 'control' }).handoff, null)
  const held = noticeFor(desktopView({ environmentState: facts({ localInput: '2026-11-02T10:00:00.000Z' }) }))
  assert.deepEqual([held.kind, held.resume], ['local_input', false])
  assert.match(held.text, /Take over, then hand back/)
  assert.equal(noticeFor({ ...initialView(), kind: 'browser', state: 'running', source: 'control', environmentState: facts({ secureInput: true }) }), null)
  assert.equal(noticeFor(desktopView({ state: 'finished', environmentState: facts({ secureInput: true }) })), null)
})

test('consent: new_app names the bundle id and offers the request\'s lifetimes; the browser\'s answers are unchanged; a watcher gets none', () => {
  const request = { id: 'start-app-1', class: 'new_app', origin: 'policy', recipient: FIXTURE, what: `use ${FIXTURE} in this run (a start app)`, lifetimes: ['once', 'run', 'always'] }
  const shown = consentView(request, true)
  assert.match(shown.text, /^New app: allow the agent to use com\.example\.fixture\?/)
  assert.deepEqual(shown.choices.map((c) => [c.label, c.approved, c.lifetime]), [
    ['Approve once', true, 'once'], ['Approve for this run', true, 'run'], [`Always allow ${FIXTURE}`, true, 'always'], ['Decline', false, 'once'],
  ])
  assert.deepEqual(consentView(request, false).choices, [])
  assert.equal(appOf({ class: 'new_app', app: 'com.example.a', recipient: 'com.example.b' }), 'com.example.a')
  assert.equal(appOf({ class: 'new_app', target: { origin: 'com.example.c' } }), 'com.example.c')
  assert.equal(appOf({ class: 'submit', recipient: FIXTURE }), null)
  assert.deepEqual(consentView({ id: 'c', class: 'submit', summary: 'Submit the order' }, true).choices.map((c) => c.label), ['Approve once', 'Approve for this run', 'Decline'])
  assert.deepEqual(consentView({ id: 's', class: 'provider_check', what: 'a check', lifetimes: ['once'] }, true).choices.map((c) => c.label), ['Approve once', 'Decline'])
  assert.equal(consentView({ id: 'w', class: 'submit', what: 'submit the form', origin: 'policy' }).text, 'submit the form')
  assert.equal(describeEvent({ type: 'consent_request', request }), `consent needed: new app ${FIXTURE}`)
  const pending = reduce(desktopView(), { type: 'consent_request', request })
  assert.equal(pageFor(pending).attention, true)
})

test('desktop log lines carry the input\'s kind and nothing more', () => {
  assert.equal(describeEvent({ type: 'localInput', at: 1, kind: 'key' }), 'local input on the Mac (key)')
  assert.equal(describeEvent({ type: 'localInput', at: 1, kind: 'other' }), 'local input on the Mac (pointer)')
  assert.equal(describeEvent({ type: 'environment', kind: 'crash', reason: 'gone' }, 'desktop'), 'desktop: crash')
  assert.equal(describeEvent({ type: 'environment', kind: 'blocked', url: 'https://x.example/' }), 'browser: blocked https://x.example/')
  assert.equal(describeEvent({ type: 'environment_state', environmentState: facts({ secureInput: true }) }), 'desktop: 1 approved app(s), secure input on')
  assert.equal(describeEvent({ type: 'attached', environmentKind: 'desktop' }), 'environment: desktop')
  assert.equal(reduce(initialView(), { type: 'localInput', at: 5, kind: 'key', key: 'a', x: 1 }).localInput.key, undefined, 'only time and kind are kept')
})

const OVERLAY = 'now.typeless.desktop'
/**
 * A mid-run new_app request as agent core's loop builds it today (loop.mjs: rule app:not_approved, the action record,
 * the target's bundle id and role only), for a click the policy's hit test found on another app's window.
 */
const midRun = (fields = {}) => ({
  id: 'c-1', kind: 'action', origin: 'policy', step: 2, index: 0, class: 'new_app', classes: ['new_app'], rule: 'app:not_approved',
  action: { type: 'click', button: 'left', x: 400, y: 530 }, app: OVERLAY, target: { origin: OVERLAY, role: null },
  what: `use ${OVERLAY}, an app this run has no approval for (target)`, recipient: OVERLAY, lifetimes: ['once', 'run', 'always'], ...fields,
})
const COVERS_CLICK = `A ${OVERLAY} window covers the point the agent wants to click - quit or move it rather than approve it.`

test('CU-38 consent: a new_app request agent core names by its hit test (appNamedBy hit_test) gets the human-only covered-point line, for a watcher too; nothing is guessed without the field', () => {
  assert.equal(NAMED_BY_HIT_TEST, 'hit_test')
  // Today's request: the frontmost-or-target choice is free text in `what`, and a target may be the focused element.
  assert.equal(consentView(midRun(), true).note, null, 'no line from target, action or what alone')
  const named = midRun({ appNamedBy: 'hit_test' })
  const shown = consentView(named, true)
  assert.equal(shown.note, COVERS_CLICK)
  assert.match(shown.text, /^New app: allow the agent to use now\.typeless\.desktop\?/, 'the question itself is unchanged')
  assert.deepEqual(shown.choices, consentView(midRun(), true).choices, 'the answers are unchanged')
  assert.deepEqual([consentView(named, false).note, consentView(named, false).choices], [COVERS_CLICK, []], 'a watcher sees the line, not the answers')
  const verbs = { double_click: 'double-click', triple_click: 'triple-click', move: 'move the pointer to', drag: 'drag from', scroll: 'scroll at', keypress: 'act at' }
  for (const [type, verb] of Object.entries(verbs)) assert.match(coveredPointLine(midRun({ appNamedBy: 'hit_test', action: { type } })), new RegExp(`wants to ${verb} - `), type)
  assert.match(coveredPointLine(midRun({ appNamedBy: 'hit_test', action: null })), /wants to act at - /)
  for (const other of ['frontmost', 'focused_element', 'start_app', 'HIT_TEST', true]) assert.equal(coveredPointLine(midRun({ appNamedBy: other })), null, String(other))
  const start = { id: 'start-app-1', class: 'new_app', rule: 'app:start', action: null, app: FIXTURE, recipient: FIXTURE, target: { origin: FIXTURE, role: null }, what: `use ${FIXTURE} in this run (a start app)` }
  assert.equal(consentView(start, true).note, null, 'a start app is no covered point')
  assert.equal(coveredPointLine({ class: 'submit', appNamedBy: 'hit_test', app: OVERLAY, action: { type: 'click' } }), null, 'only a new_app request')
  // Bundle id and action type only: a target name, if any, never reaches the line.
  assert.equal(coveredPointLine(midRun({ appNamedBy: 'hit_test', target: { origin: OVERLAY, role: 'AXButton', name: 'Dictation bar' } })).includes('Dictation'), false)
})

test('CU-38 notice: agent core\'s point_covered notice names the covering app for both tokens, after the existing notices, until a clear or a state change other than the ask', () => {
  assert.equal(POINT_COVERED, 'point_covered')
  const covered = { type: 'notice', kind: 'point_covered', app: OVERLAY }
  const view = reduce(desktopView(), covered)
  assert.deepEqual(view.covered, { app: OVERLAY })
  const text = `A ${OVERLAY} window covered the point of the agent's last action - quit, move or dismiss it.`
  assert.deepEqual(noticeFor(view), { kind: 'point_covered', text, resume: false })
  assert.deepEqual([pageFor(view).hidden.notice, pageFor(view).hidden['notice-resume']], [false, true])
  assert.deepEqual(noticeFor({ ...view, source: 'view' }), noticeFor(view), 'the watch link sees it too')
  // The existing notices keep their priority: the local-input pause first, then secure input, then a local-input stop.
  const at = '2026-11-05T17:00:00.000Z'
  assert.equal(noticeFor(reduce(desktopView({ state: 'paused', pausedBy: 'local_input', localInput: { at: 1, kind: 'key' } }), covered)).kind, 'local_input')
  assert.equal(noticeFor({ ...view, environmentState: facts({ secureInput: true }) }).kind, 'secure_input')
  assert.equal(noticeFor({ ...view, environmentState: facts({ localInput: at }) }).text.startsWith('A person\'s own input on the Mac stopped'), true)
  // Agent core's clear after an action went through, and any state change, end it.
  assert.deepEqual([reduce(view, { type: 'notice', kind: 'point_covered', app: null }).covered, noticeFor(reduce(view, { type: 'notice', kind: 'point_covered', app: null }))], [null, null])
  for (const state of ['paused', 'taken_over', 'finished']) assert.equal(noticeFor(reduce(view, { type: 'state', prior: 'running', state, source: 'loop' })), null, state)
  // The ask about the covering app itself (running -> awaiting_consent) keeps it: agent core raised it for that ask.
  assert.notEqual(noticeFor(reduce(view, { type: 'state', prior: 'running', state: 'awaiting_consent', source: 'loop' })), null, 'awaiting_consent keeps it')
  assert.equal(reduce(view, { type: 'notice', kind: 'handoff', reason: 'r' }).covered.app, OVERLAY, 'another notice leaves it')
  // A page that connects later learns it from the hello; a browser run never shows it.
  const hello = { type: 'hello', source: 'view', state: 'running', runId: 'r', environmentKind: 'desktop', environmentState: facts(), pending: [] }
  assert.equal(noticeFor(reduce(initialView(), { ...hello, covered: { app: OVERLAY } })).text, text)
  assert.equal(noticeFor(reduce(initialView(), { ...hello, covered: null })), null)
  assert.equal(noticeFor({ ...initialView(), kind: 'browser', state: 'running', source: 'control', covered: { app: OVERLAY } }), null)
  // Bundle id only: extra fields are dropped and a title passed off as the app counts as none.
  assert.deepEqual(reduce(desktopView(), { ...covered, title: 'Typeless dictation bar', frame: { x: 1, y: 2 } }).covered, { app: OVERLAY })
  for (const app of ['Typeless dictation bar', '', 42, undefined]) assert.equal(coveredOf({ app }), null, String(app))
  assert.equal(describeEvent(covered, 'desktop'), `desktop: a ${OVERLAY} window covered the point of the agent's last action`)
  assert.equal(describeEvent({ type: 'notice', kind: 'point_covered', app: null }), 'desktop: an action went through; the covered-point notice is cleared')
  assert.equal(describeEvent({ type: 'notice', kind: 'handoff', reason: 'r' }), 'notice: handoff - r', 'other notices log as before')
})

test('a point_covered line survives the ask about the covering app (running <-> awaiting_consent) and clears on anything else (CU-38)', async () => {
  const { reduce, initialView, clearsCovered, noticeFor } = await import('../../_tools_/live-view/ui-logic.mjs')
  const app = 'now.typeless.desktop'
  let view = reduce({ ...initialView(), kind: 'desktop', state: 'running', source: 'watch' }, { type: 'notice', kind: 'point_covered', app })
  view = reduce(view, { type: 'state', prior: 'running', state: 'awaiting_consent', source: 'loop' })
  view = reduce(view, { type: 'state', prior: 'awaiting_consent', state: 'running', source: 'consent' })
  assert.deepEqual(view.covered, { app }, 'an unattended decline passes through awaiting_consent; the watcher still sees it')
  assert.match(noticeFor(view).text, /now\.typeless\.desktop window covered the point/)
  assert.equal(reduce(view, { type: 'state', prior: 'running', state: 'paused', source: 'control' }).covered, null, 'a pause clears it')
  assert.equal(clearsCovered({ type: 'state', prior: 'awaiting_consent', state: 'paused' }), true, 'a pause during the ask clears it')
  assert.equal(clearsCovered({ type: 'state', prior: 'running', state: 'finished' }), true)
  assert.equal(reduce(view, { type: 'notice', kind: 'point_covered', app: null }).covered, null, 'agent core clears it')
})

test('a file_choice consent card says what approving does in that panel: Save writes, Open hands a file over, else both (CU-50)', async () => {
  const { consentView, filePanelLine } = await import('../../_tools_/live-view/ui-logic.mjs')
  const ask = (panel) => ({ id: 'f1', class: 'file_choice', what: 'choose a file in ai.reflection.cu.fixture\'s file panel ("Save"): destination folder unknown', panel, lifetimes: ['once'] })
  assert.match(consentView(ask('save'), true).note, /^Save panel: approving lets the app write a file where the panel points/)
  assert.match(consentView(ask('open'), false).note, /^Open panel: approving gives the app the file chosen in the panel to read - it could send it elsewhere/, 'a watcher sees it too')
  for (const panel of ['unknown', null, undefined]) assert.match(consentView(ask(panel)).note, /^File panel of unknown kind/)
  assert.deepEqual(consentView(ask('save'), true).choices.map((c) => c.label), ['Approve once', 'Decline'], 'file_choice stays once-only')
  assert.equal(filePanelLine({ class: 'submit', panel: 'save' }), null, 'only file_choice gets the line')
})

test('a notice with agent core\'s own message (CU-64: released_stale, held_at_local_input, held_at_loss) reaches the page as text', () => {
  const desktop = reduce(initialView(), { type: 'hello', state: 'running', source: 'control', environmentKind: 'desktop', environmentState: { scope: ['com.example.fixture'] } })
  assert.equal(noticeFor(desktop), null)
  // Alone: an earlier helper's released key, told at run start.
  const released = reduce(desktop, { type: 'notice', kind: 'released_stale', message: 'A SHIFT key left down by an earlier, lost helper was released.', keys: ['SHIFT'] })
  assert.deepEqual(noticeFor(released), { kind: 'released_stale', text: 'A SHIFT key left down by an earlier, lost helper was released.', resume: false })
  // Beside the pause it explains: the local-input pause keeps its own kind and Resume, with the message after it.
  const paused = reduce(reduce(released, { type: 'state', state: 'paused', source: 'local_input' }), { type: 'notice', kind: 'held_at_local_input', message: 'Your first keystroke may have carried SHIFT.' })
  const notice = noticeFor(paused)
  assert.equal(notice.kind, 'local_input')
  assert.equal(notice.resume, true)
  assert.match(notice.text, /paused the agent\..*Your first keystroke may have carried SHIFT\.$/)
  // A resume clears it; so does the end of the run.
  assert.equal(noticeFor(reduce(paused, { type: 'state', state: 'running' })), null)
  assert.equal(noticeFor(reduce(paused, { type: 'state', state: 'finished' })), null)
  // Handoff and point_covered keep their own handling; a notice without a message changes nothing.
  assert.equal(reduce(desktop, { type: 'notice', kind: 'handoff', reason: 'secure_input', message: 'x' }).message, null)
  assert.equal(reduce(desktop, { type: 'notice', kind: 'released_stale' }).message, null)
  // Long text is cut; the text is shown as text (app.js sets textContent).
  assert.equal(messageOf({ kind: 'held_at_loss', message: 'x'.repeat(MESSAGE_MAX + 50) }).text.length, MESSAGE_MAX)
  assert.equal(messageOf({ kind: 'held_at_loss', message: '   ' }), null)
})

test('CU-100: no approved window on screen - the page says so in place of the black frame; a person\'s pause still comes first', () => {
  const blank = desktopView({ environmentState: facts({ noAppWindow: true }) })
  const page = pageFor(blank)
  assert.equal(page.notice.kind, NO_APP_WINDOW)
  assert.match(page.notice.text, /^No window of com\.example\.fixture is on screen, so there is nothing to show - open it on the Mac/)
  assert.equal(page.hidden.screen, true, 'the black frame is not shown')
  assert.equal(page.hidden.notice, false)
  assert.equal(noAppWindowShown(blank), true)
  // A window again, or the run over: the frame is back and the notice gone.
  assert.equal(pageFor(desktopView({ environmentState: facts({ noAppWindow: false }) })).hidden.screen, false)
  assert.equal(pageFor(desktopView({ environmentState: facts() })).notice, null)
  assert.equal(pageFor({ ...blank, state: 'finished' }).hidden.screen, false)
  // The local-input pause is the person's and stays the notice; a browser run never shows this one.
  const paused = pageFor({ ...blank, state: 'paused', pausedBy: 'local_input', localInput: { kind: 'key' } })
  assert.equal(paused.notice.kind, 'local_input')
  assert.equal(noAppWindowShown({ ...blank, kind: 'browser' }), false)
})
