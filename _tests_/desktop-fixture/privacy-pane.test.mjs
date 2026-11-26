import assert from 'node:assert/strict'
import { before, describe, test } from 'node:test'

import { buildFixtureApp } from '../../_tools_/desktop-fixture/build.mjs'
import { launchFixture } from '../../_tools_/desktop-fixture/client.mjs'

// CU-787 'privacy-pane', offscreen: a header that states a grant over a table of rows, each an app-name text and an
// UNTITLED switch whose only label is its own row (the live stand-in CU-763's row context lacked). The rows are the
// live set's (open params), never this test's choice of grant rows - the names below are placeholders.

let executable
before(() => {
  executable = buildFixtureApp().executable
})

async function withPane(params, body) {
  const fixture = await launchFixture(executable, { offscreen: true })
  try {
    await fixture.open('privacy-pane', { title: 'Privacy', ...params })
    return await body(fixture)
  } finally {
    await fixture.close()
  }
}

describe('privacy-pane (CU-787)', () => {
  test('defaults: one section, four placeholder rows, all off; each switch and its row text a target', async () => {
    await withPane({}, async (fixture) => {
      const { fields } = await fixture.state()
      assert.equal(fields.privacySections.length, 1)
      assert.deepEqual(fields.privacySections[0].rows, ['App One', 'App Two', 'App Three', 'App Four'].map((name) => ({ name, on: false })))
      const targets = await fixture.targets()
      for (let row = 0; row < 4; row++) {
        assert.ok(targets[`privacy-1-${row}`], `switch ${row}`)
        assert.ok(targets[`privacy-1-${row}-name`], `row text ${row}`)
        assert.ok(targets[`privacy-1-${row}`].cx > targets[`privacy-1-${row}-name`].cx, 'the switch sits right of its row text')
      }
      assert.ok(targets['privacy-1-header'])
      assert.equal(targets['privacy-2-0'], undefined, 'no second section without rows2')
      assert.deepEqual(fields.privacyToggles, [])
    })
  })

  test('the switch has no name of its own; it is a check box (AXSwitch) whose only neighbouring text is its row', async () => {
    await withPane({ rows: 'Row Alpha, Row Beta', rows2: 'Row Gamma' }, async (fixture) => {
      const { fields } = await fixture.state()
      assert.deepEqual(fields.privacySwitchNames, ['', '', ''], 'label, title and help are empty on every switch')
      // A check box with subrole AXSwitch and a 0 / 1 value, as System Settings' privacy switches serve it (the helper
      // reads a toggle's state and row context only for a check box); the only text beside it is its own row's name.
      assert.deepEqual(fields.privacySwitchAX.map((c) => [c.role, c.subrole, c.value, c.cellTexts]), [
        ['AXCheckBox', 'AXSwitch', 0, ['Row Alpha']],
        ['AXCheckBox', 'AXSwitch', 0, ['Row Beta']],
        ['AXCheckBox', 'AXSwitch', 0, ['Row Gamma']],
      ], JSON.stringify(fields.privacySwitchAX))
      for (const c of fields.privacySwitchAX) assert.ok(c.ancestors.length > 0, `an accessible ancestor chain: ${JSON.stringify(c.ancestors)}`)
      const audit = await fixture.axAudit()
      for (const key of ['privacy-1-0', 'privacy-1-1', 'privacy-2-0']) {
        assert.equal(audit[key].role, 'AXCheckBox', key)
        assert.equal(audit[key].name, null, `${key}: Accessibility finds no name at the switch`)
      }
      assert.equal(audit['privacy-1-0-name'].name, 'Row Alpha')
    })
  })

  test('params: headers, two sections, start state; a toggle records only itself and fields follow', async () => {
    const header = 'Allow the applications below to do the placeholder thing.'
    await withPane({ header, rows: ['Row Alpha', 'Row Beta'], header2: 'Placeholder second header.', rows2: ['Row Gamma'], on: 'Row Beta' }, async (fixture) => {
      let { fields } = await fixture.state()
      assert.deepEqual(fields.privacySections.map((s) => [s.index, s.header, s.rows]), [
        [1, header, [{ name: 'Row Alpha', on: false }, { name: 'Row Beta', on: true }]],
        [2, 'Placeholder second header.', [{ name: 'Row Gamma', on: false }]],
      ])
      await fixture.act({ privacyToggle: 'privacy-1-0' })
      await fixture.act({ privacyToggle: 'privacy-1-1' })
      ;({ fields } = await fixture.state())
      assert.deepEqual(fields.privacyToggles, [
        { section: 1, row: 0, name: 'Row Alpha', on: true },
        { section: 1, row: 1, name: 'Row Beta', on: false },
      ])
      assert.deepEqual(fields.privacySections[0].rows, [{ name: 'Row Alpha', on: true }, { name: 'Row Beta', on: false }])
      assert.deepEqual(fields.privacySections[1].rows, [{ name: 'Row Gamma', on: false }], 'the other section is untouched')
      const { events } = await fixture.state()
      assert.deepEqual(events.filter((e) => e.type === 'privacy-toggled').length, 2)
    })
  })
})
