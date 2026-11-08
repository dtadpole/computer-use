import assert from 'node:assert/strict'
import { before, describe, test } from 'node:test'

import { buildFixtureApp } from '../../_tools_/desktop-fixture/build.mjs'
import { launchFixture } from '../../_tools_/desktop-fixture/client.mjs'

// S5 clipboard screens (CU-62). Offscreen fixtures only; nothing here reads or writes the owner's pasteboard: the stash
// is checked on a private named pasteboard (clipboardSelfTest), and pastes come from a private board through the field
// editor's own paste path (act pasteInto). clipboardSave / clipboardRestore / clipboardLiveCheck are never called here
// (the live check is cu-verifier's announced run on the real board).

let executable
before(() => {
  executable = buildFixtureApp().executable
})

async function withFixture(role, body) {
  const fixture = await launchFixture(executable, { offscreen: true, role })
  try {
    return await body(fixture)
  } finally {
    await fixture.close()
  }
}

const recorded = (state) => state.events.filter((event) => event.type === 'recorded').map(({ invoice, via }) => ({ invoice, via }))

describe('S5 clipboard (CU-62)', () => {
  test('the stash keeps a board in memory and writes it back; a concealed board is not read; the owner\'s board is untouched', async () => {
    await withFixture('fixture', async (fixture) => {
      const result = await fixture.call('clipboardSelfTest')
      assert.deepEqual(result, {
        saved: 2, clearedAfterSave: true, restored: 2, roundTrip: true,
        concealed: 'concealed', concealedKept: true, emptyRestore: 0, leftAlone: true,
        // A private named board is always readable; the general board asks by default on macOS 15.4+ (CU-62 guard gap).
        privateBoardAccess: 'alwaysAllow',
        // ask, alwaysDeny and default: skipped unread, nothing cleared (cu-coordinator 07:10Z); alwaysAllow round-trips.
        refused: 'pasteboard access needs the owner', refusedKept: true, allowRoundTrip: true,
        unreadable: 'clipboard unreadable', unreadableKept: true,
        emptySaved: 0, emptyCleared: true, endsEmpty: true,
        // The access rule itself (cu-verifier on #157): only alwaysAllow reads; every other behaviour fails closed.
        accessRules: { alwaysAllow: true, ask: false, alwaysDeny: false, default: false },
        generalUntouched: true,
      })
    })
  })

  test('payment-paste records the invoice and how it arrived: one paste is paste, typing is typing, a paste then an edit is typing', async () => {
    for (const [steps, expected] of [
      [[{ pasteInto: 'invoice', text: 'INV-4471' }], { invoice: 'INV-4471', via: 'paste' }],
      [[{ typeInto: 'invoice', text: 'INV-4471' }], { invoice: 'INV-4471', via: 'typing' }],
      [[{ pasteInto: 'invoice', text: 'INV-447' }, { typeInto: 'invoice', text: '1' }], { invoice: 'INV-4471', via: 'typing' }],
      // CU-233: Paste and Match Style's plain-text paste is a paste too.
      [[{ pasteInto: 'invoice', text: 'INV-4471', plainText: true }], { invoice: 'INV-4471', via: 'paste' }],
      // cu-researcher's Ask 1: a select-all and paste over earlier content is still a paste (Sonnet's run 07:01Z).
      [[{ pasteInto: 'invoice', text: '44752' }, { pasteInto: 'invoice', text: 'INV-44752', selectAll: true }], { invoice: 'INV-44752', via: 'paste' }],
      // Two partial pastes: the final value is not the last paste's text.
      [[{ pasteInto: 'invoice', text: 'INV-447' }, { pasteInto: 'invoice', text: '1' }], { invoice: 'INV-4471', via: 'typing' }],
    ]) {
      await withFixture('fixture', async (fixture) => {
        await fixture.open('payment-paste', {})
        for (const step of steps) await fixture.act(step)
        await fixture.act({ press: 'record' })
        assert.deepEqual(recorded(await fixture.state()), [expected], JSON.stringify(steps))
      })
    }
  })

  test('ledger-invoice-copy shows the seeded number in a selectable, non-editable field named invoice-number', async () => {
    await withFixture('ledger', async (fixture) => {
      await fixture.open('ledger-invoice-copy', { invoice: 'INV-4471', vendor: 'Northwind', amount: '$120.00' })
      const targets = await fixture.targets()
      assert.equal(targets['invoice-number']?.type, 'NSTextField', `no invoice-number target: ${JSON.stringify(targets).slice(0, 300)}`)
      const { visible } = await fixture.call('ax')
      assert.ok(visible.includes('INV-4471'), 'the number is not shown')
      const { fields } = await fixture.state()
      assert.equal(fields['invoice-number'], undefined, 'the number field is editable (it reads as a field value)')
    })
  })

  test('clipboardAccess reports whether CU Fixture may read the general board without asking (the setting, no content)', async () => {
    await withFixture('fixture', async (fixture) => {
      const access = await fixture.call('clipboardAccess')
      assert.equal(typeof access.allowed, 'boolean')
      assert.ok(['unrestricted', 'default', 'ask', 'alwaysAllow', 'alwaysDeny', 'unknown'].includes(access.behavior), access.behavior)
      assert.equal(access.allowed, access.behavior === 'alwaysAllow' || access.behavior === 'unrestricted')
    })
  })

  test('only CU Fixture keeps the clipboard: CU Ledger refuses clipboardSave', async () => {
    await withFixture('ledger', async (fixture) => {
      await assert.rejects(fixture.call('clipboardSave'), /only CU Fixture keeps the clipboard/)
    })
  })

  test('the menu bar keeps the fixture\'s own menus first and adds Edit (cut, copy, paste, paste and match style, select all) after them', async () => {
    await withFixture('fixture', async (fixture) => {
      // Command-V reaches Edit > Paste; Command-Option-Shift-V reaches Paste and Match Style (CU-233); the fixture's own
      // key (shift+cmd+k) still reaches Log > Clear Log.
      await fixture.open('payment-paste', {})
      await fixture.act({ key: 'cmd+v' })
      await fixture.act({ key: 'alt+shift+cmd+v' })
      await fixture.act({ key: 'shift+cmd+k' })
      const menus = (await fixture.state()).events.filter((event) => event.type === 'menu').map(({ menu, title }) => `${menu} > ${title}`)
      assert.deepEqual(menus, ['Edit > Paste', 'Edit > Paste and Match Style', 'Log > Clear Log'])
    })
  })

  test('CU-230: Edit gains Paste and Match Style on Command-Option-Shift-V (the field editor\'s plain-text paste); Command-V stays Paste', async () => {
    await withFixture('fixture', async (fixture) => {
      // Looked up only - nothing is pasted, so no pasteboard is read.
      assert.deepEqual(await fixture.call('menuItemForKey', { key: 'alt+shift+cmd+v' }), { title: 'Paste and Match Style', action: 'pasteAsPlainText:' })
      assert.deepEqual(await fixture.call('menuItemForKey', { key: 'cmd+v' }), { title: 'Paste', action: 'paste:' })
      assert.deepEqual(await fixture.call('menuItemForKey', { key: 'shift+cmd+v' }), { title: null, action: null })
    })
  })

  test('CU-230: the paste sentinel is written only to an empty board this app may read, and cleared only if nothing else wrote since', async () => {
    await withFixture('fixture', async (fixture) => {
      assert.deepEqual(await fixture.call('clipboardSentinelSelfTest'), {
        written: true, onBoard: true, cleared: true, endsEmpty: true,
        full: 'owner board not empty', fullKept: true,
        asked: 'pasteboard access needs the owner', askedEmpty: true,
        raced: 'the board changed since the sentinel', racedKept: true,
        noSentinel: 'no sentinel on the board',
        generalUntouched: true,
      })
    })
  })

  test('only CU Fixture writes the paste sentinel: CU Ledger refuses it', async () => {
    await withFixture('ledger', async (fixture) => {
      await assert.rejects(fixture.call('clipboardSentinel'), /only CU Fixture keeps the clipboard/)
      await assert.rejects(fixture.call('clipboardSentinelClear'), /only CU Fixture keeps the clipboard/)
    })
  })
})

test('no test calls the live-board commands: they touch the real general pasteboard (cu-verifier runs the live check, announced)', async () => {
  const { readdirSync, readFileSync } = await import('node:fs')
  const dir = new URL('.', import.meta.url).pathname
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.test.mjs'))) {
    // A call that is asserted to be refused (CU Ledger never keeps the clipboard) touches nothing.
    const lines = readFileSync(dir + file, 'utf8').split('\n').filter((line) => !line.includes('assert.rejects('))
    for (const command of ['clipboardSave', 'clipboardRestore', 'clipboardLiveCheck', 'clipboardSentinel', 'clipboardSentinelClear']) {
      assert.ok(!lines.some((line) => line.includes(`call('${command}'`)), `${file} calls ${command}`)
    }
  }
})
