import assert from 'node:assert/strict'
import { before, describe, test } from 'node:test'

import { buildFixtureApp } from '../../_tools_/desktop-fixture/build.mjs'
import { launchFixture } from '../../_tools_/desktop-fixture/client.mjs'

// CU-64's fixture item 'hold-confirm', offscreen: a long press confirms, a short one cancels, a burst of short presses
// is a burst of cancels; Space held long enough arms, and the system's auto-repeat downs do not restart the hold.

let executable
before(() => {
  executable = buildFixtureApp().executable
})

async function withHold(params, body) {
  const fixture = await launchFixture(executable, { offscreen: true })
  try {
    await fixture.open('hold-confirm', { title: 'Archive', ...params })
    return await body(fixture)
  } finally {
    await fixture.close()
  }
}

const outcomes = (events) => events.filter((e) => ['confirmed', 'cancelled', 'armed'].includes(e.type)).map((e) => [e.type, e.target])

describe('hold-confirm (CU-64)', () => {
  test('targets: the delete button and the arm control', async () => {
    await withHold({}, async (fixture) => {
      const targets = await fixture.targets()
      assert.ok(targets['delete-archive'] && targets.arm)
      const { fields } = await fixture.state()
      assert.deepEqual([fields.deleted, fields.armed], [false, false])
    })
  })

  test("the arm control says 'Arm' in every state and sits in its own section, apart from the delete button (CU-116)", async () => {
    await withHold({}, async (fixture) => {
      const targets = await fixture.targets()
      const gap = targets.arm.y - (targets['delete-archive'].y + targets['delete-archive'].height)
      assert.ok(gap >= 60, `the arm control is ${gap} pt below the delete button`)
      let { fields } = await fixture.state()
      assert.equal(fields.armLabel, 'Arm - hold Space for 2 s', 'focused at open')
      await fixture.act({ hold: { target: 'arm', ms: 1000 } })
      ;({ fields } = await fixture.state())
      assert.equal(fields.armLabel, 'Arm: armed')
    })
  })

  test('the label asks for more than the threshold: following the screen (a 2 s Space hold) arms; 1 s exactly is the boundary (CU-124)', async () => {
    await withHold({}, async (fixture) => {
      const { fields } = await fixture.state()
      const asked = Number(/(\d+) s/.exec(fields.armLabel)?.[1]) * 1000
      assert.ok(asked >= 2000, `the focused label asks for ${asked} ms against the 1000 ms threshold`)
      await fixture.act({ hold: { target: 'arm', ms: asked } })
      const after = await fixture.state()
      assert.equal(after.fields.armed, true)
    })
  })

  test('the focused arm control says so (armFocused, drawn as a focus ring); a confirmed delete shows on screen and takes no more presses (CU-124, CU-88)', async () => {
    await withHold({ thresholdMs: 300 }, async (fixture) => {
      let { fields } = await fixture.state()
      assert.equal(fields.armFocused, true, 'the arm control has the focus at open')
      await fixture.act({ pressFor: { target: 'delete-archive', ms: 450 } })
      ;({ fields } = await fixture.state())
      assert.deepEqual([fields.deleted, fields.deleteLabel], [true, 'Archive deleted'])
      await fixture.act({ pressFor: { target: 'delete-archive', ms: 450 } })
      const { events } = await fixture.state()
      assert.equal(events.filter((e) => e.type === 'press-began' && e.target === 'delete-archive').length, 1, 'a press after the delete was taken')
      assert.equal(events.filter((e) => e.type === 'confirmed').length, 1)
    })
  })

  test('the real handlers: a short press cancels, a press past the threshold confirms; the facts carry the held time', async () => {
    await withHold({ thresholdMs: 400 }, async (fixture) => {
      await fixture.act({ pressFor: { target: 'delete-archive', ms: 100 } })
      await fixture.act({ pressFor: { target: 'delete-archive', ms: 100 } })
      await fixture.act({ pressFor: { target: 'delete-archive', ms: 550 } })
      const { events, fields } = await fixture.state()
      assert.deepEqual(outcomes(events), [['cancelled', 'delete-archive'], ['cancelled', 'delete-archive'], ['confirmed', 'delete-archive']])
      const confirmed = events.find((e) => e.type === 'confirmed')
      assert.ok(confirmed.heldMs >= 540 && confirmed.heldMs < 1500, `heldMs ${confirmed.heldMs}`)
      assert.ok(events.filter((e) => e.type === 'cancelled').every((e) => e.heldMs < 400))
      assert.equal(fields.deleted, true)
    })
  })

  test('Space held past the threshold arms, auto-repeat downs do not restart it; a short hold cancels', async () => {
    await withHold({ armMs: 300 }, async (fixture) => {
      await fixture.act({ pressFor: { target: 'arm', ms: 100 } })
      await fixture.act({ pressFor: { target: 'arm', ms: 450, repeats: 5 } })
      const { events, fields } = await fixture.state()
      assert.deepEqual(outcomes(events), [['cancelled', 'arm'], ['armed', 'arm']])
      assert.ok(events.find((e) => e.type === 'armed').heldMs >= 440, 'a repeat restarted the hold')
      assert.equal(fields.armed, true)
    })
  })

  test('the oracle seam decides the same way (1.5 s and 1 s by default)', async () => {
    await withHold({}, async (fixture) => {
      await fixture.act({ hold: { target: 'delete-archive', ms: 1499 } })
      await fixture.act({ hold: { target: 'delete-archive', ms: 1500 } })
      await fixture.act({ hold: { target: 'arm', ms: 1000 } })
      const { events } = await fixture.state()
      assert.deepEqual(outcomes(events), [['cancelled', 'delete-archive'], ['confirmed', 'delete-archive'], ['armed', 'arm']])
    })
  })
})
