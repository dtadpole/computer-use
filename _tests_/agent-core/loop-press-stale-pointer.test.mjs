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

// CU-64 D5: after a pause or a take-over the last pointer agent core sent is stale - the person may have moved the
// mouse - so a press with no fresh mouse_move in its batch is refused 'move the pointer first'.

const FIXTURE = 'ai.reflection.cu.fixture'
let dir
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'cu-stale-pointer-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

async function run(interrupt) {
  const control = createRunControl()
  const environment = createFakeEnvironment({ kind: 'desktop', control })
  const store = createAppApprovals({ path: join(dir, 'app-approvals.json') })
  store.grantAlways(FIXTURE, { by: 'api' })
  const seen = []
  const model = createScriptedAdapter((input, { index }) => {
    seen.push(input)
    if (index === 0) return { actions: [{ type: 'move', x: 10, y: 10 }] }
    if (index === 1) {
      interrupt?.(control)
      return { actions: [{ type: 'mouse_down' }, { type: 'mouse_up' }] }
    }
    return { final: 'done' }
  })
  await runTask({ task: 'press', environment, model, control, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false }, apps: [FIXTURE], appApprovals: store })
  return { results: seen[2]?.results ?? [], drags: environment.log.map((e) => e.action ?? e).filter((a) => a?.type === 'drag') }
}

test('without an interruption the press starts where the last move left the pointer', async () => {
  const { results, drags } = await run(null)
  assert.deepEqual(results.map((r) => r.status), ['done', 'done'])
  assert.deepEqual(drags[0].path, [{ x: 10, y: 10 }, { x: 10, y: 10 }])
})

test('after a pause and resume the pointer is stale: the bare press is refused and nothing is sent', async () => {
  const { results, drags } = await run((control) => { control.send('pause', { source: 'control' }); control.send('resume', { source: 'control' }) })
  assert.equal(drags.length, 0)
  assert.equal(results[0].code, 'no_pointer')
})

test('after a take-over and hand-back too', async () => {
  const { results, drags } = await run((control) => { control.send('take_over', { source: 'control' }); control.send('hand_back', { source: 'control' }) })
  assert.equal(drags.length, 0)
  assert.equal(results[0].code, 'no_pointer')
})
