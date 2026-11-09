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
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'
import { createSitePolicy } from '../../_tools_/agent-core/sites.mjs'
import { readRun } from '../../_tools_/agent-core/trajectory.mjs'
import { namesPasswordField } from '../../_tools_/agent-core/policy.mjs'

/**
 * CU-349 (agent-core half; cu-coordinator 15:55Z: upgrade only): an entry's placeholder (helper 0.2.63) is an extra name
 * for the field-name rules - it adds an ask, never removes one - and the loop keeps a field's placeholder by its key, so a
 * box that drops the placeholder once typed into is judged under the same names.
 */

const FIXTURE = 'ai.reflection.cu.fixture'
const tmp = mkdtempSync(join(tmpdir(), 'cu-349-'))
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



const policy = createPolicy({ sitePolicy: () => 'allow' })
const typed = (target) => { const r = policy.classify({ type: 'type', text: '482' }, { url: 'https://shop.example/pay', target: { tag: 'input', role: 'textbox', editable: true, ...target } }); return r.decision === 'allow' ? 'allow' : r.class }

test('CU-349: a placeholder-only CVV, one-time code, PIN or Sicherheitscode box asks', () => {
  for (const placeholder of ['CVV', 'One-time code', 'PIN', 'Sicherheitscode', 'Account number']) assert.notEqual(typed({ name: null, placeholder }), 'allow', placeholder)
})

test('CU-349 upgrade only: a generic title with a sensitive placeholder asks; a sensitive title with a benign one still asks', () => {
  assert.notEqual(typed({ name: 'Notes', placeholder: 'CVV' }), 'allow')
  assert.notEqual(typed({ name: 'Security code', placeholder: 'e.g. 123' }), 'allow')
  assert.notEqual(typed({ name: 'Password', placeholder: 'hint: your pet' }), 'allow')
})

test('CU-349 negatives: a search box and an ordinary placeholder stay free', () => {
  assert.equal(typed({ name: null, placeholder: 'Search' }), 'allow')
  assert.equal(typed({ name: 'Notes', placeholder: 'Write something' }), 'allow')
})

test('CU-349: a placeholder-named Password box counts as a password field (it enters the password memory)', () => {
  assert.equal(namesPasswordField({ tag: 'input', role: 'textbox', editable: true, name: null, placeholder: 'Password' }), true)
  assert.equal(namesPasswordField({ tag: 'input', role: 'textbox', editable: true, name: null, placeholder: 'Password hint' }), false)
})

test('CU-349 typed state: a box that drops its placeholder after the first key is judged under it for the next key', async () => {
  const control = createRunControl()
  const environment = createFakeEnvironment({ kind: 'browser', control, url: 'https://fixture.example/' })
  let typedOnce = false
  const box = () => ({ origin: 'https://fixture.example', role: 'textbox', tag: 'input', name: null, editable: true, fingerprint: 'cvv-box', fieldKey: 'k-cvv', ...(typedOnce ? {} : { placeholder: 'CVV' }) })
  environment.focusedElement = async () => box()
  environment.inspectPoint = async () => box()
  const perform = environment.perform.bind(environment)
  environment.perform = async (action) => { const effect = await perform(action); if (action.type === 'type') typedOnce = true; return effect }
  const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions: [{ type: 'type', text: '48' }, { type: 'type', text: '2' }] }, { final: 'done' }] })
  const controller = apiController()
  let running = true
  const answering = (async () => { while (running) { const request = await controller.waitForRequest(200).catch(() => null); if (request) controller.respond({ id: request.id, approved: true }) } })()
  const result = await runTask({ task: 'fill in the form', environment, model, control, controller, runsDirectory: join(tmp, 'runs-typed'), build: { commit: 'test', dirty: false }, sitePolicy: createSitePolicy({}) })
  running = false
  await answering
  const verdicts = readRun(result.trajectoryDir).events.filter((e) => e.kind === 'action' && e.status !== 'attempted' && e.action?.type === 'type').map((e) => (e.decision === 'allow' ? 'allow' : e.class))
  assert.equal(verdicts.length, 2, JSON.stringify(verdicts))
  assert.ok(verdicts.every((v) => v !== 'allow'), JSON.stringify(verdicts))
})
