import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { defaultCandidatesOf, formContextOf } from '../../_environments_/macos-desktop/environment.mjs'
import { createScriptedAdapter } from '../../_tools_/agent-core/adapter-scripted.mjs'
import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createRunControl } from '../../_tools_/agent-core/control.mjs'
import { runTask } from '../../_tools_/agent-core/loop.mjs'
import { fakeLauncher, logged, scratchLocks, stopFake } from './harness.mjs'

/**
 * CU-409 (helper 0.2.68): the desktop half of CU-402/CU-405's formContext. The helper reads a pressed button's form
 * (FormContext: at most 3 selected pop-up or combo box texts, and whether an entry's label words name an amount - never
 * its value); the driver validates it (formContextOf) and passes it on the target and on a default button, the shape
 * the chrome driver gives, so agent core's trade rules judge a bare 'Sell' in a native or web panel alike. On the fake
 * helper, and across the real seam through runTask.
 */

const FIXTURE = 'ai.reflection.cu.fixture'
const locks = scratchLocks()
const dir = mkdtempSync(join(tmpdir(), 'cu-form-context-'))
after(() => { locks.remove(); rmSync(dir, { recursive: true, force: true }) })
const launchOnFake = fakeLauncher(locks, { apps: [FIXTURE] })
const inputs = (child) => child.requests.filter((r) => r.type === 'input').length

const SELL = { bundleId: FIXTURE, pid: 601, role: 'AXButton', subrole: null, title: 'Sell', frame: { x: 100, y: 100, width: 120, height: 30 }, secure: false, editable: false }
const ASSET = { options: ['BTC'], amountEntry: true }
const world = (elements, extra = {}) => ({
  displays: [{ id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 800, height: 600 }, scale: 1 }],
  apps: [{ bundleId: FIXTURE, pid: 601, title: 'Fixture', rect: { x: 0, y: 0, width: 800, height: 600 } }],
  frontmost: FIXTURE,
  elements: elements.map((element) => ({ rect: element.frame, element })),
  ...extra,
})

test('CU-409 driver: formContextOf keeps the chrome shape - at most 3 trimmed texts of at most 24 characters and a boolean amountEntry; malformed or empty is null', () => {
  assert.deepEqual(formContextOf({ options: [' BTC ', 'USD'], amountEntry: true }), { options: ['BTC', 'USD'], amountEntry: true })
  assert.deepEqual(formContextOf({ options: ['A', 'B', 'C', 'D'], amountEntry: false }), { options: ['A', 'B', 'C'], amountEntry: false })
  assert.deepEqual(formContextOf({ options: ['', 'x'.repeat(25), 7, 'ETH'], amountEntry: false }), { options: ['ETH'], amountEntry: false })
  assert.deepEqual(formContextOf({ options: [], amountEntry: true }), { options: [], amountEntry: true })
  for (const bad of [null, undefined, 'BTC', [], { options: 'BTC', amountEntry: true }, { options: ['BTC'] }, { options: ['BTC'], amountEntry: 'yes' }, { options: [], amountEntry: false }, { options: [''], amountEntry: false }]) {
    assert.equal(formContextOf(bad), null, JSON.stringify(bad))
  }
})

async function hit(value) {
  const { env, child } = await launchOnFake(world([value]))
  try {
    await logged(child, 3)
    return await env.inspectPoint({ x: 150, y: 115 })
  } finally {
    await env.close()
    await stopFake(child)
  }
}

test('CU-409 driver: a button\'s formContext reaches the target; a malformed one carries none', async () => {
  assert.deepEqual((await hit({ ...SELL, formContext: ASSET })).formContext, ASSET)
  assert.equal((await hit({ ...SELL, formContext: { options: 'BTC', amountEntry: true } })).formContext, undefined)
  assert.equal((await hit(SELL)).formContext, undefined, 'an older helper: no key')
})

let runs = 0
async function runOnFake(config, action) {
  const control = createRunControl()
  const { env, child } = await launchOnFake(config, { control })
  await logged(child, 3)
  try {
    const store = createAppApprovals({ path: join(dir, `approvals-${runs += 1}.json`) })
    store.grantAlways(FIXTURE, { by: 'api' })
    const model = createScriptedAdapter({ frame: { width: env.frame.width, height: env.frame.height }, turns: [{ actions: [action] }, { final: 'done' }] })
    const result = await runTask({ task: 'trade', environment: env, model, control, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false }, apps: [FIXTURE], appApprovals: store, askPermission: async () => false })
    const text = readFileSync(join(result.trajectoryDir, 'events.jsonl'), 'utf8')
    const events = text.trim().split('\n').map((line) => JSON.parse(line))
    const event = events.filter((e) => e.kind === 'action' && e.action?.type === action.type && e.status !== 'attempted').pop()
    return { event, posted: inputs(child), text }
  } finally {
    await env.close()
    await stopFake(child)
  }
}

const summary = (e) => JSON.stringify({ decision: e?.decision, rule: e?.rule, class: e?.class, status: e?.status })
const CLICK = { type: 'click', button: 'left', x: 150, y: 115 }

test('CU-409 seam: a bare Sell beside an asset pop-up (formContext from the helper) asks purchase and, declined, posts nothing; the same Sell with no form stays free', async () => {
  const asked = await runOnFake(world([{ ...SELL, formContext: ASSET }]), CLICK)
  assert.notEqual(asked.event?.decision, 'allow', summary(asked.event))
  assert.match(String(asked.event?.class ?? asked.event?.rule ?? ''), /purchase/, summary(asked.event))
  assert.equal(asked.posted, 0)
  assert.ok(!asked.text.includes('"formContext"'), 'the form context never reaches the run records')
  const free = await runOnFake(world([SELL]), CLICK)
  assert.equal(free.event?.decision, 'allow', summary(free.event))
})

test('CU-409 seam: Return in the amount field presses a default Sell that carries its form - asked like the click (D-106)', async () => {
  const amount = { bundleId: FIXTURE, pid: 601, role: 'AXTextField', subrole: null, title: 'Amount', frame: { x: 100, y: 60, width: 120, height: 24 }, secure: false, editable: true }
  const config = world([amount, { ...SELL, formContext: ASSET }], { focused: amount, defaultButton: { ...SELL, formContext: ASSET } })
  const { event, posted } = await runOnFake(config, { type: 'keypress', keys: ['Return'] })
  assert.notEqual(event?.decision, 'allow', summary(event))
  assert.match(String(event?.class ?? event?.rule ?? ''), /purchase/, summary(event))
  assert.equal(posted, 0)
  // The same Return with the default Sell read but no form beside it: what decides is the form context.
  const plain = await runOnFake(world([amount, SELL], { focused: amount, defaultButton: SELL }), { type: 'keypress', keys: ['Return'] })
  assert.doesNotMatch(String(plain.event?.class ?? plain.event?.rule ?? ''), /purchase/, summary(plain.event))
})

test('CU-412 driver: defaultCandidatesOf keeps two or three readable buttons (role, name, panel, formContext); fewer, more or malformed is null', () => {
  const del = { role: 'AXButton', title: 'Delete account' }
  const keep = { role: 'AXButton', title: 'Keep account', formContext: { options: ['Pro'], amountEntry: false } }
  assert.deepEqual(defaultCandidatesOf([del, keep]), [{ role: 'AXButton', name: 'Delete account', panel: null }, { role: 'AXButton', name: 'Keep account', panel: null, formContext: { options: ['Pro'], amountEntry: false } }])
  assert.equal(defaultCandidatesOf([del]), null, 'one is the default button, never a candidate list')
  assert.equal(defaultCandidatesOf([del, keep, del, keep]), null, 'four are more (the helper says defaultCandidatesMore)')
  assert.equal(defaultCandidatesOf([del, { title: 'x' }]), null, 'an unreadable entry voids the list')
  assert.equal(defaultCandidatesOf('Delete'), null)
})

test('CU-412 driver: the focused target carries defaultCandidates and defaultCandidatesMore from the helper; an older helper carries neither', async () => {
  const field = { bundleId: FIXTURE, pid: 601, role: 'AXTextField', subrole: null, title: 'Confirm', frame: { x: 100, y: 60, width: 120, height: 24 }, secure: false, editable: true, inWebArea: true }
  const del = { ...SELL, title: 'Delete account' }
  const keep = { ...SELL, title: 'Cancel' }
  async function focus(extra) {
    const { env, child } = await launchOnFake(world([field], { focused: field, defaultButton: null, ...extra }))
    try { await logged(child, 3); return await env.focusedElement() } finally { await env.close(); await stopFake(child) }
  }
  const two = await focus({ defaultCandidates: [del, keep] })
  assert.deepEqual(two.defaultCandidates.map((one) => one.name), ['Delete account', 'Cancel'])
  assert.equal(two.defaultCandidatesMore, undefined)
  const more = await focus({ defaultCandidatesMore: true })
  assert.equal(more.defaultCandidatesMore, true)
  assert.equal(more.defaultCandidates, undefined)
  const old = await focus({})
  assert.equal(Object.hasOwn(old, 'defaultCandidates') || Object.hasOwn(old, 'defaultCandidatesMore'), false)
})
