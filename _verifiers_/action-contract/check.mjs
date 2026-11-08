import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { after, before, test } from 'node:test'

import { browserAvailable } from '../../_vendor_/browser-use/lib.mjs'
import { skipUnless } from '../../_vendor_/browser-use/_tools_/verify-runner/lib.mjs'
import { fixtureClient } from '../../_tools_/fixture-site/client.mjs'
import { startFixtureServer } from '../../_tools_/fixture-site/server.mjs'
import { lastEventId, launchDriver, recorderEvents } from '../../_tools_/verify-kit/driver.mjs'
import { decodePng } from '../../_tools_/verify-kit/png.mjs'
import { loadSut } from '../../_tools_/verify-kit/sut.mjs'

/**
 * ULTIMATE_GOAL action-contract row: the nine actions of OpenAI's GA computer tool, batched and executed in order;
 * an unsupported or malformed action is refused by name, never guessed.
 *
 * Part A drives the chrome-browser driver directly: each action must yield its page event in the input recorder's
 * own log (D-012), held modifiers must be released after the action, including after a failed one (R16), and wait
 * and screenshot must send no input. Part B runs agent-core's loop with the scripted model: a batch holding one
 * valid and one unknown (or malformed) action must yield zero page events, while the same valid action alone
 * yields exactly one press - so a zero is never vacuous.
 */

const sut = await loadSut()

let ready = browserAvailable()
let unjudged = ready ? '' : 'no Chrome or Chromium on this machine'
let fixture
let client
let recorderUrl
let env
let targets
let runsDirectory

before(async () => {
  fixture = await startFixtureServer({ seed: 'action-contract-verifier' })
  client = fixtureClient(fixture)
  recorderUrl = new URL('/tasks/input-recorder/', fixture.url).href
  runsDirectory = mkdtempSync('/tmp/cu-verifier-runs-')
  if (!ready) return
  await client.reset()
  const launched = await launchDriver(sut, { startUrl: recorderUrl, runId: 'verify-action-contract' })
  if (launched.refused) {
    ready = false
    unjudged = launched.refused
    return
  }
  env = launched.env
  await recorderEvents(client)
  const boxes = await client.targets('input-recorder')
  targets = Object.fromEntries(['odd-a', 'odd-b', 'field'].map((name) => [name, { x: Math.round(boxes.targets[name].cx), y: Math.round(boxes.targets[name].cy) }]))
})

after(async () => {
  await env?.close().catch(() => {})
  await fixture?.close()
  if (runsDirectory && /^\/tmp\/cu-verifier-runs-[A-Za-z0-9]{6}$/.test(runsDirectory)) rmSync(runsDirectory, { recursive: true, force: true })
})

/** Perform one action and return the page events it produced. */
async function act(action) {
  const since = await lastEventId(client)
  await env.perform(action)
  return recorderEvents(client, { since })
}

const of = (events, type) => events.filter((event) => event.type === type)

test('click: press, release and click at the point with the left button', { timeout: 30_000 }, async (t) => {
  if (!skipUnless(t, ready, unjudged)) return
  const events = await act({ type: 'click', button: 'left', ...targets['odd-a'] })
  const [down] = of(events, 'mousedown')
  assert.deepEqual([down?.x, down?.y, down?.button, down?.target], [targets['odd-a'].x, targets['odd-a'].y, 0, 'odd-a'])
  assert.equal(of(events, 'mouseup').length, 1)
  assert.equal(of(events, 'click').length, 1)
})

test('click with the right and wheel buttons reaches the page as buttons 2 and 1', { timeout: 30_000 }, async (t) => {
  if (!skipUnless(t, ready, unjudged)) return
  const right = await act({ type: 'click', button: 'right', ...targets['odd-a'] })
  assert.equal(of(right, 'contextmenu')[0]?.button, 2, 'no contextmenu with button 2')
  const wheel = await act({ type: 'click', button: 'wheel', ...targets['odd-a'] })
  assert.equal(of(wheel, 'mousedown')[0]?.button, 1, 'the wheel button did not press button 1')
})

test('double_click: a dblclick with detail 2 at the point', { timeout: 30_000 }, async (t) => {
  if (!skipUnless(t, ready, unjudged)) return
  const [dbl] = of(await act({ type: 'double_click', ...targets['odd-b'] }), 'dblclick')
  assert.deepEqual([dbl?.x, dbl?.y, dbl?.detail], [targets['odd-b'].x, targets['odd-b'].y, 2])
})

test('move: the pointer arrives at the point with no button held', { timeout: 30_000 }, async (t) => {
  if (!skipUnless(t, ready, unjudged)) return
  const moves = of(await act({ type: 'move', x: 333, y: 444 }), 'mousemove')
  assert.ok(moves.some((event) => event.x === 333 && event.y === 444 && event.buttons === 0), 'no mousemove at 333,444')
})

test('drag: press at the first point, move with the button held, release at the last', { timeout: 30_000 }, async (t) => {
  if (!skipUnless(t, ready, unjudged)) return
  const a = targets['odd-a']
  const events = await act({ type: 'drag', path: [a, { x: a.x + 40, y: a.y + 9 }, { x: a.x + 81, y: a.y + 17 }] })
  const [down] = of(events, 'mousedown')
  const up = of(events, 'mouseup').at(-1)
  assert.deepEqual([down?.x, down?.y], [a.x, a.y])
  assert.ok(of(events, 'mousemove').some((event) => event.buttons === 1), 'no move with the button held')
  assert.deepEqual([up?.x, up?.y], [a.x + 81, a.y + 17])
})

test('scroll: a wheel event at the point with the requested delta', { timeout: 30_000 }, async (t) => {
  if (!skipUnless(t, ready, unjudged)) return
  const [wheel] = of(await act({ type: 'scroll', x: 500, y: 300, scroll_x: 0, scroll_y: 120 }), 'wheel')
  assert.deepEqual([wheel?.x, wheel?.y, wheel?.dy], [500, 300, 120])
  await act({ type: 'scroll', x: 500, y: 300, scroll_x: 0, scroll_y: -120 })
})

test('type: the focused field receives the text, capitals included', { timeout: 30_000 }, async (t) => {
  if (!skipUnless(t, ready, unjudged)) return
  await act({ type: 'click', button: 'left', ...targets.field })
  const events = await act({ type: 'type', text: 'Ab1' })
  assert.equal(of(events, 'input').at(-1)?.value, 'Ab1')
})

test('keypress: a chord holds its modifier for its key and releases it', { timeout: 30_000 }, async (t) => {
  if (!skipUnless(t, ready, unjudged)) return
  const events = await act({ type: 'keypress', keys: ['SHIFT', 'A'] })
  const key = of(events, 'keydown').find((event) => event.key === 'A')
  assert.equal(key?.shift, true, 'A was not pressed with Shift held')
  assert.ok(of(events, 'keyup').some((event) => event.key === 'Shift'), 'Shift was never released')
  const enter = await act({ type: 'keypress', keys: ['ENTER'] })
  assert.ok(of(enter, 'keydown').some((event) => event.key === 'Enter'))
})

test('wait and screenshot send no input; wait takes its time', { timeout: 30_000 }, async (t) => {
  if (!skipUnless(t, ready, unjudged)) return
  const started = Date.now()
  const waited = await act({ type: 'wait', duration_ms: 400 })
  assert.ok(Date.now() - started >= 380, 'wait returned early')
  assert.deepEqual(waited.map((event) => event.type), [])
  const since = await lastEventId(client)
  const shot = await env.screenshot()
  assert.ok(decodePng(shot.data).width > 0)
  assert.deepEqual((await recorderEvents(client, { since })).map((event) => event.type), [])
})

/** Modifier keys whose keydowns and keyups do not pair up in `events`: a key left down, as the page sees it. */
function unbalancedModifiers(events) {
  return ['Shift', 'Control', 'Alt', 'Meta'].filter((key) => {
    const count = (type) => events.filter((event) => event.type === type && event.key === key).length
    return count('keydown') !== count('keyup')
  })
}

test('held keys apply to their action only, and are released after a failed action (R16)', { timeout: 30_000 }, async (t) => {
  if (!skipUnless(t, ready, unjudged)) return
  const events = await act({ type: 'click', button: 'left', keys: ['SHIFT'], ...targets['odd-a'] })
  const order = events.map((event) => `${event.type}:${event.key ?? ''}`)
  const down = order.indexOf('mousedown:')
  assert.equal(of(events, 'mousedown')[0]?.shift, true, 'Shift was not held for the click')
  assert.ok(order.indexOf('keydown:Shift') !== -1 && order.indexOf('keydown:Shift') < down, 'Shift was not pressed before the click')
  assert.ok(order.lastIndexOf('keyup:Shift') > order.lastIndexOf('mouseup:'), 'Shift was not released after the click: the page still sees it down')
  const plain = of(await act({ type: 'click', button: 'left', ...targets['odd-a'] }), 'mousedown')[0]
  assert.equal(plain?.shift, false, 'Shift stayed down after the click')

  const since = await lastEventId(client)
  await assert.rejects(env.perform({ type: 'click', button: 'left', keys: ['CTRL'], x: env.frame.width + 50, y: 10 }), 'a click outside the frame must fail')
  await assert.rejects(env.perform({ type: 'keypress', keys: ['SHIFT', 'NOT_A_KEY'] }), 'an unknown key must fail')
  await env.perform({ type: 'click', button: 'left', ...targets['odd-a'] })
  const afterFailures = await recorderEvents(client, { since })
  assert.deepEqual(unbalancedModifiers(afterFailures), [], 'a modifier was pressed and never released around the failed actions')
  const press = of(afterFailures, 'mousedown')[0]
  assert.deepEqual([press?.ctrl, press?.shift], [false, false], 'a modifier stayed down after a failed action')
})

/** Run agent-core's loop on a fresh driver with a scripted plan; returns the presses the page saw. */
async function loopPresses(actions, label) {
  // One browser per seat (D-014): Part A's browser goes before the loop launches its own.
  if (env) {
    await env.close()
    env = undefined
  }
  await client.reset()
  const launched = await launchDriver(sut, { startUrl: recorderUrl, runId: `verify-loop-${label}` })
  if (launched.refused) return { refused: launched.refused }
  await recorderEvents(client)
  const boxes = await client.targets('input-recorder')
  const a = { x: Math.round(boxes.targets['odd-a'].cx), y: Math.round(boxes.targets['odd-a'].cy) }
  const result = await sut.lib.runTask({
    task: { text: `action-contract ${label}`, meta: { verifier: 'action-contract', label } },
    environment: launched.env,
    model: sut.lib.createScriptedAdapter({ turns: [{ actions: actions(a) }, { final: 'done' }] }),
    sitePolicy: sut.lib.createSitePolicy({ startUrl: recorderUrl }),
    runsDirectory,
  })
  const presses = of(await recorderEvents(client), 'mousedown')
  return { presses, result }
}

test('loop: a valid click alone presses once (the control for the next two)', { timeout: 60_000 }, async (t) => {
  if (!skipUnless(t, ready, unjudged)) return
  const run = await loopPresses((a) => [{ type: 'click', button: 'left', ...a }], 'control')
  if (!skipUnless(t, !run.refused, run.refused)) return
  assert.equal(run.presses.length, 1, `the control run pressed ${run.presses.length} times (status ${run.result.status})`)
})

test('loop: one valid and one unknown action in a batch press nothing; the batch is refused whole', { timeout: 60_000 }, async (t) => {
  if (!skipUnless(t, ready, unjudged)) return
  const run = await loopPresses((a) => [{ type: 'click', button: 'left', ...a }, { type: 'hold_key', text: 'a' }], 'unknown')
  if (!skipUnless(t, !run.refused, run.refused)) return
  assert.equal(run.presses.length, 0, `the page saw ${run.presses.length} press(es) from a batch that held an unknown action`)
})

test('loop: one valid and one malformed action in a batch press nothing', { timeout: 60_000 }, async (t) => {
  if (!skipUnless(t, ready, unjudged)) return
  const run = await loopPresses((a) => [{ type: 'click', button: 'left', ...a }, { type: 'click', button: 'left', x: a.x }], 'malformed')
  if (!skipUnless(t, !run.refused, run.refused)) return
  assert.equal(run.presses.length, 0, `the page saw ${run.presses.length} press(es) from a batch that held a malformed action`)
})
