import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

import { buildFixtureApp } from '../../_tools_/desktop-fixture/build.mjs'
import { launchFixture } from '../../_tools_/desktop-fixture/client.mjs'

// CU-329 (live row 5's observer): CU Fixture answers AXManualAccessibility on its application element as an Electron
// app does - no value until set, then the stored boolean, settable, listed - and records every outside write, value
// only, in order. Launches CU Fixture offscreen, so it runs under the desktop-run lock (CU-305), like the other
// fixture-app tests.

let fixture
before(async () => {
  fixture = await launchFixture(buildFixtureApp().executable, { offscreen: true })
})
after(async () => {
  await fixture?.close()
})

test('never set: supported, no value, no writes', async () => {
  assert.deepEqual(await fixture.call('manualAX'), { supported: true, value: null, writes: [] })
})

test('a write through the Accessibility entry point is stored, read back, listed as settable, and recorded once', async () => {
  const out = await fixture.call('manualAXSelfTest')
  assert.deepEqual([out.readBack, out.settable, out.listed, out.value, out.writes], [true, true, true, true, [true]])
  assert.deepEqual(await fixture.call('manualAX'), { supported: true, value: null, writes: [] }, 'the self-test clears after itself')
})

test('a preset (the user or another assistive app set it) is not a write; null clears it back to no value', async () => {
  assert.deepEqual(await fixture.call('manualAXPreset', { on: true }), { supported: true, value: true, writes: [] })
  assert.deepEqual(await fixture.call('manualAXPreset', { on: null }), { supported: true, value: null, writes: [] })
})
