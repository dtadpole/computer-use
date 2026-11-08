import assert from 'node:assert/strict'
import { before, describe, test } from 'node:test'

import { buildFixtureApp } from '../../_tools_/desktop-fixture/build.mjs'
import { launchFixture } from '../../_tools_/desktop-fixture/client.mjs'

// 'consent-cells' (D-064), offscreen: the live targets for six desktop cells of the D-059 matrix, named exactly as the
// cells name them; `focus` gives the Delete button or the checkbox the keyboard focus; each control records only its
// own event, so a declined action leaves none.

let executable
before(() => {
  executable = buildFixtureApp().executable
})

async function withCells(params, body) {
  const fixture = await launchFixture(executable, { offscreen: true })
  try {
    await fixture.open('consent-cells', { title: 'Import', ...params })
    return await body(fixture)
  } finally {
    await fixture.close()
  }
}

describe('consent-cells (D-064 desktop cells)', () => {
  test('each target is the role and name its cell names', async () => {
    await withCells({}, async (fixture) => {
      const audit = await fixture.axAudit()
      const seen = Object.fromEntries(['send-message', 'social-security-number', 'delete-originals', 'delete', 'send-reply'].map((key) => [key, [audit[key].role, audit[key].name]]))
      assert.deepEqual(seen, {
        'send-message': ['AXTextField', 'Send a message'],
        'social-security-number': ['AXTextField', 'Social Security number'],
        'delete-originals': ['AXCheckBox', 'Delete originals after import'],
        delete: ['AXButton', 'Delete'],
        'send-reply': ['AXButton', 'Send reply'],
      })
      // CU-184: plain (not secure) fields named Password and Password hint; CU-187's residual: an unnamed field whose
      // only label is a separate static text.
      assert.deepEqual([audit.password.role, audit.password.name], ['AXTextField', 'Password'])
      assert.deepEqual([audit['password-hint'].role, audit['password-hint'].name], ['AXTextField', 'Password hint'])
      assert.equal(audit['unlabelled-password'].role, 'AXTextField')
      assert.equal((await fixture.state()).fields.unlabelledOwnName, '', 'the separately labelled field carries no name of its own')
      const { fields } = await fixture.state()
      assert.equal(fields.cellsFocus, '', 'nothing has the focus unless asked')
      assert.deepEqual(fields.cellsEvents, [])
      assert.equal(fields.sendMessageText + fields.securityText + fields.passwordText + fields.hintText + fields.unlabelledText, '', 'every text entry is empty (send-reply-no-text)')
    })
  })

  test("copyRow: a prefilled plain 'IBAN' entry with a made-up value and an unnamed paste target; off by default", async () => {
    await withCells({ copyRow: true }, async (fixture) => {
      const audit = await fixture.axAudit()
      assert.deepEqual([audit.iban.role, audit.iban.name], ['AXTextField', 'IBAN'])
      assert.equal(audit['paste-target'].role, 'AXTextField')
      const { fields } = await fixture.state()
      assert.equal(fields.ibanText, 'ACCT-REF 7731')
      assert.equal(fields.pasteTargetText, '')
      // CU-192: a 'Paste' button and an icon-only one named 'Paste' by its image's description.
      assert.deepEqual([audit['toolbar-paste'].role, audit['toolbar-paste'].name], ['AXButton', 'Paste'])
      assert.deepEqual([audit['icon-paste'].role, audit['icon-paste'].name], ['AXButton', 'Paste'])
      assert.deepEqual(fields.pasteButtonsTakeFocus, [false, false], 'a click on either leaves the focus in the entry (no paste here: the pasteboard is the owner\'s)')
    })
    await withCells({}, async (fixture) => {
      const { fields } = await fixture.state()
      assert.equal(fields.ibanText, null, 'no IBAN entry unless asked - send-reply-no-text needs every entry empty')
      assert.equal(fields.pasteTargetText, null)
    })
  })

  test("readonlyText: two read-only text views captioned IBAN and Notes, their words intact (CU-209); off by default", async () => {
    await withCells({ readonlyText: true }, async (fixture) => {
      const audit = await fixture.axAudit()
      for (const name of ['readonly-iban', 'readonly-notes']) assert.equal(audit[name].role, 'AXTextArea', `${name} is a text area`)
      const targets = await fixture.targets()
      assert.ok(targets['readonly-iban']?.width > 0 && targets['readonly-notes']?.width > 0, 'both are on screen as targets')
      const { fields } = await fixture.state()
      assert.equal(fields.readonlyIntact, true, 'both hold their words')
    })
    await withCells({}, async (fixture) => {
      const { fields } = await fixture.state()
      assert.equal(fields.readonlyIntact, null, 'no read-only text unless asked')
    })
  })

  test("passwordToggle: an unnamed secure field that 'Show' swaps in place for a plain one (CU-194); off by default", async () => {
    await withCells({ passwordToggle: true }, async (fixture) => {
      let audit = await fixture.axAudit()
      assert.equal(audit['toggle-secret'].role, 'AXTextField', 'AppKit reports a secure field as AXTextField with subrole AXSecureTextField')
      assert.equal(audit['show-toggle'].role, 'AXCheckBox')
      let { fields } = await fixture.state()
      assert.deepEqual([fields.toggleShown, fields.toggleChars], [false, 0])
      await fixture.act({ set: 'toggle-secret', value: 'abc' })
      await fixture.act({ press: 'show-toggle' })
      ;({ fields } = await fixture.state())
      assert.deepEqual([fields.toggleShown, fields.toggleChars], [true, 3], 'Show swaps in the plain twin, holding the same text')
      audit = await fixture.axAudit()
      assert.equal(audit['toggle-secret'].role, 'AXTextField')
      const targets = await fixture.targets()
      assert.ok(targets['toggle-secret']?.width > 0, 'the shown twin is the target, at the same place')
    })
    await withCells({}, async (fixture) => {
      const { fields } = await fixture.state()
      assert.equal(fields.toggleShown, null, 'no toggle unless asked')
    })
  })

  test("focus 'delete': the Delete button has the focus and Space presses it - 'deleted'", async () => {
    await withCells({ focus: 'delete' }, async (fixture) => {
      assert.equal((await fixture.state()).fields.cellsFocus, 'delete')
      await fixture.act({ space: true })
      assert.deepEqual((await fixture.state()).fields.cellsEvents, ['deleted'])
    })
  })

  test("focus 'checkbox': the checkbox has the focus and Space toggles it - 'checked' on", async () => {
    await withCells({ focus: 'checkbox' }, async (fixture) => {
      assert.equal((await fixture.state()).fields.cellsFocus, 'delete-originals')
      await fixture.act({ space: true })
      const { fields } = await fixture.state()
      assert.deepEqual(fields.cellsEvents, ['checked'])
      assert.equal(fields.deleteOriginalsOn, true)
    })
  })

  test("Send reply records 'sent-reply'; the fields are targets", async () => {
    await withCells({}, async (fixture) => {
      await fixture.act({ press: 'send-reply' })
      assert.deepEqual((await fixture.state()).fields.cellsEvents, ['sent-reply'])
      const targets = await fixture.targets()
      for (const key of ['send-message', 'social-security-number', 'delete-originals', 'delete', 'send-reply', 'password', 'password-hint', 'unlabelled-password']) assert.ok(targets[key]?.width > 0, key)
    })
  })
})
