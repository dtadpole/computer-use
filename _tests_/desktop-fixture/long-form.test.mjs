import assert from 'node:assert/strict'
import { before, describe, test } from 'node:test'

import { buildFixtureApp } from '../../_tools_/desktop-fixture/build.mjs'
import { launchFixture } from '../../_tools_/desktop-fixture/client.mjs'

// CU-66 S9, offscreen: CU Fixture's 'long-form' shows four fields above the fold - the last four and Submit become
// targets only once scrolled to; Submit records every value and says so on screen. CU Ledger's 'ledger-vendor' shows
// the record's values as selectable text. The form's window ends left of CU Ledger's default x (800).

let executable
before(() => {
  executable = buildFixtureApp().executable
})

const RECORD = { vendor: 'Brightline Supplies', contact: 'Ana Ortiz', email: 'ana@brightline.example', phone: '+1 415 555 0142', taxId: '94-1234567', iban: ('GB33BUKB' + '20201555555555'), terms: 'Net 45', currency: 'GBP' }

describe('long-form + ledger-vendor (CU-66 S9)', () => {
  test('four fields above the fold; the last four and Submit become targets once scrolled to; the form is 600 pt wide', async () => {
    const fixture = await launchFixture(executable, { offscreen: true })
    try {
      await fixture.open('long-form', { title: 'Vendors' })
      let targets = await fixture.targets()
      for (const key of ['vendor', 'contact', 'email', 'phone']) assert.ok(targets[key], key)
      for (const key of ['taxId', 'iban', 'terms', 'currency', 'submit']) assert.equal(targets[key], undefined, key)
      const windows = await fixture.windows?.().catch(() => null)
      if (windows?.main) assert.equal(windows.main.width, 600)
      await fixture.act({ scrollTo: 'submit' })
      targets = await fixture.targets()
      for (const key of ['taxId', 'iban', 'terms', 'currency', 'submit']) assert.ok(targets[key], key)
      assert.equal(targets.vendor, undefined, 'the first field has scrolled out of view')
    } finally {
      await fixture.close()
    }
  })

  test('every input is named by its label, so a question names the field (cu-researcher\'s first live run)', async () => {
    const fixture = await launchFixture(executable, { offscreen: true })
    try {
      await fixture.open('long-form', { title: 'New vendor' })
      const { fields } = await fixture.state()
      assert.deepEqual(fields.axLabels, { vendor: 'Vendor', contact: 'Contact', email: 'Email', phone: 'Phone', taxId: 'Tax ID', iban: 'IBAN', terms: 'Payment terms', currency: 'Currency' })
      const audit = await fixture.axAudit()
      for (const [key, name] of [['vendor', 'Vendor'], ['contact', 'Contact'], ['email', 'Email'], ['phone', 'Phone']]) {
        assert.equal(audit[key].name, name, `the ${key} input as Accessibility reports it`)
      }
    } finally {
      await fixture.close()
    }
  })

  test('Submit records every value, popups included, and shows Submitted', async () => {
    const fixture = await launchFixture(executable, { offscreen: true })
    try {
      await fixture.open('long-form', { title: 'Vendors' })
      assert.equal((await fixture.state()).fields.submittedNote, null, 'no note before Submit')
      for (const key of ['vendor', 'contact', 'email', 'phone']) await fixture.act({ set: key, value: RECORD[key] })
      await fixture.act({ scrollTo: 'currency' })
      for (const key of ['taxId', 'iban']) await fixture.act({ set: key, value: RECORD[key] })
      await fixture.act({ select: 'terms', value: 'Net 45' })
      await fixture.act({ select: 'currency', value: 'GBP' })
      await fixture.act({ scrollTo: 'submit' })
      await fixture.act({ press: 'submit' })
      const { events, fields } = await fixture.state()
      assert.deepEqual(events.filter((e) => e.type === 'submitted').map((e) => e.values), [RECORD])
      assert.equal(fields.submitted, true)
      assert.equal(fields.submittedNote, '\u2713 Submitted', 'the submit shows on screen')
    } finally {
      await fixture.close()
    }
  })

  test("CU Ledger's record shows each value as selectable text", async () => {
    const ledger = await launchFixture(executable, { offscreen: true, role: 'ledger' })
    try {
      await ledger.open('ledger-vendor', { title: 'Ledger', record: RECORD })
      const targets = await ledger.targets()
      for (const key of Object.keys(RECORD)) assert.ok(targets[`record-${key}`], key)
      const { fields } = await ledger.state()
      assert.equal(fields['record-iban'], ('GB33BUKB' + '20201555555555'))
      // Every value can be selected - the task copies them into the form.
      assert.deepEqual(Object.entries(fields.recordSelectable).filter(([, on]) => !on), [])
      assert.equal(Object.keys(fields.recordSelectable).length, 8)
    } finally {
      await ledger.close()
    }
  })

  test("CU Ledger's values are captioned by their labels - the title element a copy's caption comes from (CU-187)", async () => {
    const ledger = await launchFixture(executable, { offscreen: true, role: 'ledger' })
    try {
      await ledger.open('ledger-vendor', { title: 'Ledger', record: RECORD })
      const { fields } = await ledger.state()
      assert.deepEqual(fields.recordCaptions, { vendor: 'Vendor', contact: 'Contact', email: 'Email', phone: 'Phone', taxId: 'Tax ID', iban: 'IBAN', terms: 'Payment terms', currency: 'Currency' })
      // An unnamed entry on the same screen to paste into (CU-187's live row): empty, with no name of its own.
      assert.equal(fields.scratchText, '')
      assert.equal(fields.scratchOwnName, '')
      const targets = await ledger.targets()
      assert.ok(targets.scratch?.width > 0, 'the scratch entry is a target')
    } finally {
      await ledger.close()
    }
  })
})
