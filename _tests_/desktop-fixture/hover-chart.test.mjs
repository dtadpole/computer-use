import assert from 'node:assert/strict'
import { before, describe, test } from 'node:test'

import { buildFixtureApp } from '../../_tools_/desktop-fixture/build.mjs'
import { launchFixture } from '../../_tools_/desktop-fixture/client.mjs'

// CU-66 S10 'hover-chart', offscreen: twelve bars as targets; a value shows only after a 300 ms rest on a bar and is
// recorded once per entry; leaving early records nothing; a click records 'clicked' and changes nothing.

let executable
before(() => {
  executable = buildFixtureApp().executable
})

async function withChart(params, body) {
  const fixture = await launchFixture(executable, { offscreen: true })
  try {
    await fixture.open('hover-chart', { title: 'Revenue', ...params })
    return await body(fixture)
  } finally {
    await fixture.close()
  }
}

// Rest waits are 800 ms against the 300 ms rest timer: the suite runs files in parallel, and a 400 ms wait missed the
// timer once on a loaded machine. 'Too fast' passes stay at 120-150 ms (a late timer cannot make them fire).
const BARS = [{ label: 'Jan', value: 4120 }, { label: 'Feb', value: 2875 }, { label: 'Mar', value: 7342 }, { label: 'Apr', value: 1009 }]

describe('hover-chart (CU-66 S10)', () => {
  test('one target per bar, in the window, nothing shown at open; default data has twelve months', async () => {
    await withChart({}, async (fixture) => {
      const targets = await fixture.targets()
      const bars = Object.keys(targets).filter((name) => name.startsWith('bar-'))
      assert.equal(bars.length, 12)
      for (const name of bars) assert.ok(targets[name].x >= 0 && targets[name].x + targets[name].width <= 600 && targets[name].y + targets[name].height <= 380, name)
      const { fields } = await fixture.state()
      assert.deepEqual([fields.barCount, fields.shownBar], [12, null])
    })
  })

  test('a rest past 300 ms shows the value and records it once; staying longer adds nothing; leaving hides it', async () => {
    await withChart({ bars: BARS }, async (fixture) => {
      await fixture.act({ hoverFor: { target: 'bar-Mar', ms: 800, stay: true } })
      let { events, fields } = await fixture.state()
      assert.deepEqual(events.filter((e) => e.type === 'hovered').map((e) => [e.bar, e.value]), [['Mar', '$7,342']])
      assert.equal(fields.shownBar, 'Mar')
      await fixture.act({ hoverFor: { target: 'bar-Mar', ms: 50 } })
      ;({ events, fields } = await fixture.state())
      assert.equal(fields.shownBar, null, 'the value stayed after leaving')
    })
  })

  test('passing over a bar faster than the rest records nothing and shows nothing', async () => {
    await withChart({ bars: BARS }, async (fixture) => {
      await fixture.act({ hoverFor: { target: 'bar-Jan', ms: 120 } })
      await fixture.act({ hoverFor: { target: 'bar-Feb', ms: 150 } })
      const { events, fields } = await fixture.state()
      assert.deepEqual(events.filter((e) => e.type === 'hovered'), [])
      assert.equal(fields.shownBar, null)
    })
  })

  test('each new entry records again; the oracle seam records like a rest', async () => {
    await withChart({ bars: BARS }, async (fixture) => {
      await fixture.act({ hoverFor: { target: 'bar-Apr', ms: 800 } })
      await fixture.act({ hoverFor: { target: 'bar-Apr', ms: 800 } })
      await fixture.act({ hover: { target: 'bar-Feb' } })
      const { events } = await fixture.state()
      assert.deepEqual(events.filter((e) => e.type === 'hovered').map((e) => [e.bar, e.value]), [['Apr', '$1,009'], ['Apr', '$1,009'], ['Feb', '$2,875']])
    })
  })
})

// CU-108: a pointer left resting where a bar opens (an entry with no move) shows nothing, however long it rests; the
// first move inside the bar starts the rest.
describe('hover-chart: no value without a move (CU-108)', () => {
  test('an entry with no move shows and records nothing after 900 ms; a move then rests and records once', async () => {
    await withChart({ bars: BARS }, async (fixture) => {
      await fixture.act({ hoverFor: { target: 'bar-Mar', ms: 900, stay: true, moved: false } })
      let { events, fields } = await fixture.state()
      assert.deepEqual(events.filter((e) => e.type === 'hovered'), [])
      assert.equal(fields.shownBar, null)
      // A small move inside the same bar then starts the rest.
      await fixture.act({ hoverFor: { target: 'bar-Mar', ms: 800, inside: true, moved: false } })
      ;({ events } = await fixture.state())
      assert.deepEqual(events.filter((e) => e.type === 'hovered').map((e) => e.bar), ['Mar'])
    })
  })

  test("one move onto a bar from outside (an entry, no move inside after it) and a rest records once - a model's single mouse_move", async () => {
    await withChart({ bars: BARS }, async (fixture) => {
      await fixture.act({ hoverFor: { target: 'bar-Feb', ms: 800, stay: true } })
      const { events, fields } = await fixture.state()
      assert.deepEqual(events.filter((e) => e.type === 'hovered').map((e) => [e.bar, e.value]), [['Feb', '$2,875']])
      assert.equal(fields.shownBar, 'Feb')
    })
  })
})
