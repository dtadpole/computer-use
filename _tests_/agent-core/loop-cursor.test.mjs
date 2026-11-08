import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'

import { createScriptedAdapter } from '../../_tools_/agent-core/adapter-scripted.mjs'
import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createRunControl } from '../../_tools_/agent-core/control.mjs'
import { createFakeEnvironment } from '../../_tools_/agent-core/fake-env.mjs'
import { runTask } from '../../_tools_/agent-core/loop.mjs'
import { readRun } from '../../_tools_/agent-core/trajectory.mjs'

// CU-125 (input-vocabulary.md): where the environment answers cursor_position (the desktop driver asks the helper),
// the model is told the real cursor - a frame point, off the frame, or unknown - and the event records it with its source.

const FIXTURE = 'ai.reflection.cu.fixture'
let dir
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'cu-cursor-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

async function run({ answers, actionTypes = true }) {
  const control = createRunControl()
  const environment = createFakeEnvironment({ kind: 'desktop', control })
  if (actionTypes) environment.actionTypes = Object.freeze(['click', 'move', 'wait', 'screenshot', 'cursor_position'])
  const perform = environment.perform.bind(environment)
  const asked = []
  environment.perform = async (action) => {
    if (action.type !== 'cursor_position') return perform(action)
    const next = answers.shift()
    asked.push(action)
    if (next instanceof Error) throw next
    return next
  }
  const inputs = []
  let turn = 0
  const model = createScriptedAdapter((input) => {
    inputs.push(input)
    turn += 1
    return turn === 1 ? { actions: [{ type: 'move', x: 100, y: 200 }, { type: 'cursor_position' }] } : { final: 'ok\nOUTCOME: done' }
  })
  const store = createAppApprovals({ path: join(dir, 'app-approvals.json') })
  store.grantAlways(FIXTURE, { by: 'api' })
  const result = await runTask({ task: 'where', environment, model, control, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false }, apps: [FIXTURE], appApprovals: store, consent: { mode: 'unattended' } })
  const event = readRun(result.trajectoryDir).events.find((e) => e.kind === 'action' && e.action?.type === 'cursor_position')
  const told = inputs.find((i) => i.results)?.results?.[1]
  return { event, told, asked }
}

test('the helper\'s point is what the model is told, not agent core\'s last pointer', async () => {
  const { event, told, asked } = await run({ answers: [{ cursor: { x: 240, y: 172 }, source: 'helper' }] })
  assert.equal(asked.length, 1)
  assert.equal(told.message, '240,172', 'the real cursor, though the last move went to 100,200')
  assert.deepEqual([event.cursor, event.source, event.offFrame], [{ x: 240, y: 172 }, 'helper', undefined])
})

test('off the frame: the model hears that, with no coordinates', async () => {
  const { event, told } = await run({ answers: [{ cursor: null, offFrame: true, source: 'helper' }] })
  assert.match(told.message, /^off the frame/)
  assert.doesNotMatch(told.message, /\d/)
  assert.deepEqual([event.cursor, event.offFrame, event.source], [null, true, 'helper'])
})

test('an older helper\'s fallback is labelled last_pointer', async () => {
  const { event, told } = await run({ answers: [{ cursor: { x: 100, y: 200 }, source: 'last_pointer' }] })
  assert.equal(told.message, '100,200 (last sent, not measured)', 'an estimate says so')
  assert.equal(event.source, 'last_pointer')
})

test('a failed ask fails the action and stops the batch; it is not answered from memory', async () => {
  const { event, told } = await run({ answers: [Object.assign(new Error('the helper is gone'), { code: 'helper_lost' })] })
  assert.equal(told.status, 'failed')
  assert.equal(told.code, 'helper_lost')
  assert.equal(event.status, 'failed')
})

test('an environment that does not answer keeps agent core\'s last pointer', async () => {
  const { event, told, asked } = await run({ answers: [], actionTypes: false })
  assert.equal(asked.length, 0)
  assert.equal(told.message, '100,200 (last sent, not measured)')
  assert.equal(event.source, 'last_pointer')
})
