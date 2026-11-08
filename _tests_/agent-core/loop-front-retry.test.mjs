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

// CU-82: the helper's front-app check can run before macOS finished activating the approved app. Refused before
// anything was posted, it is retried once; still refused, the model is told what helps, naming no app.

const FIXTURE = 'ai.reflection.cu.fixture'
const HELPER_WORDS = 'the frontmost app is not an approved app of this run'
const frontRefusal = (extra = {}) => Object.assign(new Error(HELPER_WORDS), { code: 'out_of_scope', details: { reason: 'out_of_scope', bundleId: 'com.google.Chrome', ...extra } })
let dir
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'cu-front-retry-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

async function run(failures, action = { type: 'type', text: '12' }) {
  const control = createRunControl()
  const environment = createFakeEnvironment({ kind: 'desktop', control })
  const perform = environment.perform.bind(environment)
  let calls = 0
  environment.perform = async (...args) => { calls += 1; const f = failures[calls - 1]; if (f) throw f; return perform(...args) }
  const store = createAppApprovals({ path: join(dir, 'app-approvals.json') })
  store.grantAlways(FIXTURE, { by: 'api' })
  const seen = []
  const scripted = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions: [action] }, { final: 'done' }] })
  const model = { ...scripted, async open(o) { const s = await scripted.open(o); return { ...s, async next(input = {}, opts = {}) { seen.push(input); return s.next(input, opts) } } } }
  const result = await runTask({ task: 'type 12', environment, model, control, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false }, apps: [FIXTURE], appApprovals: store })
  const events = readFileSync(join(result.trajectoryDir, 'events.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line))
  const event = events.filter((e) => e.kind === 'action' && e.action?.type === action.type).pop()
  return { calls, event, told: JSON.stringify(seen[1]?.results ?? []) }
}

test('a front-app refusal that clears is retried once and the action is done', async () => {
  const { calls, event } = await run([frontRefusal()])
  assert.equal(calls, 2)
  assert.equal(event.status, 'done')
  assert.equal(event.retry?.reason, 'front_app')
})

test('still refused after the retry: the model hears what helps, naming no app; the trajectory keeps the helper\'s words', async () => {
  const { calls, event, told } = await run([frontRefusal(), frontRefusal()])
  assert.equal(calls, 2)
  assert.equal(event.status, 'failed')
  assert.equal(event.detail, HELPER_WORDS)
  assert.match(told, /Another app is in front of the approved app, so nothing was sent/)
  assert.equal(told.includes('Chrome'), false)
})

test('a refusal after part of the action was posted is never retried - nothing is typed twice', async () => {
  const { calls, event } = await run([frontRefusal({ failedAt: 1, partial: true })])
  assert.equal(calls, 1)
  assert.equal(event.status, 'failed')
})

test('a covered-point refusal keeps its own path: no front-app retry, the covered-point sentence', async () => {
  const covered = Object.assign(new Error('covered'), { code: 'out_of_scope', details: { reason: 'target_out_of_scope', bundleId: 'com.google.Chrome', point: { x: 5, y: 5 } } })
  const { calls, told } = await run([covered], { type: 'click', button: 'left', x: 10, y: 10 })
  assert.equal(calls, 1)
  assert.match(told, /covers that point/)
})
