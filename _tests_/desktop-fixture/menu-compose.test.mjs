import assert from 'node:assert/strict'
import { before, describe, test } from 'node:test'

import { buildFixtureApp } from '../../_tools_/desktop-fixture/build.mjs'
import { launchFixture } from '../../_tools_/desktop-fixture/client.mjs'

// 'menu-compose' (CU-238, CU-232's live rows), offscreen: a compose window whose consequential actions sit on menu key
// equivalents - Message > Send on Shift-Command-D; a disabled benign Mark as Read before an enabled Send Now on
// Option-Command-J (Option-Command-D is macOS's Dock-hiding hotkey); Delete on a plain Backspace, enabled only on the Outbox list; Send Later on Option-Command-L in a
// lazily filled menu. Each action only records that it fired. The key seam models AppKit in process; which item a
// real keystroke reaches, and what Accessibility sees across processes, are the live rows' questions.

let executable
before(() => {
  executable = buildFixtureApp().executable
})

async function withCompose(params, body) {
  const fixture = await launchFixture(executable, { offscreen: true })
  try {
    await fixture.open('menu-compose', { title: 'New message', ...params })
    return await body(fixture)
  } finally {
    await fixture.close()
  }
}

const sentItems = (state) => state.events.filter((event) => event.type === 'sent').map((event) => event.item)

describe('menu-compose (CU-238)', () => {
  test('a draft with a named subject and body, the focus in the body, and the menus declared', async () => {
    await withCompose({}, async (fixture) => {
      const { fields } = await fixture.state()
      assert.equal(fields.composeFocus, 'body')
      assert.ok(fields.bodyText.length > 0, 'the draft has a body')
      assert.deepEqual(fields.composeChords, [
        { title: 'Send', menu: 'Message', key: 'd', modifiers: ['cmd', 'shift'] },
        { title: 'Mark as Read', menu: 'Message', key: 'j', modifiers: ['cmd', 'alt'] },
        { title: 'Send Now', menu: 'Message', key: 'j', modifiers: ['cmd', 'alt'] },
        { title: 'Delete', menu: 'Message', key: 'backspace', modifiers: [] },
        { title: 'Send Later', menu: 'Later', key: 'l', modifiers: ['cmd', 'alt'] },
      ])
      const audit = await fixture.axAudit()
      assert.equal(audit.subject.role, 'AXTextField')
      assert.deepEqual([audit.body.role, audit.body.name], ['AXTextArea', 'Message body'])
    })
  })

  test('Accessibility, in process, reads the menus as the helper will: AX modifier bits, the disabled item, the hidden duplicate, a plain-Backspace virtual key; the read fills the lazy menu', async () => {
    await withCompose({}, async (fixture) => {
      assert.equal((await fixture.state()).fields.lazyMenuFilled, false, 'the lazy menu starts empty')
      const { menus } = await fixture.call('menuAX')
      const byTitle = Object.fromEntries(menus.map((menu) => [menu.title, menu.items]))
      assert.deepEqual(byTitle.Message, [
        { title: 'Send', enabled: true, char: 'D', modifiers: 1, virtualKey: null },
        { title: 'Mark as Read', enabled: false, char: 'J', modifiers: 2, virtualKey: null },
        // AppKit serves no key character for a later duplicate of an earlier item's key equivalent (measured 8 Nov):
        // the helper cannot see that Send Now shares Option-Command-J - the case CU-232 must judge without it.
        { title: 'Send Now', enabled: true, char: null, modifiers: 2, virtualKey: null },
        { title: 'Delete', enabled: byTitle.Message[3].enabled, char: null, modifiers: 8, virtualKey: 51 },
      ])
      // Measured 8 Nov: reading the lazy menu's children through Accessibility makes AppKit ask its delegate to fill it.
      assert.deepEqual(byTitle.Later, [{ title: 'Send Later', enabled: true, char: 'L', modifiers: 2, virtualKey: null }])
      assert.equal((await fixture.state()).fields.lazyMenuFilled, true)
    })
  })

  test('Shift-Command-D fires Message > Send, which only records it', async () => {
    await withCompose({}, async (fixture) => {
      await fixture.act({ composeKey: { key: 'd', modifiers: ['cmd', 'shift'] } })
      assert.deepEqual(sentItems(await fixture.state()), ['Send'])
    })
  })

  test('Option-Command-J: the disabled Mark as Read never fires; in process the chord stops at it, so Send Now does not fire either', async () => {
    await withCompose({}, async (fixture) => {
      await fixture.act({ composeKey: { key: 'j', modifiers: ['cmd', 'alt'] } })
      const state = await fixture.state()
      assert.equal(state.events.filter((event) => event.type === 'marked-read').length, 0)
      // The in-process model of AppKit (8 Nov): the first match, disabled, takes the chord. A real keystroke may differ;
      // the live row records which item, if any, fires.
      assert.deepEqual(sentItems(state), [])
    })
  })

  test('a plain Backspace edits the draft while the body has the focus, and deletes the selected Outbox row on the list (Mail\'s case)', async () => {
    await withCompose({}, async (fixture) => {
      const before = (await fixture.state()).fields
      await fixture.act({ composeKey: { key: 'backspace' } })
      const inBody = (await fixture.state()).fields
      assert.deepEqual(inBody.composeDeleted, [], 'no row deleted from the body')
      assert.deepEqual(inBody.outbox, before.outbox)
      await fixture.act({ composeFocus: 'outbox' })
      await fixture.act({ composeKey: { key: 'backspace' } })
      const onList = (await fixture.state()).fields
      assert.equal(onList.composeFocus, 'outbox')
      assert.deepEqual(onList.composeDeleted, ['Weekly summary'])
      assert.deepEqual(onList.outbox, ['Room booking', 'Follow-up notes'])
    })
  })

  test('Option-Command-L fires Send Later through the lazy menu\'s delegate, without filling the menu', async () => {
    await withCompose({}, async (fixture) => {
      await fixture.act({ composeKey: { key: 'l', modifiers: ['cmd', 'alt'] } })
      const state = await fixture.state()
      assert.deepEqual(sentItems(state), ['Send Later'])
      assert.equal(state.fields.lazyMenuFilled, false)
    })
  })

  test('CU-250: a stand-in Services submenu in the app menu - an owner-style service and AppKit\'s marker; each only records', async () => {
    await withCompose({}, async (fixture) => {
      const { menus } = await fixture.call('menuAX')
      assert.deepEqual(menus.find((menu) => menu.title === 'Services'), { title: 'Services', items: [{ title: 'Weekly Report Uploader' }, { title: 'Services Settings\u2026' }] })
      await fixture.act({ composeService: 'Weekly Report Uploader' })
      const { events } = await fixture.state()
      assert.deepEqual(events.filter((event) => event.type === 'service-ran').map((event) => event.item), ['Weekly Report Uploader'])
    })
  })

  test('the menus leave with the screen', async () => {
    await withCompose({}, async (fixture) => {
      await fixture.open('consent-keys', { title: 'Quick message' })
      assert.deepEqual((await fixture.call('menuAX')).menus, [])
    })
  })
})
