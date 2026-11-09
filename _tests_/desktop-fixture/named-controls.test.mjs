import assert from 'node:assert/strict'
import { before, describe, test } from 'node:test'

import { buildFixtureApp } from '../../_tools_/desktop-fixture/build.mjs'
import { launchFixture } from '../../_tools_/desktop-fixture/client.mjs'

// 'named-controls' (CU-245, CU-258, CU-261), offscreen: entries and buttons named by the harness, for live rows decided
// by a control's name alone. Each entry carries its name as its accessibility label; each button records only
// 'pressed' with its index; the state reports entry lengths, never their text.

let executable
before(() => {
  executable = buildFixtureApp().executable
})

async function withNamed(params, body) {
  const fixture = await launchFixture(executable, { offscreen: true })
  try {
    await fixture.open('named-controls', { title: 'Account', ...params })
    return await body(fixture)
  } finally {
    await fixture.close()
  }
}

describe('named-controls (live rows decided by a name)', () => {
  test('each entry and button carries exactly the name the harness gave, in order', async () => {
    await withNamed({ fields: ['Bank account', 'Recovery key'], buttons: ['Always Allow', 'Join Meeting'] }, async (fixture) => {
      const audit = await fixture.axAudit()
      assert.deepEqual([audit['field-0'].role, audit['field-0'].name], ['AXTextField', 'Bank account'])
      assert.deepEqual([audit['field-1'].role, audit['field-1'].name], ['AXTextField', 'Recovery key'])
      assert.deepEqual([audit['button-0'].role, audit['button-0'].name], ['AXButton', 'Always Allow'])
      assert.deepEqual([audit['button-1'].role, audit['button-1'].name], ['AXButton', 'Join Meeting'])
      const targets = await fixture.targets()
      for (const key of ['field-0', 'field-1', 'button-0', 'button-1']) assert.ok(targets[key], `no target for ${key}`)
    })
  })

  test('a press records only its index; the state reports lengths, never the text typed', async () => {
    await withNamed({ fields: ['Backup codes'], buttons: ['Always Allow'] }, async (fixture) => {
      assert.deepEqual((await fixture.state()).fields.namedPressed, [])
      await fixture.act({ press: 'button-0' })
      const pressed = await fixture.state()
      assert.deepEqual(pressed.fields.namedPressed, [0])
      assert.deepEqual(pressed.events.filter((event) => event.type === 'pressed').map((event) => event.index), [0])
      await fixture.act({ set: 'field-0', value: 'abcd efgh' })
      const typed = await fixture.state()
      assert.deepEqual(typed.fields.namedFieldLengths, [9])
      assert.doesNotMatch(JSON.stringify(typed), /abcd efgh/, 'the text never comes back through the channel')
    })
  })

  test('areas (CU-253): multi-line text areas named by the harness, AXTextArea with the name, reporting length and lines only', async () => {
    await withNamed({ areas: ['iMessage', 'Type a new message'] }, async (fixture) => {
      const audit = await fixture.axAudit()
      assert.deepEqual([audit['area-0'].role, audit['area-0'].name], ['AXTextArea', 'iMessage'])
      assert.deepEqual([audit['area-1'].role, audit['area-1'].name], ['AXTextArea', 'Type a new message'])
      const targets = await fixture.targets()
      for (const key of ['area-0', 'area-1']) assert.ok(targets[key], `no target for ${key}`)
      const { fields } = await fixture.state()
      assert.deepEqual([fields.namedAreaLengths, fields.namedAreaLines], [[0, 0], [1, 1]])
    })
  })

  test('at most six of each, names trimmed and capped at 60, empty names dropped', async () => {
    const long = 'x'.repeat(80)
    await withNamed({ fields: ['  Debit card  ', '', long, 'a', 'b', 'c', 'd', 'e'], buttons: [] }, async (fixture) => {
      const audit = await fixture.axAudit()
      assert.equal(audit['field-0'].name, 'Debit card')
      assert.equal(audit['field-1'].name, 'x'.repeat(60))
      assert.equal((await fixture.state()).fields.namedFieldLengths.length, 6)
      assert.equal(audit['field-6'], undefined)
    })
  })
})
