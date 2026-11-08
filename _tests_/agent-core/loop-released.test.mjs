import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'

import { createScriptedAdapter } from '../../_tools_/agent-core/adapter-scripted.mjs'
import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createRunControl } from '../../_tools_/agent-core/control.mjs'
import { createFakeEnvironment } from '../../_tools_/agent-core/fake-env.mjs'
import { runTask } from '../../_tools_/agent-core/loop.mjs'

// CU-45: a stopped drag reports where its held button came up, and says the drop may have happened unless it came up
// where it went down - in the trajectory and to the model, rather than a bare refusal.

const FIXTURE = 'ai.reflection.cu.fixture'
const frame = { width: 1440, height: 900 }
const drag = { type: 'drag', path: [{ x: 100, y: 100 }, { x: 400, y: 300 }] }
let dir
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'cu-loop-released-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

async function runStoppedDrag(details) {
  const control = createRunControl()
  const environment = createFakeEnvironment({ kind: 'desktop', control })
  const store = createAppApprovals({ path: join(dir, 'app-approvals.json') })
  store.grantAlways(FIXTURE, { by: 'api' })
  const inputs = []
  const model = createScriptedAdapter({ frame, turns: [{ actions: [drag] }, { final: 'done' }] })
  const spy = {
    ...model,
    async open(options) {
      const session = await model.open(options)
      return { ...session, async next(input = {}, opts = {}) { inputs.push(input); return session.next(input, opts) } }
    },
  }
  const realPerform = environment.perform.bind(environment)
  environment.perform = async (action) => {
    if (action.type === 'drag') {
      throw Object.assign(new Error('a window of ai.reflection.cu.ledger covers the point'), { code: 'out_of_scope', details: { reason: 'target_out_of_scope', bundleId: 'ai.reflection.cu.ledger', ...details } })
    }
    return realPerform(action)
  }
  const result = await runTask({ task: 'drag the parcel', environment, model: spy, control, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false }, apps: [FIXTURE], appApprovals: store })
  const events = readFileSync(join(result.trajectoryDir, 'events.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line))
  const failed = events.find((e) => e.kind === 'action' && e.status === 'failed')
  const notes = inputs.flatMap((input) => input.notes ?? [])
  return { failed, notes }
}

test('a drag stopped by the person releases where their pointer is: the event and the model say the drop may have happened', async () => {
  const { failed, notes } = await runStoppedDrag({ cancelledDrag: true, releasedAt: { x: 602, y: 258 }, releasedAtPress: false })
  assert.deepEqual(failed.released, { at: { x: 602, y: 258 }, cancelledDrag: true, atPress: false })
  assert.equal(failed.effectUncertain, true)
  assert.ok(notes.some((note) => /may have happened/.test(note)), 'the model is told to check before repeating')
})

test('a drag the helper returned to its press point is reported as released there, with no uncertainty', async () => {
  const { failed, notes } = await runStoppedDrag({ cancelledDrag: true, releasedAt: { x: 100, y: 100 }, releasedAtPress: true })
  assert.deepEqual(failed.released, { at: { x: 100, y: 100 }, cancelledDrag: true, atPress: true })
  assert.equal(failed.effectUncertain, false)
  assert.ok(!notes.some((note) => /may have happened/.test(note)))
})

test('an older driver that names releasedAt without releasedAtPress is reported conservatively as uncertain', async () => {
  const { failed, notes } = await runStoppedDrag({ cancelledDrag: true, releasedAt: { x: 100, y: 100 } })
  assert.equal(failed.released.atPress, false)
  assert.equal(failed.effectUncertain, true)
  assert.ok(notes.some((note) => /may have happened/.test(note)))
})

test('a refusal with no release (nothing was pressed) carries no released record', async () => {
  const { failed } = await runStoppedDrag({})
  assert.equal(failed.released, undefined)
  assert.equal(failed.effectUncertain, undefined)
})
