import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { dialogTextOf } from '../../_environments_/macos-desktop/environment.mjs'
import { createScriptedAdapter } from '../../_tools_/agent-core/adapter-scripted.mjs'
import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createRunControl } from '../../_tools_/agent-core/control.mjs'
import { runTask } from '../../_tools_/agent-core/loop.mjs'
import { fakeLauncher, logged, scratchLocks, stopFake } from './harness.mjs'

/**
 * CU-507 (helper 0.2.70, the desktop half): a button inside an AXSheet or a dialog window carries the dialog's words -
 * dialogName (the container's title, else its first static text) and dialogDescription (the next static text), read by
 * the helper (DialogText) - on the target and on Return's default button, the seam the web route gives, so agent core
 * judges a generic 'OK' in a native alert as it does in a role=alertdialog. On the fake helper.
 */

const FIXTURE = 'ai.reflection.cu.fixture'
const locks = scratchLocks()
const dir = mkdtempSync(join(tmpdir(), 'cu-dialog-text-'))
after(() => { locks.remove(); rmSync(dir, { recursive: true, force: true }) })
const launchOnFake = fakeLauncher(locks, { apps: [FIXTURE] })

const OK = { bundleId: FIXTURE, pid: 601, role: 'AXButton', subrole: null, title: 'OK', frame: { x: 100, y: 100, width: 80, height: 30 }, secure: false, editable: false }
const ERASE = { dialogName: 'Erase "Untitled"?', dialogDescription: 'This will erase all data on the disk.' }
const world = (elements, extra = {}) => ({
  displays: [{ id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 800, height: 600 }, scale: 1 }],
  apps: [{ bundleId: FIXTURE, pid: 601, title: 'Fixture', rect: { x: 0, y: 0, width: 800, height: 600 } }],
  frontmost: FIXTURE,
  elements: elements.map((element) => ({ rect: element.frame, element })),
  ...extra,
})

test('CU-507 driver: dialogTextOf collapses whitespace, trims, drops control characters and keeps at most 300 characters; empty or not a string is null', () => {
  assert.equal(dialogTextOf('  Erase  "Untitled"?\n'), 'Erase "Untitled"?')
  assert.equal(dialogTextOf('Delete\u0000 3 items?'), 'Delete 3 items?')
  assert.equal(dialogTextOf('x'.repeat(301)).length, 300)
  for (const bad of [null, undefined, '', '   ', 7, ['OK'], { text: 'OK' }]) assert.equal(dialogTextOf(bad), null, JSON.stringify(bad))
})

async function hit(value) {
  const { env, child } = await launchOnFake(world([value]))
  try {
    await logged(child, 3)
    return await env.inspectPoint({ x: 140, y: 115 })
  } finally {
    await env.close()
    await stopFake(child)
  }
}

test('CU-507 driver: a button\'s dialog words reach the target; each absent key stays absent (an older helper, or a button outside any dialog)', async () => {
  const read = await hit({ ...OK, ...ERASE })
  assert.equal(read.dialogName, 'Erase "Untitled"?')
  assert.equal(read.dialogDescription, 'This will erase all data on the disk.')
  const nameOnly = await hit({ ...OK, dialogName: 'Software Update' })
  assert.equal(nameOnly.dialogName, 'Software Update')
  assert.equal(Object.hasOwn(nameOnly, 'dialogDescription'), false)
  const plain = await hit(OK)
  assert.equal(Object.hasOwn(plain, 'dialogName') || Object.hasOwn(plain, 'dialogDescription'), false, 'an older helper: no key')
  const blank = await hit({ ...OK, dialogName: '   ', dialogDescription: 5 })
  assert.equal(Object.hasOwn(blank, 'dialogName') || Object.hasOwn(blank, 'dialogDescription'), false, 'malformed reads as none')
})

test('CU-507 driver: Return\'s default button carries its dialog words too (D-106: judged like the click)', async () => {
  const field = { bundleId: FIXTURE, pid: 601, role: 'AXTextField', subrole: null, title: 'Name', frame: { x: 100, y: 60, width: 120, height: 24 }, secure: false, editable: true }
  const { env, child } = await launchOnFake(world([field, { ...OK, ...ERASE }], { focused: field, defaultButton: { ...OK, ...ERASE } }))
  try {
    await logged(child, 3)
    const focus = await env.focusedElement()
    assert.equal(focus.defaultButton?.name, 'OK')
    assert.equal(focus.defaultButton?.dialogName, 'Erase "Untitled"?')
    assert.equal(focus.defaultButton?.dialogDescription, 'This will erase all data on the disk.')
  } finally {
    await env.close()
    await stopFake(child)
  }
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
    const result = await runTask({ task: 'answer the dialog', environment: env, model, control, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false }, apps: [FIXTURE], appApprovals: store, askPermission: async () => ({ approved: false, answeredBy: 'test' }) })
    const text = readFileSync(join(result.trajectoryDir, 'events.jsonl'), 'utf8')
    const events = text.trim().split('\n').map((line) => JSON.parse(line))
    const event = events.filter((e) => e.kind === 'action' && e.action?.type === action.type && e.status !== 'attempted').pop()
    return { event, posted: child.requests.filter((r) => r.type === 'input').length, text }
  } finally {
    await env.close()
    await stopFake(child)
  }
}

const summary = (e) => JSON.stringify({ decision: e?.decision, rule: e?.rule, class: e?.class, status: e?.status })
const CLICK = { type: 'click', button: 'left', x: 140, y: 115 }

test('CU-507 seam: a generic OK in an erase sheet (dialog words from the helper) asks delete and, declined, posts nothing; the same OK under a benign dialog stays free', async () => {
  const asked = await runOnFake(world([{ ...OK, ...ERASE }]), CLICK)
  assert.notEqual(asked.event?.decision, 'allow', summary(asked.event))
  assert.match(String(asked.event?.class ?? asked.event?.rule ?? ''), /delete/, summary(asked.event))
  assert.equal(asked.posted, 0)
  assert.ok(!asked.text.includes('This will erase all data'), 'the dialog words never reach the run records')
  const free = await runOnFake(world([{ ...OK, dialogName: 'Software Update', dialogDescription: 'Restart later to finish.' }]), CLICK)
  assert.equal(free.event?.decision, 'allow', summary(free.event))
})

test('CU-507 seam: Return in the sheet presses its default OK, which carries the dialog words - asked like the click (D-106)', async () => {
  const field = { bundleId: FIXTURE, pid: 601, role: 'AXTextField', subrole: null, title: 'Name', frame: { x: 100, y: 60, width: 120, height: 24 }, secure: false, editable: true }
  const { event, posted } = await runOnFake(world([field, { ...OK, ...ERASE }], { focused: field, defaultButton: { ...OK, ...ERASE } }), { type: 'keypress', keys: ['Return'] })
  assert.notEqual(event?.decision, 'allow', summary(event))
  assert.match(String(event?.class ?? event?.rule ?? ''), /delete/, summary(event))
  assert.equal(posted, 0)
})
