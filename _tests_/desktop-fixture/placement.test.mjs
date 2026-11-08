import assert from 'node:assert/strict'
import { before, test } from 'node:test'

import { buildFixtureApp } from '../../_tools_/desktop-fixture/build.mjs'
import { launchFixture } from '../../_tools_/desktop-fixture/client.mjs'

// A fixture window never opens under another app's alert or panel (S5's first live run: CU Ledger's invoice number
// under the owner's notification alert, refused excluded:os_security). Placement.spot through the offscreen seam, in
// AppKit coordinates: this Mac's 1920 x 1080 display with its two alerts.

let executable
before(() => {
  executable = buildFixtureApp().executable
})

const VISIBLE = { x: 0, y: 0, width: 1920, height: 1055 }
// The owner's alerts at CG (849, 209) 260 x 348 and (1205, 44) 260 x 250, flipped to AppKit y.
const ALERTS = [{ x: 849, y: 523, width: 260, height: 348 }, { x: 1205, y: 786, width: 260, height: 250 }]

async function spot(params) {
  const fixture = await launchFixture(executable, { offscreen: true })
  try {
    return await fixture.call('placement', params)
  } finally {
    await fixture.close()
  }
}

test('a free default place is kept: CU Fixture at x 120 clears both alerts', async () => {
  const frame = { x: 120, y: 615, width: 640, height: 440 }
  assert.deepEqual(await spot({ frame, blocks: ALERTS, visible: VISIBLE }), frame)
})

test('a covered window moves along its row to the first free spot: the compact CU Ledger page lands right of the alerts', async () => {
  assert.deepEqual(await spot({ frame: { x: 800, y: 730, width: 420, height: 288 }, blocks: ALERTS, visible: VISIBLE }), { x: 1480, y: 730, width: 420, height: 288 })
})

test('it never moves left of its default: CU Ledger opening before CU Fixture keeps its side (no spot rightwards: none), never x 200 over the payment form', async () => {
  // No CU Fixture window yet (the suite opens CU Ledger first); the alerts and a Typeless-like band are the only blocks.
  const typelessLike = { x: 611, y: 0, width: 750, height: 500 }
  const result = await spot({ frame: { x: 800, y: 615, width: 640, height: 440 }, blocks: [...ALERTS, typelessLike], visible: VISIBLE })
  assert.deepEqual(result, { none: true }, `moved to ${JSON.stringify(result)}`)
})

test('it never moves onto the other fixture app: with CU Fixture beside it and no free spot, the default stays (none)', async () => {
  const fixtureWindow = { x: 120, y: 615, width: 640, height: 440 }
  const typelessLike = { x: 0, y: 0, width: 1920, height: 500 }
  const result = await spot({ frame: { x: 800, y: 615, width: 640, height: 440 }, blocks: [...ALERTS, fixtureWindow, typelessLike], visible: VISIBLE })
  assert.deepEqual(result, { none: true })
})

test('every window reports how it was placed in the windows reply (offscreen here; default, moved, covered or explicit when shown)', async () => {
  const fixture = await launchFixture(executable, { offscreen: true })
  try {
    await fixture.open('payment-paste', {})
    const { main } = await fixture.call('windows')
    assert.deepEqual(main.placement, { state: 'offscreen' })
    const { events } = await fixture.state()
    assert.equal(events.length, 0, 'placement is reported in windows, never as an event a judge would count')
  } finally {
    await fixture.close()
  }
})

// The live cover check (Placement.covering, over a front-to-back window list): what lies in FRONT of our window and
// intersects it, from other processes, layers 0-19 only.
async function inFront(params) {
  const fixture = await launchFixture(executable, { offscreen: true })
  try {
    return (await fixture.call('inFront', params)).by
  } finally {
    await fixture.close()
  }
}

test('covering: another app window in front of ours and over it covers it; behind, beside, system layers or our own do not', async () => {
  const frame = { x: 120, y: 600, width: 360, height: 300 }
  const ours = { number: 50, pid: 1, layer: 0, ...frame, owner: 'ai.reflection.cu.fixture' }
  const browser = { number: 40, pid: 2, layer: 0, x: 317, y: 0, width: 1606, height: 1050, owner: 'com.google.Chrome' }
  const dock = { number: 10, pid: 3, layer: 20, x: 0, y: 0, width: 1920, height: 1080, owner: 'com.apple.dock' }
  const alert = { number: 20, pid: 4, layer: 8, x: 400, y: 700, width: 260, height: 348, owner: 'com.apple.UserNotificationCenter' }
  const far = { number: 30, pid: 5, layer: 0, x: 1500, y: 0, width: 300, height: 300, owner: 'com.example.far' }
  const mine = { number: 45, pid: 1, layer: 0, x: 130, y: 610, width: 100, height: 100, owner: 'ai.reflection.cu.fixture' }
  const base = { frame, number: 50, me: 1 }
  assert.deepEqual(await inFront({ ...base, list: [dock, alert, far, browser, mine, ours] }), ['com.apple.UserNotificationCenter', 'com.google.Chrome'])
  assert.deepEqual(await inFront({ ...base, list: [dock, far, mine, ours, browser] }), [], 'a window behind ours does not cover it')
})
