import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { createScriptedAdapter } from '../../_tools_/agent-core/adapter-scripted.mjs'
import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createRunControl } from '../../_tools_/agent-core/control.mjs'
import { runTask } from '../../_tools_/agent-core/loop.mjs'
import { fakeLauncher, logged, scratchLocks, stopFake } from './harness.mjs'

// CU-190: an unreadable default button must not look like none. The driver carries the helper's defaultButtonRead as a
// strict boolean beside defaultButton and outside the fingerprint; agent core asks on false. CU-215: since D-069's floor
// every accepted helper sends the boolean, so anything else - the field missing or malformed - reads as false, never as
// an older helper. These pin the driver half; the policy half and the live row are cu-developer-one's and cu-verifier's.

const FIXTURE = 'ai.reflection.cu.fixture'
const locks = scratchLocks()
const dir = mkdtempSync(join(tmpdir(), 'cu-db-read-'))
after(() => { locks.remove(); rmSync(dir, { recursive: true, force: true }) })
const launchOnFake = fakeLauncher(locks, { apps: [FIXTURE] })

const FIELD = { bundleId: FIXTURE, pid: 601, role: 'AXTextField', subrole: null, title: 'Message', frame: { x: 20, y: 400, width: 300, height: 24 }, secure: false, editable: true }
const SEND = { bundleId: FIXTURE, pid: 601, role: 'AXButton', subrole: null, title: 'Send', frame: { x: 340, y: 400, width: 60, height: 24 }, secure: false }
const world = (extra) => ({
  displays: [{ id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 800, height: 600 }, scale: 1 }],
  apps: [{ bundleId: FIXTURE, pid: 601, title: 'Fixture', rect: { x: 0, y: 0, width: 800, height: 600 } }],
  frontmost: FIXTURE,
  elements: [{ rect: FIELD.frame, element: FIELD }, { rect: SEND.frame, element: SEND }],
  focused: FIELD,
  ...extra,
})

async function focused(config) {
  const { env, child } = await launchOnFake(config)
  try {
    await logged(child, 3)
    return await env.focusedElement()
  } finally {
    await env.close()
    await stopFake(child)
  }
}

test('CU-190: the focused target carries the helper\'s defaultButtonRead - true and false as sent, beside the default button', async () => {
  for (const read of [true, false]) {
    const target = await focused(world({ defaultButton: SEND, defaultButtonRead: read }))
    assert.equal(target.defaultButtonRead, read, `read ${read}`)
    assert.deepEqual(target.defaultButton, { role: 'AXButton', name: 'Send', panel: null })
  }
  // An unreadable button with nothing to show: false, and no default button - not the same as a positive none.
  const unread = await focused(world({ defaultButtonRead: false }))
  assert.deepEqual([unread.defaultButton, unread.defaultButtonRead], [null, false])
  const none = await focused(world({ defaultButtonRead: true }))
  assert.deepEqual([none.defaultButton, none.defaultButtonRead], [null, true])
})

test('CU-215: anything but a strict boolean reads as false (unreadable) - the field missing or malformed is a deviation, not an older helper', async () => {
  assert.equal((await focused(world({ defaultButton: SEND, quirks: { omitDefaultButtonRead: true } }))).defaultButtonRead, false, 'field absent')
  for (const value of ['false', 'true', 0, 1, '', {}, null]) {
    assert.equal((await focused(world({ defaultButton: SEND, defaultButtonRead: value }))).defaultButtonRead, false, JSON.stringify(value))
  }
})

test('CU-190: defaultButtonRead is context, not identity - the fingerprint is the same whatever it says', async () => {
  const prints = new Set()
  for (const extra of [{ quirks: { omitDefaultButtonRead: true } }, { defaultButtonRead: true }, { defaultButtonRead: false }]) prints.add((await focused(world({ defaultButton: SEND, ...extra }))).fingerprint)
  assert.equal(prints.size, 1)
})

test('CU-190: with no focused element, a failed read makes the placeholder too - Return still presses the window\'s default button', async () => {
  const app = { bundleId: FIXTURE, pid: 601 }
  const unread = await focused(world({ focused: null, defaultButtonRead: false, focusedApp: app }))
  assert.deepEqual([unread?.noFocus, unread?.defaultButton, unread?.defaultButtonRead, unread?.role, unread?.name], [true, null, false, null, null])
  // A positive none keeps today's answer: no placeholder. A missing field (CU-215) is no longer silence: it makes one.
  assert.equal(await focused(world({ focused: null, defaultButtonRead: true, focusedApp: app })), null)
  const missing = await focused(world({ focused: null, focusedApp: app, quirks: { omitDefaultButtonRead: true } }))
  assert.deepEqual([missing?.noFocus, missing?.defaultButtonRead], [true, false])
  const placeholder = await focused(world({ focused: null, defaultButton: SEND, defaultButtonRead: true, focusedApp: { bundleId: FIXTURE, pid: 601 } }))
  assert.deepEqual([placeholder.noFocus, placeholder.defaultButtonRead, placeholder.defaultButton?.name], [true, true, 'Send'])
})

test('CU-190 seam: a Return with nothing focused and an unread default button is asked and never posted; a positive none posts it as today; CU-215: a missing field is asked like an unread one', async () => {
  const results = {}
  for (const [label, extra] of [['unread', { defaultButtonRead: false }], ['none', { defaultButtonRead: true }], ['missing', { quirks: { omitDefaultButtonRead: true } }]]) {
    const control = createRunControl()
    const { env, child } = await launchOnFake(world({ elements: [], focused: null, focusedApp: { bundleId: FIXTURE, pid: 601 }, ...extra }), { control })
    try {
      await logged(child, 3)
      const store = createAppApprovals({ path: join(dir, `approvals-${label}.json`) })
      store.grantAlways(FIXTURE, { by: 'api' })
      const model = createScriptedAdapter({ frame: { width: env.frame.width, height: env.frame.height }, turns: [{ actions: [{ type: 'keypress', keys: ['ENTER'] }] }, { final: 'done' }] })
      const result = await runTask({ task: 'send it', environment: env, model, control, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false }, apps: [FIXTURE], appApprovals: store })
      const events = readFileSync(join(result.trajectoryDir, 'events.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line))
      const event = events.filter((e) => e.kind === 'action' && e.action?.type === 'keypress' && e.status !== 'attempted').pop()
      results[label] = [event?.decision, child.requests.filter((r) => r.type === 'input').length]
    } finally {
      await env.close()
      await stopFake(child)
    }
  }
  // Today's policy already refuses the placeholder as an undescribed target; cu-developer-one's line will name the reason.
  assert.deepEqual(results, { unread: ['confirm', 0], none: ['allow', 1], missing: ['confirm', 0] })
})
