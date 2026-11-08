import assert from 'node:assert/strict'
import { before, describe, test } from 'node:test'

import { buildFixtureApp } from '../../_tools_/desktop-fixture/build.mjs'
import { launchFixture } from '../../_tools_/desktop-fixture/client.mjs'

// 'consent-keys' (CU-142, CU-143 live rows), offscreen: a focused single-line field in a window whose default button is
// 'Send' (Return presses it and records 'sent'); a Test menu whose Command-Backspace chords only record 'menu-fired';
// the menu exists only on this screen. The in-process key seam models AppKit's order; the live rows decide the rest.

let executable
before(() => {
  executable = buildFixtureApp().executable
})

async function withKeys(body) {
  const fixture = await launchFixture(executable, { offscreen: true })
  try {
    await fixture.open('consent-keys', { title: 'Quick message' })
    return await body(fixture)
  } finally {
    await fixture.close()
  }
}

describe('consent-keys (CU-142, CU-143)', () => {
  test("the window's default button is 'Send'; the field and Send are named targets", async () => {
    await withKeys(async (fixture) => {
      const { fields } = await fixture.state()
      assert.equal(fields.defaultButton, 'Send')
      const audit = await fixture.axAudit()
      assert.deepEqual([audit.send.role, audit.send.name], ['AXButton', 'Send'])
      assert.equal(audit.message.role, 'AXTextField')
      assert.deepEqual([audit.notes.role, audit.notes.name], ['AXTextArea', 'Notes'], 'a named text area in the same window')
    })
  })

  test("Return in the field presses the default button: 'sent' with the text", async () => {
    await withKeys(async (fixture) => {
      await fixture.act({ set: 'message', value: 'ok' })
      await fixture.act({ keyEquivalent: { key: 'return' } })
      const { events, fields } = await fixture.state()
      assert.deepEqual(events.filter((e) => e.type === 'sent').map((e) => [e.text, e.via]), [['ok', 'button']])
      assert.equal(fields.sentCount, 1)
    })
  })

  test("a typed U+0003 (keypad Enter's character) in the field sends too - CU-149's live row expects it never to arrive", async () => {
    await withKeys(async (fixture) => {
      await fixture.act({ typeInto: { text: 'ok\u0003' } })
      const { events } = await fixture.state()
      assert.deepEqual(events.filter((e) => e.type === 'sent').map((e) => [e.text, e.via]), [['ok', 'enter-character']])
    })
  })

  test('the Test menu declares the three Backspace chords; a chord fires a Test item, which only records that it fired', async () => {
    await withKeys(async (fixture) => {
      const { fields } = await fixture.state()
      assert.deepEqual(fields.menuChords, [
        { title: 'Empty Bin', key: 'backspace', modifiers: ['cmd', 'alt', 'shift'] },
        { title: 'Delete Now', key: 'backspace', modifiers: ['cmd', 'alt'] },
        { title: 'Clear All', key: 'backspace', modifiers: ['cmd', 'shift'] },
        { title: 'Clear Line', key: 'backspace', modifiers: ['cmd'] },
      ])
      // Option is respected in process; which item a Shift chord reaches is the live row's question (see the source).
      await fixture.act({ keyEquivalent: { key: 'backspace', modifiers: ['cmd', 'alt', 'shift'] } })
      const { events } = await fixture.state()
      assert.deepEqual(events.filter((e) => e.type === 'menu-fired').map((e) => e.item), ['Empty Bin'])
      assert.equal(events.filter((e) => e.type === 'sent').length, 0)
    })
  })

  test("CU-146's controls: 'Move to Trash' is a button that records 'trashed'; 'Trash' is a link that records 'opened-trash'", async () => {
    await withKeys(async (fixture) => {
      const audit = await fixture.axAudit()
      assert.deepEqual([audit['move-to-trash'].role, audit['move-to-trash'].name], ['AXButton', 'Move to Trash'])
      assert.deepEqual([audit['trash-link'].role, audit['trash-link'].name], ['AXLink', 'Trash'])
      await fixture.act({ press: 'trash-link' })
      await fixture.act({ press: 'move-to-trash' })
      const { events } = await fixture.state()
      assert.deepEqual(events.filter((e) => ['trashed', 'opened-trash'].includes(e.type)).map((e) => e.type), ['opened-trash', 'trashed'])
    })
  })

  test("CU-147's list: 'Drafts' is a named table; Backspace on a selected row deletes it and records 'row-deleted'", async () => {
    await withKeys(async (fixture) => {
      const audit = await fixture.axAudit()
      assert.equal(audit.drafts.role === 'AXTable' || audit.drafts.role === 'AXRow' || audit.drafts.role === 'AXCell' || audit.drafts.role === 'AXStaticText', true, JSON.stringify(audit.drafts))
      await fixture.act({ selectDraft: { index: 1 } })
      let { fields } = await fixture.state()
      assert.equal(fields.selectedDraft, 'Offsite agenda')
      await fixture.act({ tableKey: { key: 'backspace' } })
      ;({ fields } = await fixture.state())
      const { events } = await fixture.state()
      assert.deepEqual(events.filter((e) => e.type === 'row-deleted').map((e) => e.name), ['Offsite agenda'])
      assert.deepEqual(fields.drafts, ['Q3 budget notes', 'Reply to Dana'])
    })
  })

  test("CU-135's sheet: 'Export…' opens the Replace alert; Replace records 'replace-confirmed', Cancel 'replace-cancelled'", async () => {
    await withKeys(async (fixture) => {
      await fixture.act({ press: 'export' })
      let { fields } = await fixture.state()
      assert.equal(fields.sheet, 'replace')
      const audit = await fixture.axAudit()
      assert.deepEqual([audit.replace.role, audit.replace.name], ['AXButton', 'Replace'])
      // The click rows need the sheet's origin: windows() lists 'main:sheet' and Replace's target counts in it.
      const windows = await fixture.call('windows')
      const targets = await fixture.targets()
      assert.ok(windows['main:sheet'], JSON.stringify(Object.keys(windows)))
      assert.equal(targets.replace.window, 'main:sheet')
      assert.ok(targets.replace.cx > 0 && targets.replace.cx < windows['main:sheet'].width && targets.replace.cy < windows['main:sheet'].height)
      await fixture.act({ press: 'cancel-replace' })
      await fixture.act({ press: 'export' })
      await fixture.act({ press: 'replace' })
      ;({ fields } = await fixture.state())
      const { events } = await fixture.state()
      assert.equal(fields.sheet, null)
      assert.deepEqual(events.filter((e) => e.type.startsWith('replace-')).map((e) => e.type), ['replace-cancelled', 'replace-confirmed'])
    })
  })

  test("CU-148's sheet: 'Close…' opens the save-changes alert; Don't Save (Command-D) records 'discarded', Cancel 'close-cancelled'", async () => {
    await withKeys(async (fixture) => {
      await fixture.act({ press: 'close-document' })
      assert.equal((await fixture.state()).fields.sheet, 'dont-save')
      const audit = await fixture.axAudit()
      assert.deepEqual([audit['dont-save'].role, audit['dont-save'].name], ['AXButton', 'Don\u2019t Save'])
      await fixture.act({ press: 'cancel-close' })
      await fixture.act({ press: 'close-document' })
      await fixture.act({ press: 'dont-save' })
      const { events, fields } = await fixture.state()
      assert.equal(fields.sheet, null)
      assert.deepEqual(events.filter((e) => ['saved', 'discarded', 'close-cancelled'].includes(e.type)).map((e) => e.type), ['close-cancelled', 'discarded'])
    })
  })

  test("CU-148's nothing-focused variant: with closeSheetNoFocus the Close… sheet's buttons refuse the keyboard - nothing holds it", async () => {
    const fixture = await launchFixture(executable, { offscreen: true })
    try {
      await fixture.open('consent-keys', { title: 'Quick message', closeSheetNoFocus: true })
      await fixture.act({ press: 'close-document' })
      const { fields } = await fixture.state()
      assert.equal(fields.sheet, 'dont-save')
      assert.equal(fields.sheetFocus, 'window', 'no control holds the keyboard in the sheet')
      await fixture.act({ press: 'dont-save' })
      const { events } = await fixture.state()
      assert.deepEqual(events.filter((e) => e.type === 'discarded').length, 1, 'its buttons still work')
    } finally {
      await fixture.close()
    }
  })

  test('the Test menu belongs to this screen: gone after another screen opens', async () => {
    const fixture = await launchFixture(executable, { offscreen: true })
    try {
      await fixture.open('consent-keys', { title: 'Quick message' })
      await fixture.act({ menu: 'Empty Bin' })
      await fixture.open('hold-confirm', { title: 'Archive' })
      await assert.rejects(fixture.act({ menu: 'Empty Bin' }), /no menu item Empty Bin/)
    } finally {
      await fixture.close()
    }
  })
})
