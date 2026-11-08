import assert from 'node:assert/strict'
import { before, describe, test } from 'node:test'

import { buildFixtureApp } from '../../_tools_/desktop-fixture/build.mjs'
import { launchFixture } from '../../_tools_/desktop-fixture/client.mjs'
import { DESKTOP_TASKS, expectedFor } from '../../_tools_/desktop-fixture/tasks.mjs'

// CU-137: every target on every task screen is an Accessibility element with a role and a name - what the agent's
// policy reads to class an action (a destructive press on a bare view read as the window was never asked about).
// Text inputs may go unnamed: their role says what they are. The audit walks Accessibility's own tree in process
// (an offscreen window answers no system hit test).

let executable
before(() => {
  executable = buildFixtureApp().executable
})

const TEXT_INPUTS = new Set(['AXTextField', 'AXTextArea', 'AXSearchField', 'AXComboBox'])
const screens = new Map()
for (const [id, task] of Object.entries(DESKTOP_TASKS)) {
  const screen = task.screen ?? id
  if (!screens.has(screen)) screens.set(screen, task.params ? task.params(expectedFor(id, 'p1')) : {})
}

describe('every target is a named Accessibility element (CU-137)', () => {
  for (const [screen, params] of screens) {
    test(screen, async () => {
      const fixture = await launchFixture(executable, { offscreen: true })
      try {
        await fixture.open(screen, params)
        const audit = await fixture.axAudit()
        const weak = Object.entries(audit).filter(([, a]) => !a.role || a.role === 'AXWindow' || a.role === 'AXUnknown' || (!a.name && !TEXT_INPUTS.has(a.role)))
        assert.deepEqual(weak.map(([name, a]) => `${name}: ${a.role} ${JSON.stringify(a.name)} (${a.element})`), [])
      } finally {
        await fixture.close()
      }
    })
  }
})

describe('hold-confirm names its controls (CU-137)', () => {
  test("Delete is the button 'Delete archive (hold)', then 'Archive deleted'; Arm is a button whose name leads with 'Arm'", async () => {
    const fixture = await launchFixture(executable, { offscreen: true })
    try {
      await fixture.open('hold-confirm', { title: 'Archive', thresholdMs: 300 })
      let audit = await fixture.axAudit()
      assert.deepEqual([audit['delete-archive'].role, audit['delete-archive'].name], ['AXButton', 'Delete archive (hold)'])
      assert.equal(audit.arm.role, 'AXButton')
      assert.match(audit.arm.name, /^Arm/)
      await fixture.act({ pressFor: { target: 'delete-archive', ms: 450 } })
      audit = await fixture.axAudit()
      assert.equal(audit['delete-archive'].name, 'Archive deleted')
    } finally {
      await fixture.close()
    }
  })
})
