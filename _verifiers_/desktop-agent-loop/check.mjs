import assert from 'node:assert/strict'
import { test } from 'node:test'

import { skipUnless } from '../../_vendor_/browser-use/_tools_/verify-runner/lib.mjs'
import { desktopRun, FIXTURE, ready } from '../desktop-consent/harness.mjs'

/**
 * ULTIMATE_GOAL 2.0 agent-loop row, desktop half before the grant: bounded and cancellable, and a malformed batch
 * posts nothing. Real agent-core runs of the macos-desktop driver on the fake helper, with one run control shared by
 * driver and loop as startRun shares it; judged from the run's own records and the requests the helper received.
 * Multiple models are the live half (the desktop suite's rates per model).
 */

const guard = (t) => skipUnless(t, ready, 'the desktop loop (C5), driver or fake helper has not landed')
const click = (x, y) => ({ type: 'click', button: 'left', x, y })
const world = {
  grants: { screen: true, accessibility: true, listenEvents: false },
  displays: [{ id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 1280, height: 800 }, scale: 1 }],
  apps: [{ bundleId: FIXTURE, pid: 900, rect: { x: 0, y: 0, width: 1280, height: 800 } }],
}
const longPath = Array.from({ length: 150 }, (_, i) => ({ x: 10 + i * 5, y: 200 }))

test('a batch the driver could not run whole is refused whole: nothing reaches the helper', async (t) => {
  if (!guard(t)) return
  const second = { 'an unknown key': { type: 'keypress', keys: ['NOSUCHKEY'] }, 'a drag of 150 points': { type: 'drag', path: longPath }, 'keypress repeat 500': { type: 'keypress', keys: ['A'], repeat: 500 }, 'a key with no macOS code': { type: 'keypress', keys: ['é'] }, 'a 60 s wait': { type: 'wait', duration_ms: 60_000 } }
  for (const [name, action] of Object.entries(second)) {
    const run = await desktopRun({ world, turns: [{ actions: [click(100, 100), action] }, { final: 'done' }] })
    assert.equal(run.inputs.length, 0, `[click, ${name}]: the click was posted before the refusal`)
    assert.equal(run.result.actions.done, 0, `[click, ${name}]: an action ran`)
    assert.ok(run.result.actions.refused >= 1, `[click, ${name}]: nothing was refused`)
  }
})

test('the step bound ends the run: max_steps, and the call over the bound is recorded, not run', async (t) => {
  if (!guard(t)) return
  const run = await desktopRun({ world, turns: Array.from({ length: 8 }, (_, i) => ({ actions: [click(100 + i, 100)] })), bounds: { maxSteps: 3 } })
  assert.equal(run.result.status, 'max_steps')
  assert.ok(run.inputs.length < 3, `${run.inputs.length} clicks ran under a bound of 3 requests`)
})

test('a cancel stops the run at once: the wait is cut short and the next action never runs', async (t) => {
  if (!guard(t)) return
  const cancelSoon = async (control) => {
    await new Promise((resolve) => setTimeout(resolve, 300))
    control.send({ command: 'stop', reason: 'the verifier cancels' }, { source: 'api' })
  }
  const run = await desktopRun({ world, during: cancelSoon, turns: [{ actions: [{ type: 'wait', duration_ms: 4000 }, click(100, 100)] }, { final: 'done' }] })
  assert.equal(run.result.status, 'cancelled')
  assert.equal(run.inputs.length, 0, 'the click after the cancel reached the helper')
  assert.ok(run.wallMs < 3000, `the run took ${run.wallMs} ms after a cancel at 300 ms`)
})

test('the time bound ends the run before the next action: max_time, nothing sent', async (t) => {
  if (!guard(t)) return
  const run = await desktopRun({ world, turns: [{ actions: [{ type: 'wait', duration_ms: 500 }, { type: 'wait', duration_ms: 500 }, click(100, 100)] }, { final: 'done' }], bounds: { maxSteps: 4, maxWallMs: 700 } })
  assert.equal(run.result.status, 'max_time')
  assert.equal(run.inputs.length, 0, 'an action ran past the time bound')
})
