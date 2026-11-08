import assert from 'node:assert/strict'
import { before, describe, test } from 'node:test'

import { buildFixtureApp } from '../../_tools_/desktop-fixture/build.mjs'
import { launchFixture } from '../../_tools_/desktop-fixture/client.mjs'

// S11 keypad (CU-71), offscreen: the layout (14 pt keys, 4 pt gaps), the facts per press, and that no expected value
// sits in the window.

let executable
before(() => {
  executable = buildFixtureApp().executable
})

async function withKeypad(params, body) {
  const fixture = await launchFixture(executable, { offscreen: true })
  try {
    await fixture.open('keypad-code', params)
    return await body(fixture)
  } finally {
    await fixture.close()
  }
}

describe('S11 keypad-code (CU-71)', () => {
  test('keys are 14 x 14 pt with 4 pt gaps, laid out 1-2-3 / 4-5-6 / 7-8-9 / clear-0-ok', async () => {
    await withKeypad({ length: 4 }, async (fixture) => {
      const targets = await fixture.targets()
      const at = (name) => [targets[name].x, targets[name].y, targets[name].width, targets[name].height]
      assert.deepEqual(at('key-1'), [16, 70, 14, 14])
      assert.deepEqual(at('key-2'), [34, 70, 14, 14])
      assert.deepEqual(at('key-6'), [52, 88, 14, 14])
      assert.deepEqual(at('clear'), [16, 124, 14, 14])
      assert.deepEqual(at('key-0'), [34, 124, 14, 14])
      assert.deepEqual(at('ok'), [52, 124, 14, 14])
      for (let digit = 0; digit <= 9; digit += 1) assert.ok(targets[`key-${digit}`], `no key-${digit}`)
    })
  })

  test('presses are recorded per key; ok records the code entered, digits past the length are ignored, clear empties it', async () => {
    await withKeypad({ length: 4 }, async (fixture) => {
      for (const key of ['key-1', 'key-9', 'clear', 'key-4', 'key-0', 'key-7', 'key-2', 'key-8', 'ok']) await fixture.act({ press: key })
      const { events } = await fixture.state()
      assert.deepEqual(events.filter((e) => e.type === 'press').map((e) => e.target), ['key-1', 'key-9', 'clear', 'key-4', 'key-0', 'key-7', 'key-2', 'key-8', 'ok'])
      assert.equal(events.filter((e) => e.type === 'cleared').length, 1)
      assert.deepEqual(events.filter((e) => e.type === 'entered').map((e) => e.code), ['4072'])
    })
  })

  test('the window shows no code before any press: only the heading, the key labels and an empty line', async () => {
    await withKeypad({ length: 4, origin: { x: 300, y: 200 } }, async (fixture) => {
      const { visible } = await fixture.call('ax')
      const text = [...new Set(visible.filter((v) => v !== ''))].sort()
      assert.deepEqual(text, ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', 'Door code', 'OK'].sort())
    })
  })
})
