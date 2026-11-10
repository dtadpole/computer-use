import assert from 'node:assert/strict'
import { before, describe, test } from 'node:test'

import { buildFixtureApp } from '../../_tools_/desktop-fixture/build.mjs'
import { launchFixture } from '../../_tools_/desktop-fixture/client.mjs'

// 'open-selection' (CU-252, CU-269), offscreen: the stand-in for Finder - rows whose AXFilename and AXURL name files in a
// /tmp sandbox (strings only, nothing on disk), a File menu with Open and Open With > Terminal / TextEdit, Command-Down
// on the list, and two app-bundle drop targets. Every open only records what it would have opened.

let executable
before(() => {
  executable = buildFixtureApp().executable
})

async function withSandbox(body) {
  const fixture = await launchFixture(executable, { offscreen: true })
  try {
    await fixture.open('open-selection', { title: 'Sandbox' })
    return await body(fixture)
  } finally {
    await fixture.close()
  }
}

const openedFacts = (state) => state.events.filter((event) => event.type === 'opened').map(({ via, names, with: app }) => ({ via, names, ...(app ? { with: app } : {}) }))

describe('open-selection (CU-252, CU-269 stand-in)', () => {
  test('CU-387 variant fileOn row: the name is a plain label (no file of its own) while its cell and row carry the file', async () => {
    const fixture = await launchFixture(executable, { offscreen: true })
    try {
      await fixture.open('open-selection', { title: 'Sandbox', fileOn: 'row' })
      await fixture.act({ sandboxSelect: ['install.command'] })
      const { rows } = await fixture.call('sandboxAX')
      assert.equal(rows.length, 1)
      assert.equal(rows[0].nameFilename, null, 'the name carries no AXFilename of its own')
      assert.equal(rows[0].cellFilename, 'install.command', 'its cell does - the ancestor 0.2.67 lends from')
      const audit = await fixture.axAudit()
      assert.equal(audit['sandbox-file-0'].role, 'AXStaticText', 'still the static text a press hits')
    } finally {
      await fixture.close()
    }
  })

  test('CU-387: each row\'s name is a target spanning the row inside the list, carrying the file - a drag can start on it', async () => {
    await withSandbox(async (fixture) => {
      const targets = await fixture.targets()
      const list = targets['sandbox-files']
      assert.ok(list, 'the list is a target')
      const names = ['sandbox-file-0', 'sandbox-file-1', 'sandbox-file-2'].map((key) => targets[key])
      assert.ok(names.every(Boolean), 'one target per row name')
      assert.ok(names[0].y < names[1].y && names[1].y < names[2].y, 'in row order, top to bottom')
      const audit = await fixture.axAudit()
      for (const [index, file] of ['install.command', 'Payload.app', 'notes.txt'].entries()) {
        const entry = audit[`sandbox-file-${index}`]
        assert.equal(entry.role, 'AXStaticText', `row ${index}'s name is the static text the helper hits`)
      }
    })
  })

  test('three sandbox files listed, the list focused, nothing selected or opened', async () => {
    await withSandbox(async (fixture) => {
      const { fields } = await fixture.state()
      assert.deepEqual(fields.sandboxFiles, ['install.command', 'Payload.app', 'notes.txt'])
      assert.deepEqual([fields.sandboxSelected, fields.sandboxOpened], [[], []])
      const audit = await fixture.axAudit()
      assert.equal(audit['sandbox-files'].role, 'AXTable')
      assert.deepEqual([audit['terminal-icon'].role, audit['terminal-icon'].name], ['AXImage', 'Terminal.app'])
      assert.deepEqual([audit['payload-icon'].role, audit['payload-icon'].name], ['AXImage', 'Payload.app'])
    })
  })

  test('the selected rows carry Finder\'s shape: row and cell with AXFilename and a /tmp sandbox AXURL, a package with its trailing slash', async () => {
    await withSandbox(async (fixture) => {
      await fixture.act({ sandboxSelect: ['install.command', 'Payload.app'] })
      const { rows } = await fixture.call('sandboxAX')
      // AppKit's own row element is not the row view (its role reads AXUnknown in process; CU-252): the row view, its
      // cell and the cell's text field all carry the file name and URL; across processes AppKit serves the text field's
      // (probe 5), which the helper's read finds among a row's descendants.
      assert.deepEqual(rows.map(({ role, ...rest }) => rest), [
        { filename: 'install.command', url: 'file:///tmp/cu-fixture-sandbox/install.command', cellFilename: 'install.command', cellURL: 'file:///tmp/cu-fixture-sandbox/install.command', nameFilename: 'install.command', nameURL: 'file:///tmp/cu-fixture-sandbox/install.command' },
        { filename: 'Payload.app', url: 'file:///tmp/cu-fixture-sandbox/Payload.app/', cellFilename: 'Payload.app', cellURL: 'file:///tmp/cu-fixture-sandbox/Payload.app/', nameFilename: 'Payload.app', nameURL: 'file:///tmp/cu-fixture-sandbox/Payload.app/' },
      ])
      assert.ok(rows.every((row) => row.role !== 'AXRow'), 'the row view no longer claims the row role (that override left AXSelectedRows unusable)')
    })
  })

  test('File > Open, Command-Down, Open With > Terminal and a drop only record what they would open', async () => {
    await withSandbox(async (fixture) => {
      await fixture.act({ sandboxSelect: ['install.command'] })
      await fixture.act({ sandboxOpen: 'menu' })
      await fixture.act({ sandboxOpen: 'command-down' })
      await fixture.act({ sandboxOpenWith: 'Terminal' })
      await fixture.act({ sandboxDrop: { names: ['install.command'], onto: 'Terminal.app' } })
      assert.deepEqual(openedFacts(await fixture.state()), [
        { via: 'menu', names: ['install.command'] },
        { via: 'command-down', names: ['install.command'] },
        { via: 'open-with', names: ['install.command'], with: 'Terminal' },
        { via: 'drop', names: ['install.command'], with: 'Terminal.app' },
      ])
    })
  })

  test('the File menu (Open on Command-O, Open With > Terminal, TextEdit) leaves with the screen', async () => {
    await withSandbox(async (fixture) => {
      const before = await fixture.call('menuItemForKey', { key: 'cmd+o' })
      assert.deepEqual(before, { title: 'Open', action: 'openChosen:' })
      await fixture.open('consent-keys', { title: 'Quick message' })
      assert.deepEqual(await fixture.call('menuItemForKey', { key: 'cmd+o' }), { title: null, action: null })
    })
  })
})
