import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

import { skipUnless } from '../../_vendor_/browser-use/_tools_/verify-runner/lib.mjs'
import { fixtureClient } from '../../_tools_/fixture-site/client.mjs'
import { startFixtureServer } from '../../_tools_/fixture-site/server.mjs'
import { startCheckBrowser, stopCheckBrowser } from '../../_tools_/verify-kit/check-browser.mjs'
import { executeAction } from '../../_tools_/verify-kit/cdp-input.mjs'
import { waitForTargets } from '../../_tools_/verify-kit/plan-runner.mjs'

/**
 * The probe pages observe input exactly, so later verifiers can rest on them (D-012 rule 1).
 *
 * The input recorder is driven with every canonical action type through CDP input and must record each
 * one's page event at the exact dispatched coordinates, with buttons and modifiers; the viewport probe must
 * report the viewport the page really has and see no marker in a fresh profile, then see its own marker after
 * a reload.
 */

let ready = false
let unjudged = 'the check browser was not started'
let browser

let fixture
let client
let handle

before(async () => {
  browser = await startCheckBrowser()
  if (!browser.ready) {
    unjudged = browser.reason
    return
  }
  handle = browser.handle
  fixture = await startFixtureServer({ seed: 'fixture-probes-verifier' })
  client = fixtureClient(fixture)
  ready = true
})

after(async () => {
  await stopCheckBrowser(browser)
  await fixture?.close()
})

const send = (method, params) => handle.page.send(method, params)
const events = async () => {
  await client.settle('input-recorder', { quietMs: 250 })
  await new Promise((resolve) => setTimeout(resolve, 250))
  return (await client.taskState('input-recorder')).facts.records
}

test('input-recorder: every action type yields its page event at the dispatched pixel', { timeout: 60_000 }, async (t) => {
  if (!skipUnless(t, ready, unjudged)) return
  await client.reset()
  await handle.goto(new URL('/tasks/input-recorder/', fixture.url).href)
  const boxes = await waitForTargets(client, 'input-recorder', ['odd-a', 'odd-b', 'field'])
  const a = { x: Math.round(boxes.targets['odd-a'].cx), y: Math.round(boxes.targets['odd-a'].cy) }
  const b = { x: Math.round(boxes.targets['odd-b'].cx), y: Math.round(boxes.targets['odd-b'].cy) }
  const field = { x: Math.round(boxes.targets.field.cx), y: Math.round(boxes.targets.field.cy) }

  await executeAction(send, { type: 'click', button: 'left', ...a, keys: ['SHIFT'] })
  await executeAction(send, { type: 'double_click', ...b })
  await executeAction(send, { type: 'click', button: 'right', ...a })
  await executeAction(send, { type: 'move', x: 333, y: 444 })
  await executeAction(send, { type: 'scroll', x: 500, y: 300, scroll_x: 0, scroll_y: 120 })
  await executeAction(send, { type: 'drag', path: [a, { x: a.x + 40, y: a.y + 9 }, { x: a.x + 81, y: a.y + 17 }] })
  await executeAction(send, { type: 'scroll', x: 500, y: 300, scroll_x: 0, scroll_y: -120 })
  await executeAction(send, { type: 'click', button: 'left', ...field })
  await executeAction(send, { type: 'type', text: 'Ab1' })
  await executeAction(send, { type: 'keypress', keys: ['CTRL', 'S'] })
  const log = await events()
  const find = (predicate, label) => {
    const found = log.find(predicate)
    assert.ok(found, `no ${label} recorded; got ${log.map((e) => e.type).join(' ')}`)
    return found
  }

  const down = find((e) => e.type === 'mousedown' && e.button === 0, 'left mousedown')
  assert.deepEqual([down.x, down.y, down.shift, down.target], [a.x, a.y, true, 'odd-a'], 'the click landed elsewhere or lost its held Shift')
  const dbl = find((e) => e.type === 'dblclick', 'dblclick')
  assert.deepEqual([dbl.x, dbl.y, dbl.detail], [b.x, b.y, 2])
  const context = find((e) => e.type === 'contextmenu', 'contextmenu')
  assert.deepEqual([context.x, context.y, context.button], [a.x, a.y, 2])
  find((e) => e.type === 'mousemove' && e.x === 333 && e.y === 444, 'mousemove at 333,444')
  const wheel = find((e) => e.type === 'wheel' && e.dy > 0, 'wheel')
  assert.deepEqual([wheel.x, wheel.y, wheel.dy], [500, 300, 120])
  find((e) => e.type === 'mousemove' && e.buttons === 1, 'mousemove with the button held (drag)')
  const ups = log.filter((e) => e.type === 'mouseup' && e.button === 0)
  assert.ok(ups.some((e) => e.x === a.x + 81 && e.y === a.y + 17), 'the drag did not end at its last point')
  const typed = log.filter((e) => e.type === 'input').at(-1)
  assert.equal(typed?.value, 'Ab1')
  assert.deepEqual(log.filter((e) => e.type === 'keydown' && e.target === 'field').map((e) => e.key).slice(0, 3), ['A', 'b', '1'])
  const save = find((e) => e.type === 'keydown' && e.key === 's', 'keydown s')
  assert.equal(save.ctrl, true, 'Ctrl was not held for the chord')
  assert.ok(log.every((e) => e.trusted === true), 'CDP input must arrive as trusted events')
})

test('viewport-probe: the page reports its real viewport and a fresh profile has no marker', { timeout: 60_000 }, async (t) => {
  if (!skipUnless(t, ready, unjudged)) return
  await client.reset()
  const url = new URL('/tasks/viewport-probe/', fixture.url).href
  await handle.goto(url)
  let state = await client.settle('viewport-probe', { quietMs: 200 })
  assert.equal(state.facts.page.innerWidth, 1024)
  assert.ok(state.facts.page.innerHeight > 500 && state.facts.page.innerHeight <= 768, `innerHeight ${state.facts.page.innerHeight}`)
  assert.equal(state.facts.page.devicePixelRatio, 1)
  assert.equal(state.facts.page.markerFound, false, 'a fresh throwaway profile already held the marker')
  await handle.goto(url)
  state = await client.settle('viewport-probe', { quietMs: 200 })
  assert.equal(state.facts.page.markerFound, true, 'the probe cannot see its own marker, so its "absent" would mean nothing')
})
