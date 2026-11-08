import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { createFakeEnvironment, createRunControl } from '../../_tools_/agent-core/lib.mjs'
import { createRunManager, mcpController } from '../../_tools_/computer-use-mcp/runs.mjs'
import { checkStart } from '../../_tools_/computer-use-mcp/tools.mjs'

const START = 'http://127.0.0.1:43117/'

function setUp(turns) {
  const dir = mkdtempSync(join(tmpdir(), 'cu-mcp-runs-'))
  const plan = join(dir, 'plan.json')
  writeFileSync(plan, JSON.stringify({ turns }))
  const launched = []
  const manager = createRunManager({
    seat: 'cu-test-seat',
    runsDirectory: join(dir, 'runs'),
    launchEnvironment: async (options) => { launched.push(options); return createFakeEnvironment({ control: options.control }) },
  })
  const spec = (extra = {}) => checkStart({ task: 'do the thing', start_url: START, model: 'scripted', plan, live_view: false, ...extra })
  return { dir, manager, spec, launched, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

async function untilFinished(manager, runId) {
  for (let i = 0; i < 50; i += 1) {
    const { body, content } = await manager.status({ runId, waitSeconds: 1 })
    if (body.state === 'finished') return { body, content }
  }
  throw new Error('the run did not finish')
}

test('a run starts, finishes, and its status carries the result, the final screenshot as an image and the trajectory link', async () => {
  const { manager, spec, launched, cleanup } = setUp([{ actions: [{ type: 'click', x: 10, y: 10, button: 'left' }] }, { final: 'all done' }])
  try {
    const started = await manager.start(spec())
    assert.match(started.run_id, /\S/)
    assert.equal(started.view_url, null, 'no live view was asked for')
    assert.equal(launched[0].seat, 'cu-test-seat')
    assert.equal(launched[0].startUrl, START)
    const { body, content } = await untilFinished(manager, started.run_id)
    assert.equal(body.result.status, 'completed')
    assert.equal(body.result.finalMessage, 'all done')
    assert.ok(body.steps >= 1)
    assert.ok(existsSync(body.trajectory.run_dir))
    assert.equal(content[0].type, 'text')
    assert.deepEqual([content[1].type, content[1].mimeType], ['image', 'image/png'])
    assert.ok(Buffer.from(content[1].data, 'base64').subarray(1, 4).toString() === 'PNG')
  } finally {
    cleanup()
  }
})

test('one run at a time; unknown runs are refused', async () => {
  const { manager, spec, cleanup } = setUp([{ actions: [{ type: 'wait', duration_ms: 1000 }] }, { final: 'done' }])
  try {
    const first = await manager.start(spec())
    await assert.rejects(manager.start(spec()), /one run at a time/)
    await assert.rejects(manager.status({ runId: 'nope' }), /no run 'nope'/)
    await untilFinished(manager, first.run_id)
    const second = await manager.start(spec())
    assert.notEqual(second.run_id, first.run_id, 'a new run may start once the last one finished')
    await untilFinished(manager, second.run_id)
  } finally {
    cleanup()
  }
})

test("an agent's question waits for computer_use_respond, and the answer continues the run", async () => {
  const { manager, spec, cleanup } = setUp([{ ask: 'Which colour?' }, { final: 'chose it' }])
  try {
    const { run_id: runId } = await manager.start(spec())
    let question = null
    for (let i = 0; i < 20 && question === null; i += 1) question = (await manager.status({ runId, waitSeconds: 1 })).body.question
    assert.equal(question.text, 'Which colour?')
    assert.throws(() => manager.respond({ runId, questionId: 'q-wrong', answer: 'blue' }), /not pending/)
    manager.respond({ runId, questionId: question.question_id, answer: 'blue' })
    const { body } = await untilFinished(manager, runId)
    assert.equal(body.result.status, 'completed')
  } finally {
    cleanup()
  }
})

test('the caller may pause, resume its own pause and stop; a stop ends the run cancelled', async () => {
  const { manager, spec, cleanup } = setUp([{ actions: [{ type: 'wait', duration_ms: 3000 }] }, { actions: [{ type: 'wait', duration_ms: 3000 }] }, { final: 'never' }])
  try {
    const { run_id: runId } = await manager.start(spec())
    assert.deepEqual(manager.control({ runId, command: 'pause' }), { run_id: runId, state: 'paused' })
    assert.deepEqual(manager.control({ runId, command: 'resume' }), { run_id: runId, state: 'running' })
    manager.control({ runId, command: 'guide', text: 'hurry' })
    manager.control({ runId, command: 'stop', text: 'enough' })
    const { body } = await untilFinished(manager, runId)
    assert.equal(body.result.status, 'cancelled')
    assert.throws(() => manager.control({ runId, command: 'pause' }), /refused/)
  } finally {
    cleanup()
  }
})

test('a status wait returns early on a change and can be cancelled', async () => {
  const { manager, spec, cleanup } = setUp([{ actions: [{ type: 'wait', duration_ms: 5000 }] }, { final: 'done' }])
  try {
    const { run_id: runId } = await manager.start(spec())
    const abort = new AbortController()
    const began = Date.now()
    setTimeout(() => abort.abort(), 100)
    await manager.status({ runId, waitSeconds: 30 }, { signal: abort.signal })
    assert.ok(Date.now() - began < 2000)
    manager.control({ runId, command: 'stop' })
    await untilFinished(manager, runId)
  } finally {
    cleanup()
  }
})

test('without a live view, consent requests decline at once; with one, they wait for a person', async () => {
  const control = createRunControl({ runId: 'c' })
  mcpController({ humanChannel: false }).attach(control)
  const answer = await control.requestConsent({ class: 'purchase', what: 'Buy' }, { timeoutMs: 5000 })
  assert.deepEqual([answer.approved, answer.answeredBy], [false, 'unattended'])
  const watched = createRunControl({ runId: 'w' })
  mcpController({ humanChannel: true }).attach(watched)
  const waiting = watched.requestConsent({ class: 'purchase', what: 'Buy' }, { timeoutMs: 5000 })
  await new Promise((resolve) => setTimeout(resolve, 50))
  assert.equal(watched.pending().length, 1, 'still waiting for the live view')
  watched.send({ command: 'consent', id: watched.pending()[0].id, approved: true }, { source: 'control' })
  assert.equal((await waiting).approved, true)
})

test('shutdown stops the active run', async () => {
  const { manager, spec, cleanup } = setUp([{ actions: [{ type: 'wait', duration_ms: 5000 }] }, { final: 'never' }])
  try {
    const { run_id: runId } = await manager.start(spec())
    await manager.shutdown({ timeoutMs: 5000 })
    assert.equal((await manager.status({ runId })).body.result.status, 'cancelled')
  } finally {
    cleanup()
  }
})
