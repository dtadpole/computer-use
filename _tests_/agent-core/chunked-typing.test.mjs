import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { createScriptedAdapter } from '../../_tools_/agent-core/adapter-scripted.mjs'
import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { apiController } from '../../_tools_/agent-core/consent.mjs'
import { createRunControl } from '../../_tools_/agent-core/control.mjs'
import { createFakeEnvironment } from '../../_tools_/agent-core/fake-env.mjs'
import { runTask } from '../../_tools_/agent-core/loop.mjs'
import { createSitePolicy } from '../../_tools_/agent-core/sites.mjs'
import { readRun } from '../../_tools_/agent-core/trajectory.mjs'
import { CARD_DIGITS, SSN } from '../fixture-shapes/shapes.mjs'

/**
 * CU-267 (cu-coordinator: High): the value rules judged each action's own text, so a card typed as sixteen keypresses or
 * four 'type' actions, or an SSN typed around MINUS keys, was never judged whole - and an injected screen only has to say
 * 'type it in groups'. Agent core now keeps what this run typed into the focused field and judges the value rules over it
 * plus the next action; the action that completes a value asks. Through runTask on agent core's fake environment, on the
 * desktop and in the browser.
 */

const FIXTURE = 'ai.reflection.cu.fixture'
const tmp = mkdtempSync(join(tmpdir(), 'cu-267-'))
after(() => rmSync(tmp, { recursive: true, force: true }))
const store = createAppApprovals({ path: join(tmp, 'a.json') })
store.grantAlways(FIXTURE, { by: 'api' })
const fieldOf = (kind, name, fingerprint) => (kind === 'desktop'
  ? { origin: FIXTURE, role: 'AXTextField', name, editable: true, fingerprint, defaultButtonRead: true }
  : { origin: 'https://fixture.example', role: 'textbox', tag: 'input', name, editable: true, fingerprint })

let runs = 0
/** Run `actions` in one batch; a click at x < 100 focuses field A, any other click field B; ARROWDOWN and TAB move to B. */
async function run(kind, actions, { task = 'fill in the notes', approve = false, clipboard = null, unreadableFocus = false } = {}) {
  const control = createRunControl()
  const environment = createFakeEnvironment({ kind, control, ...(kind === 'browser' ? { url: 'https://fixture.example/' } : {}) })
  const A = fieldOf(kind, 'Notes', 'field-a')
  const B = fieldOf(kind, 'Reference', 'field-b')
  let focus = A
  environment.focusedElement = async () => (unreadableFocus ? null : focus)
  // The browser's run clipboard (the run's own copies); agent core reads it at a paste.
  if (clipboard !== null) environment.clipboard = { get: () => clipboard, set: () => {} }
  environment.inspectPoint = async ({ x }) => (x < 100 ? A : B)
  const perform = environment.perform.bind(environment)
  environment.perform = async (action) => {
    const effect = await perform(action)
    if (action.type === 'click') focus = action.x < 100 ? A : action.x < 1000 ? B : fieldOf(kind, `Field ${action.x}`, `field-${action.x}`)
    if (action.type === 'keypress' && ['ARROWDOWN', 'TAB'].includes(action.keys?.[0])) focus = B
    if (action.type === 'keypress' && action.keys?.[0] === 'SHIFT' && action.keys?.[1] === 'TAB') focus = A
    return effect
  }
  // A long sequence goes over several model turns (a call carries a bounded batch).
  const turns = []
  for (let i = 0; i < actions.length; i += 16) turns.push({ actions: actions.slice(i, i + 16) })
  const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [...turns, { final: 'done' }] })
  // A person who approves every request, counted.
  const controller = approve ? apiController() : undefined
  let asked = 0
  let running = true
  const answering = approve ? (async () => {
    while (running) {
      const request = await controller.waitForRequest(200).catch(() => null)
      if (request) { asked += 1; controller.respond({ id: request.id, approved: true }) }
    }
  })() : null
  const result = await runTask({ task, environment, model, control, ...(controller ? { controller } : {}), runsDirectory: join(tmp, `runs-${runs += 1}`), build: { commit: 'test', dirty: false }, ...(kind === 'desktop' ? { apps: [FIXTURE], appApprovals: store } : { sitePolicy: createSitePolicy({ startUrl: 'https://fixture.example/' }) }) })
  running = false
  await answering
  const events = readRun(result.trajectoryDir).events.filter((e) => e.kind === 'action' && e.status !== 'attempted')
  const text = readFileSync(join(result.trajectoryDir, 'events.jsonl'), 'utf8')
  return { asked, events, posted: environment.log.filter((x) => x && typeof x === 'object' && x.type && x.type !== 'screenshot').length, text }
}

const keys = (text) => [...text].map((ch) => ({ type: 'keypress', keys: [ch === '-' ? 'MINUS' : ch] }))
const types = (...parts) => parts.map((text) => ({ type: 'type', text }))
const verdicts = (events) => events.map((e) => (e.decision === 'allow' ? 'allow' : e.class))

for (const kind of ['desktop', 'browser']) {
  test(`CU-267 [${kind}]: a card typed as sixteen single-digit keypresses - the sixteenth asks, the first fifteen were posted`, async () => {
    const { events, posted } = await run(kind, keys(CARD_DIGITS))
    const v = verdicts(events)
    assert.deepEqual(v.slice(0, 15), Array(15).fill('allow'))
    assert.equal(v[15], 'sensitive_data', JSON.stringify(events[15]?.rule))
    assert.equal(posted, 15, 'the completing key never reached the app')
  })

  test(`CU-267 [${kind}]: four 'type' actions of four digits - the fourth asks`, async () => {
    const { events } = await run(kind, types(...CARD_DIGITS.match(/.{4}/g)))
    assert.deepEqual(verdicts(events), ['allow', 'allow', 'allow', 'sensitive_data'])
  })

  test(`CU-267 [${kind}]: an SSN typed around MINUS keys - the last group asks`, async () => {
    const [a, b, c] = SSN.split('-')
    const { events } = await run(kind, [...types(a), ...keys('-'), ...types(b), ...keys('-'), ...types(c)])
    assert.deepEqual(verdicts(events), ['allow', 'allow', 'allow', 'allow', 'sensitive_data'])
  })
}

test('CU-267: plain text typed in pieces is never asked; nor is a value the task itself gives', async () => {
  const plain = await run('desktop', [...types('hello ', 'there'), ...keys('ok')])
  assert.deepEqual(verdicts(plain.events), ['allow', 'allow', 'allow', 'allow'])
  const given = await run('desktop', types(...CARD_DIGITS.match(/.{4}/g)), { task: `enter card ${CARD_DIGITS} in the notes` })
  assert.deepEqual(verdicts(given.events), ['allow', 'allow', 'allow', 'allow'], 'the task names the value (the value rules\' own exemption)')
})

test('CU-267: only a different focused element or a cleared field starts afresh - a click back into the field, Return and a wait keep the buffer; Backspace takes back one character', async () => {
  const [left, right] = [CARD_DIGITS.slice(0, 8), CARD_DIGITS.slice(8)]
  const refocused = await run('desktop', [...types(left), { type: 'click', x: 500, y: 10, button: 'left' }, ...types(right)])
  assert.deepEqual(verdicts(refocused.events), ['allow', 'allow', 'allow'], 'another field: two halves in two fields')
  const tabbed = await run('desktop', [...types(left), { type: 'keypress', keys: ['TAB'] }, ...types(right)])
  assert.equal(verdicts(tabbed.events).at(-1), 'allow', 'Tab moved the focus: afresh by the focus change')
  const clickedBack = await run('desktop', [...types(left), { type: 'click', x: 10, y: 10, button: 'left' }, ...types(right)])
  assert.equal(verdicts(clickedBack.events).at(-1), 'sensitive_data', 'a click back into the same field keeps it (cu-developer-one\'s row)')
  const returned = await run('desktop', [...types(left), { type: 'keypress', keys: ['ENTER'] }, ...types(right)])
  assert.equal(verdicts(returned.events).at(-1), 'sensitive_data', 'Return that moves no focus keeps it')
  const waited = await run('desktop', [...types(left), { type: 'wait', duration_ms: 10 }, ...types(right)])
  assert.equal(verdicts(waited.events).at(-1), 'sensitive_data', 'a wait keeps it (cu-researcher\'s #79 row)')
  const replaced = await run('desktop', [...types(left), { type: 'keypress', keys: ['META', 'A'] }, ...types(right)])
  assert.equal(verdicts(replaced.events).at(-1), 'allow', 'select all: what follows replaces it')
  const corrected = await run('desktop', [...types(`${CARD_DIGITS.slice(0, 15)}9`), { type: 'keypress', keys: ['BACKSPACE'] }, ...keys(CARD_DIGITS.slice(15))])
  assert.equal(verdicts(corrected.events)[0], 'allow', 'a wrong last digit does not pass Luhn')
  assert.equal(verdicts(corrected.events).at(-1), 'sensitive_data', 'Backspace took the 9 back, so the right digit completes the card')
})

test('CU-267 [browser]: a run paste joins the buffer - type part of a card, paste the rest from the run clipboard: the paste asks', async () => {
  const [left, right] = [CARD_DIGITS.slice(0, 8), CARD_DIGITS.slice(8)]
  const { events, posted } = await run('browser', [...types(left), { type: 'keypress', keys: ['META', 'V'] }], { clipboard: right })
  assert.deepEqual(verdicts(events), ['allow', 'sensitive_data'])
  assert.equal(posted, 1, 'the paste never ran')
  const middle = await run('browser', [...types(CARD_DIGITS.slice(0, 4)), { type: 'keypress', keys: ['META', 'V'] }, ...types(CARD_DIGITS.slice(8))], { clipboard: CARD_DIGITS.slice(4, 8) })
  assert.deepEqual(verdicts(middle.events), ['allow', 'allow', 'sensitive_data'], 'the pasted middle stays in the buffer, so the typed end completes the card')
  const plain = await run('browser', [...types('order '), { type: 'keypress', keys: ['META', 'V'] }], { clipboard: 'notes' })
  assert.deepEqual(verdicts(plain.events), ['allow', 'allow'])
})

test('CU-267 [desktop]: a typed part plus a pasted rest is a named limit - the paste carries only its source class, never its text (D-031)', async () => {
  const after = await run('desktop', [...types(CARD_DIGITS.slice(0, 8)), { type: 'keypress', keys: ['META', 'V'] }])
  const alone = await run('desktop', [{ type: 'keypress', keys: ['META', 'V'] }])
  const judged = (e) => ({ decision: e?.decision, class: e?.class, rule: e?.rule, kind: e?.pasteboard?.kind })
  assert.equal(after.events.at(-1)?.pasteboard?.kind, 'paste', 'judged as a paste by its count and source, as before')
  assert.deepEqual(judged(after.events.at(-1)), judged(alone.events.at(-1)), 'the typed part changes nothing about the paste\'s verdict')
})

test('CU-267: once a value typed in pieces was asked and approved, typing on after it asks nothing more', async () => {
  const { asked, events } = await run('desktop', [...types(...CARD_DIGITS.match(/.{4}/g)), ...types(' thanks'), ...keys('ok')], { approve: true })
  assert.equal(asked, 1, 'one question, for the action that completed the card')
  assert.deepEqual(events.map((e) => e.status), ['done', 'done', 'done', 'done', 'done', 'done', 'done'])
})

test('CU-267: focus moving to another field by a key (no click) starts that field afresh', async () => {
  const { events } = await run('desktop', [...types(CARD_DIGITS.slice(0, 8)), { type: 'keypress', keys: ['ARROWDOWN'] }, ...types(CARD_DIGITS.slice(8))])
  assert.deepEqual(verdicts(events), ['allow', 'allow', 'allow'], 'each half in its own field')
})

test('CU-267: a focus that cannot be read keys the buffer by the frontmost app - the pieces still join; a click, Return or Tab starts afresh', async () => {
  const quarters = CARD_DIGITS.match(/.{4}/g)
  const joined = await run('desktop', types(...quarters), { unreadableFocus: true })
  assert.deepEqual(verdicts(joined.events), ['allow', 'allow', 'allow', 'sensitive_data'], 'no fail-open when no element reports focus (cu-researcher)')
  const keyed = await run('desktop', keys(CARD_DIGITS), { unreadableFocus: true })
  assert.equal(verdicts(keyed.events).at(-1), 'sensitive_data')
  for (const between of [{ type: 'click', x: 10, y: 10, button: 'left' }, { type: 'keypress', keys: ['ENTER'] }, { type: 'keypress', keys: ['TAB'] }]) {
    const split = await run('desktop', [...types(quarters[0], quarters[1]), between, ...types(quarters[2], quarters[3])], { unreadableFocus: true })
    assert.equal(verdicts(split.events).at(-1), 'allow', `${JSON.stringify(between)} may have moved an unreadable focus: afresh`)
  }
})

// CU-273 (cu-researcher): one buffer per field, so a detour through another field resumes the first.
test('CU-273: a detour through another field resumes the first field - Tab away, type there, Shift-Tab back: the other half asks', async () => {
  const [left, right] = [CARD_DIGITS.slice(0, 8), CARD_DIGITS.slice(8)]
  const tabbed = await run('desktop', [...types(left), { type: 'keypress', keys: ['TAB'] }, ...types('x'), { type: 'keypress', keys: ['SHIFT', 'TAB'] }, ...types(right)])
  assert.deepEqual(verdicts(tabbed.events), ['allow', 'allow', 'allow', 'allow', 'sensitive_data'])
  const clicked = await run('browser', [...types(left), { type: 'click', x: 500, y: 10, button: 'left' }, ...types('x'), { type: 'click', x: 10, y: 10, button: 'left' }, ...types(right)])
  assert.deepEqual(verdicts(clicked.events), ['allow', 'allow', 'allow', 'allow', 'sensitive_data'], 'a click detour, in the browser')
  const elsewhere = await run('desktop', [...types(left), { type: 'click', x: 500, y: 10, button: 'left' }, ...types(right)])
  assert.equal(verdicts(elsewhere.events).at(-1), 'allow', 'the other half in another field is still two fields')
})

test('CU-273: a desktop text area that grows between pieces is still one field, downward or upward - known by its column, not its fingerprint (cu-researcher)', async () => {
  for (const [direction, grow] of [['downward', (box) => ({ ...box, height: box.height + 30 })], ['upward (a bottom-anchored chat box)', (box) => ({ ...box, y: box.y - 30, height: box.height + 30 })]]) {
    const control = createRunControl()
    const environment = createFakeEnvironment({ kind: 'desktop', control })
    // The desktop fingerprint (and fieldKey, CU-194) hold the frame's size or top; the column - left edge and width - holds.
    let box = { x: 100, y: 400, width: 300, height: 30 }
    environment.focusedElement = async () => ({ origin: FIXTURE, pid: 601, role: 'AXTextArea', name: 'Message', editable: true, box, fingerprint: `m-${box.y}-${box.height}`, fieldKey: `k-${box.y}`, defaultButtonRead: true })
    const perform = environment.perform.bind(environment)
    environment.perform = async (action) => { const effect = await perform(action); box = grow(box); return effect }
    const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions: types(CARD_DIGITS.slice(0, 8), CARD_DIGITS.slice(8)) }, { final: 'done' }] })
    const result = await runTask({ task: 'write the message', environment, model, control, runsDirectory: join(tmp, `runs-${runs += 1}`), build: { commit: 'test', dirty: false }, apps: [FIXTURE], appApprovals: store })
    const events = readRun(result.trajectoryDir).events.filter((e) => e.kind === 'action' && e.status !== 'attempted')
    assert.deepEqual(verdicts(events), ['allow', 'sensitive_data'], direction)
  }
})

test('CU-273: the buffers are capped at 32 fields - the least recently typed field goes first (named limit)', async () => {
  const [left, right] = [CARD_DIGITS.slice(0, 8), CARD_DIGITS.slice(8)]
  const visit = (n) => Array.from({ length: n }, (_, i) => [{ type: 'click', x: 1000 + i, y: 10, button: 'left' }, ...types('x')]).flat()
  const within = await run('desktop', [...types(left), ...visit(31), { type: 'click', x: 10, y: 10, button: 'left' }, ...types(right)])
  assert.equal(verdicts(within.events).at(-1), 'sensitive_data', '31 other fields: the first is still kept')
  const beyond = await run('desktop', [...types(left), ...visit(32), { type: 'click', x: 10, y: 10, button: 'left' }, ...types(right)])
  assert.equal(verdicts(beyond.events).at(-1), 'allow', '32 other fields: the first was dropped')
})

test('CU-267: the field\'s buffer never reaches the run records', async () => {
  const { text } = await run('desktop', types(...CARD_DIGITS.match(/.{4}/g)))
  assert.equal(text.includes(CARD_DIGITS), false, 'the whole value is never written')
  assert.equal(/"typed"/.test(text), false, 'no typed context in the events')
})
