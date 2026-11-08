import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'

import { createScriptedAdapter } from '../../_tools_/agent-core/adapter-scripted.mjs'
import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { noticeLine } from '../../_tools_/agent-core/cli.mjs'
import { createRunControl } from '../../_tools_/agent-core/control.mjs'
import { createFakeEnvironment } from '../../_tools_/agent-core/fake-env.mjs'
import { runTask } from '../../_tools_/agent-core/loop.mjs'

// CU-64 G1/G2 (input-vocabulary-acceptance.md): keys or buttons left down are recorded by canonical name only and told
// to the person - a notice on run control (the live view) and on the event's line, which the CLI prints (a terminal run).

const FIXTURE = 'ai.reflection.cu.fixture'
let dir
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'cu-held-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

async function run({ stale, plan, fail, kind = 'desktop' } = {}) {
  const control = createRunControl()
  const environment = createFakeEnvironment({ kind, control, ...(fail ? { fail } : {}) })
  if (stale) {
    const state = environment.state.bind(environment)
    environment.state = () => ({ ...state(), releasedStale: stale })
  }
  const notices = []
  control.subscribe((event) => { if (event.type === 'notice') notices.push(event) })
  const lines = []
  const store = createAppApprovals({ path: join(dir, 'app-approvals.json') })
  store.grantAlways(FIXTURE, { by: 'api' })
  const model = createScriptedAdapter((input, context) => (plan ?? (() => ({ final: 'done' })))(input, { ...context, environment }))
  const desktop = kind === 'desktop'
  const result = await runTask({ task: 'held', environment, model, control, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false }, onEvent: (line) => { lines.push(line) }, ...(desktop ? { apps: [FIXTURE], appApprovals: store } : { sitePolicy: (await import('../../_tools_/agent-core/sites.mjs')).createSitePolicy({ startUrl: 'http://127.0.0.1:43117/' }) }) })
  const events = readFileSync(join(result.trajectoryDir, 'events.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line))
  return { events, notices, lines, environment }
}

test('G1: a release the helper reported at launch is logged, noticed and printed - names only, odd tokens dropped', async () => {
  const { events, notices, lines } = await run({ stale: { keys: ['SHIFT', 'typed text!'], buttons: ['left', 'x'], posted: 2 } })
  const stale = events.find((e) => e.kind === 'released_stale')
  assert.deepEqual([stale.keys, stale.buttons, stale.posted], [['SHIFT'], ['left'], 2])
  assert.match(stale.notice, /SHIFT and the left mouse button, left down by an earlier helper/)
  assert.deepEqual(notices.find((n) => n.kind === 'released_stale').keys, ['SHIFT'])
  assert.match(noticeLine(lines.find((l) => l.kind === 'released_stale')), /^notice: Released before this run's input/)
})

test('G1: a late release event during the run is logged too; nothing held means nothing logged', async () => {
  const { events } = await run({ plan: (input, { index, environment }) => { if (index === 0) environment.emit('releasedStale', { keys: ['META'], buttons: [] }); return index === 0 ? { actions: [{ type: 'wait', duration_ms: 1 }] } : { final: 'done' } } })
  assert.deepEqual(events.filter((e) => e.kind === 'released_stale').map((e) => e.keys), [['META']])
  const quiet = await run({ stale: { keys: [], buttons: [] } })
  assert.equal(quiet.events.some((e) => e.kind === 'released_stale'), false)
})

test('G2: a local-input stop during a hold names the held keys and tells the person their first keystroke may carry them', async () => {
  const fail = (action) => (action.type === 'keypress' ? { code: 'taken_over', message: 'stopped by local input', details: { reason: 'local_input', failedAt: 1, heldKeys: ['SHIFT', 'q'] } } : null)
  const { events, notices } = await run({ fail, plan: (input, { index }) => (index === 0 ? { actions: [{ type: 'keypress', keys: ['SHIFT', 'A'] }] } : { final: 'done' }) })
  const action = events.find((e) => e.kind === 'action' && e.action?.type === 'keypress' && e.status === 'failed')
  assert.deepEqual(action.heldKeys, ['SHIFT'])
  assert.match(action.notice, /first keystroke may have carried SHIFT/)
  assert.ok(notices.some((n) => n.kind === 'held_at_local_input'))
})

test('a lost helper mid-hold: the notice says what may still be down', async () => {
  const fail = (action) => (action.type === 'keypress' ? { code: 'helper_lost', message: 'the helper went away', details: { heldAtLoss: { keys: ['ALT'], buttons: ['left'] } } } : null)
  const { events, notices } = await run({ fail, plan: (input, { index }) => (index === 0 ? { actions: [{ type: 'keypress', keys: ['ALT', 'A'] }] } : { final: 'done' }) })
  const action = events.find((e) => e.kind === 'action' && e.action?.type === 'keypress' && e.status === 'failed')
  assert.deepEqual(action.heldAtLoss, { keys: ['ALT'], buttons: ['left'] })
  assert.match(action.notice, /ALT and the left mouse button; it may still be down/)
  assert.ok(notices.some((n) => n.kind === 'held_at_loss'))
})

test('a browser run reads no release; noticeLine prints only a line with a notice', async () => {
  const { events } = await run({ kind: 'browser', stale: { keys: ['SHIFT'], buttons: [] } })
  assert.equal(events.some((e) => e.kind === 'released_stale'), false)
  assert.equal(noticeLine({ kind: 'action' }), null)
  assert.equal(noticeLine({ notice: 'x' }), 'notice: x\n')
})

test('G1: one release seen by both paths - kept in state() and emitted - is reported once; a new release is reported again', async () => {
  const release = Object.freeze({ keys: ['SHIFT'], buttons: [], posted: 1 })
  const { events, notices } = await run({
    stale: release,
    plan: (input, { index, environment }) => {
      if (index === 0) {
        environment.emit('releasedStale', release)
        environment.emit('releasedStale', Object.freeze({ keys: ['SHIFT'], buttons: [], posted: 0 }))
        return { actions: [{ type: 'wait', duration_ms: 1 }] }
      }
      return { final: 'done' }
    },
  })
  assert.deepEqual(events.filter((e) => e.kind === 'released_stale').map((e) => e.posted), [1, 0])
  assert.equal(notices.filter((n) => n.kind === 'released_stale').length, 2)
})

