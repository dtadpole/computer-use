import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { createScriptedAdapter, planScale, scaleAction } from '../../_tools_/agent-core/adapter-scripted.mjs'
import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createRunControl } from '../../_tools_/agent-core/control.mjs'
import { createFakeEnvironment } from '../../_tools_/agent-core/fake-env.mjs'
import { runTask } from '../../_tools_/agent-core/loop.mjs'

// CU-81: a static plan written for a desktop region plays when the same region is rendered at another backing scale
// (--simulate-scale), every coordinate mapped; any other frame stays frame_mismatch.

const PLAIN = { width: 1920, height: 1080 }
const POINTS = { width: 1920, height: 1080 }
const RETINA = { width: 3840, height: 2160, sizePt: POINTS }
const actions = [
  { type: 'click', button: 'left', x: 100, y: 200 },
  { type: 'scroll', x: 960, y: 540, scroll_x: 0, scroll_y: 300 },
  { type: 'drag', path: [{ x: 10, y: 20 }, { x: 30, y: 40 }] },
  { type: 'zoom', region: [0, 0, 960, 540] },
  { type: 'type', text: 'hi' },
]
const first = async (plan, frame) => (await (await createScriptedAdapter(plan).open({ frame })).next()).call.actions

test('at a 2x frame every coordinate of the plan is mapped: points, scroll deltas, a drag path, a zoom region', async () => {
  assert.deepEqual(await first({ frame: PLAIN, turns: [{ actions }] }, RETINA), [
    { type: 'click', button: 'left', x: 200, y: 400 },
    { type: 'scroll', x: 1920, y: 1080, scroll_x: 0, scroll_y: 600 },
    { type: 'drag', path: [{ x: 20, y: 40 }, { x: 60, y: 80 }] },
    { type: 'zoom', region: [0, 0, 1920, 1080] },
    { type: 'type', text: 'hi' },
  ])
})

test('at the plan\'s own frame nothing changes', async () => {
  assert.deepEqual(await first({ frame: PLAIN, turns: [{ actions }] }, PLAIN), actions)
})

test('another layout stays frame_mismatch: a simulated region, another display size, a browser viewport, no frame', async () => {
  const plan = { frame: PLAIN, turns: [{ actions }] }
  await assert.rejects(createScriptedAdapter(plan).open({ frame: { width: 3024, height: 1964, sizePt: { width: 1512, height: 982 } } }), { code: 'frame_mismatch' })
  await assert.rejects(createScriptedAdapter(plan).open({ frame: { width: 2160, height: 1215, sizePt: { width: 2160, height: 1215 } } }), { code: 'frame_mismatch' }, 'a bigger display, same aspect, is another layout')
  await assert.rejects(createScriptedAdapter(plan).open({ frame: { width: 3840, height: 2160, viewport: { width: 3840, height: 2160 } } }), { code: 'frame_mismatch' }, 'a browser frame has no sizePt')
  await assert.rejects(createScriptedAdapter(plan).open({}), { code: 'frame_mismatch' })
  assert.deepEqual(planScale({ width: 3840, height: 2160 }, { width: 1920, height: 1080, sizePt: POINTS }), { x: 0.5, y: 0.5 }, 'a plan written at scale 2 plays at scale 1')
  // A larger plan from another display, at a non-integer ratio to the region, is not this region at any backing scale.
  for (const other of [{ width: 2560, height: 1440 }, { width: 2880, height: 1620 }]) {
    assert.equal(planScale(other, { width: 1920, height: 1080, sizePt: POINTS }), null, `${other.width}x${other.height} on a 1920x1080 region`)
    await assert.rejects(createScriptedAdapter({ frame: other, turns: [{ actions }] }).open({ frame: { width: 3840, height: 2160, sizePt: POINTS } }), { code: 'frame_mismatch' })
  }
})

test('the plan itself is never mutated; function plans play as written', async () => {
  const plan = { frame: PLAIN, turns: [{ actions }] }
  await first(plan, RETINA)
  assert.equal(plan.turns[0].actions[0].x, 100, 'the plan is untouched')
  assert.equal(scaleAction(actions[0], { x: 1, y: 1 }), actions[0])
  const fn = createScriptedAdapter(() => ({ actions: [actions[0]] }))
  assert.deepEqual((await (await fn.open({ frame: RETINA })).next()).call.actions, [actions[0]])
})

test('a run on a 2x frame performs the 1920x1080 plan\'s click at the mapped point', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cu-scripted-scale-'))
  try {
    const FIXTURE = 'ai.reflection.cu.fixture'
    const control = createRunControl()
    const environment = createFakeEnvironment({ width: RETINA.width, height: RETINA.height, kind: 'desktop', control })
    environment.frame = { ...environment.frame, sizePt: POINTS } // the driver's frame names its region in points
    const store = createAppApprovals({ path: join(dir, 'app-approvals.json') })
    store.grantAlways(FIXTURE, { by: 'api' })
    const model = createScriptedAdapter({ frame: PLAIN, turns: [{ actions: [actions[0]] }, { final: 'done' }] })
    const result = await runTask({ task: 'click', environment, model, control, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false }, apps: [FIXTURE], appApprovals: store })
    assert.equal(result.status, 'completed')
    const click = environment.log.find((entry) => (entry.action ?? entry).type === 'click')
    const performed = click.action ?? click
    assert.deepEqual([performed.x, performed.y], [200, 400])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
