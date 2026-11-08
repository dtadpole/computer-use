import assert from 'node:assert/strict'
import { before, describe, test } from 'node:test'

import { buildFixtureApp } from '../../_tools_/desktop-fixture/build.mjs'
import { launchFixture } from '../../_tools_/desktop-fixture/client.mjs'

// CU-66 S3 'week-calendar', offscreen: blocks and half-hour cells as targets; a drag through the block's own handlers
// snaps to the half hour, keeps the length and records once; outside the grid it goes back; the same slot records
// nothing; the block that moves is the one pressed, whatever the first drag step.

let executable
before(() => {
  executable = buildFixtureApp().executable
})

const EVENTS = [
  { id: 'standup', title: 'Standup', owner: 'Me', day: 'Mon', start: 540, dur: 30 },
  { id: 'review', title: 'Design review', owner: 'Alice', day: 'Wed', start: 600, dur: 60 },
  { id: 'plan', title: 'Planning', owner: 'Bob', day: 'Tue', start: 570, dur: 90 },
]

async function withCalendar(params, body) {
  const fixture = await launchFixture(executable, { offscreen: true })
  try {
    await fixture.open('week-calendar', { title: 'Week', events: EVENTS, ...params })
    return await body(fixture)
  } finally {
    await fixture.close()
  }
}

const moved = (events) => events.filter((e) => e.type === 'moved').map((e) => [e.event, e.day, e.start, e.dur])

describe('week-calendar (CU-66 S3)', () => {
  test('targets: each block and the 100 half-hour cells, inside the window', async () => {
    await withCalendar({}, async (fixture) => {
      const targets = await fixture.targets()
      assert.deepEqual(Object.keys(targets).filter((n) => n.startsWith('ev-')).sort(), ['ev-plan', 'ev-review', 'ev-standup'])
      const cells = Object.keys(targets).filter((n) => n.startsWith('cell-'))
      assert.equal(cells.length, 100)
      assert.ok(targets['cell-Mon-08:00'] && targets['cell-Fri-17:30'])
      for (const name of cells) assert.ok(targets[name].x + targets[name].width <= 700 && targets[name].y + targets[name].height <= 460, name)
      const { fields } = await fixture.state()
      assert.equal(fields['ev-review'], 'Wed 10:00-11:00')
    })
  })

  test('a real-handler drag to another day and time snaps, keeps the length and records once', async () => {
    await withCalendar({}, async (fixture) => {
      // Drag in small steps to Thu 14:00, ending a few points off the slot's corner (snapping takes it).
      await fixture.act({ dragEvent: { id: 'review', path: [{ x: 300, y: 120 }, { x: 420, y: 200 }, { day: 'Thu', start: '14:00' }] } })
      const { events, fields } = await fixture.state()
      assert.deepEqual(moved(events), [['review', 'Thu', '14:00', 60]])
      assert.equal(fields['ev-review'], 'Thu 14:00-15:00')
    })
  })

  test('a first drag step of 25 pt upward still moves the pressed block (the press decides, CU-95)', async () => {
    await withCalendar({}, async (fixture) => {
      // Press near standup's top; the first step jumps 25 pt up - above the block - then on to Fri 16:00.
      await fixture.act({ dragEvent: { id: 'standup', press: { dx: 20, dy: 4 }, path: [{ x: 90, y: 30 }, { day: 'Fri', start: '16:00' }] } })
      const { events } = await fixture.state()
      assert.deepEqual(moved(events), [['standup', 'Fri', '16:00', 30]])
    })
  })

  test('a drop snaps to the nearest half hour, not down: a block top two thirds into 13:30-14:00 lands at 14:00', async () => {
    await withCalendar({}, async (fixture) => {
      // Press at the block's top-left + (10, 8); the release point puts the block top at 13:50 (two thirds of a slot down).
      const grid = { x: 62, y: 44, slot: 20, dayWidth: 125 }
      const top = grid.y + ((13 * 60 + 50 - 8 * 60) / 30) * grid.slot
      await fixture.act({ dragEvent: { id: 'review', path: [{ x: 400, y: 200 }, { x: grid.x + 3 * grid.dayWidth + 3 + 10, y: top + 1 + 8 }] } })
      const { events } = await fixture.state()
      assert.deepEqual(moved(events), [['review', 'Thu', '14:00', 60]])
    })
  })

  test("ids that already start with 'ev-' are not prefixed twice", async () => {
    await withCalendar({ events: [{ id: 'ev-2', title: 'Sync', owner: 'Bob', day: 'Mon', start: 600, dur: 30 }] }, async (fixture) => {
      const targets = await fixture.targets()
      assert.ok(targets['ev-2'] && !targets['ev-ev-2'], Object.keys(targets).filter((n) => n.startsWith('ev-')).join(','))
    })
  })

  test('a drop outside the grid puts the block back with no fact; a drop on its own slot records nothing', async () => {
    await withCalendar({}, async (fixture) => {
      await fixture.act({ dragEvent: { id: 'plan', path: [{ x: 200, y: 200 }, { x: 20, y: 452 }] } })
      await fixture.act({ dragEvent: { id: 'plan', path: [{ x: 210, y: 130 }, { day: 'Tue', start: '09:30' }] } })
      const { events, fields } = await fixture.state()
      assert.deepEqual(moved(events), [])
      assert.equal(fields['ev-plan'], 'Tue 09:30-11:00')
    })
  })

  test('a block dragged past the day end stops at 18:00; the oracle seam records like a drag', async () => {
    await withCalendar({}, async (fixture) => {
      await fixture.act({ dragEvent: { id: 'plan', path: [{ day: 'Mon', start: '17:30' }] } })
      await fixture.act({ moveEvent: { id: 'review', day: 'Fri', start: '08:00' } })
      const { events } = await fixture.state()
      assert.deepEqual(moved(events), [['plan', 'Mon', '16:30', 90], ['review', 'Fri', '08:00', 60]])
    })
  })
})
