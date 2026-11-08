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
/** Run `actions` in one batch; a click at x < 100 focuses field A, any other click field B, and ARROWDOWN moves to B. */
async function run(kind, actions, { task = 'fill in the notes', approve = false } = {}) {
  const control = createRunControl()
  const environment = createFakeEnvironment({ kind, control, ...(kind === 'browser' ? { url: 'https://fixture.example/' } : {}) })
  const A = fieldOf(kind, 'Notes', 'field-a')
  const B = fieldOf(kind, 'Reference', 'field-b')
  let focus = A
  environment.focusedElement = async () => focus
  environment.inspectPoint = async ({ x }) => (x < 100 ? A : B)
  const perform = environment.perform.bind(environment)
  environment.perform = async (action) => {
    const effect = await perform(action)
    if (action.type === 'click') focus = action.x < 100 ? A : B
    if (action.type === 'keypress' && action.keys?.[0] === 'ARROWDOWN') focus = B
    return effect
  }
  const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions }, { final: 'done' }] })
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

test('CU-267: a new focus, a click, select all or Return starts afresh; Backspace takes back one character', async () => {
  const [left, right] = [CARD_DIGITS.slice(0, 8), CARD_DIGITS.slice(8)]
  const refocused = await run('desktop', [...types(left), { type: 'click', x: 500, y: 10, button: 'left' }, ...types(right)])
  assert.deepEqual(verdicts(refocused.events), ['allow', 'allow', 'allow'], 'another field: two halves in two fields')
  const clickedBack = await run('desktop', [...types(left), { type: 'click', x: 10, y: 10, button: 'left' }, ...types(right)])
  assert.deepEqual(verdicts(clickedBack.events), ['allow', 'allow', 'allow'], 'a click in the same field may move the caret: afresh')
  const replaced = await run('desktop', [...types(left), { type: 'keypress', keys: ['META', 'A'] }, ...types(right)])
  assert.deepEqual(verdicts(replaced.events).at(-1), 'allow', 'select all: what follows replaces it')
  const returned = await run('desktop', [...types(left), { type: 'keypress', keys: ['ENTER'] }, ...types(right)])
  assert.deepEqual(verdicts(returned.events).at(-1), 'allow')
  const corrected = await run('desktop', [...types(`${CARD_DIGITS.slice(0, 15)}9`), { type: 'keypress', keys: ['BACKSPACE'] }, ...keys(CARD_DIGITS.slice(15))])
  assert.equal(verdicts(corrected.events)[0], 'allow', 'a wrong last digit does not pass Luhn')
  assert.equal(verdicts(corrected.events).at(-1), 'sensitive_data', 'Backspace took the 9 back, so the right digit completes the card')
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

test('CU-267: the field\'s buffer never reaches the run records', async () => {
  const { text } = await run('desktop', types(...CARD_DIGITS.match(/.{4}/g)))
  assert.equal(text.includes(CARD_DIGITS), false, 'the whole value is never written')
  assert.equal(/"typed"/.test(text), false, 'no typed context in the events')
})
