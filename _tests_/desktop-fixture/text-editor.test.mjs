import assert from 'node:assert/strict'
import { before, describe, test } from 'node:test'

import { buildFixtureApp } from '../../_tools_/desktop-fixture/build.mjs'
import { launchFixture } from '../../_tools_/desktop-fixture/client.mjs'

// CU-66 S7 'text-editor', offscreen: a span pasted at open is undone by one Command-Z and redone by Shift-Command-Z;
// Bold toggles on the selection and reads back as merged UTF-16 ranges; Italic is not bold; the Format menu exists
// only on this screen.

let executable
before(() => {
  executable = buildFixtureApp().executable
})

const TEXT = 'Quarterly update\n\nRevenue grew in every region.'

async function withEditor(params, body) {
  const fixture = await launchFixture(executable, { offscreen: true })
  try {
    await fixture.open('text-editor', { title: 'Draft', text: TEXT, ...params })
    return await body(fixture)
  } finally {
    await fixture.close()
  }
}

describe('text-editor (CU-66 S7)', () => {
  test('the pasted span is there at open; Command-Z takes it out, Shift-Command-Z puts it back', async () => {
    await withEditor({ pasteOnOpen: { at: 16, text: ' (DRAFT - do not send)' } }, async (fixture) => {
      let { fields } = await fixture.state()
      assert.equal(fields.text, 'Quarterly update (DRAFT - do not send)\n\nRevenue grew in every region.')
      assert.equal(fields.canUndo, true)
      await fixture.act({ key: { key: 'cmd+z' } })
      ;({ fields } = await fixture.state())
      assert.equal(fields.text, TEXT)
      await fixture.act({ key: { key: 'shift+cmd+z' } })
      ;({ fields } = await fixture.state())
      assert.equal(fields.text, 'Quarterly update (DRAFT - do not send)\n\nRevenue grew in every region.')
    })
  })

  test('Bold on a selection reads back as merged ranges; Bold again on a bold part removes it; Italic is not bold', async () => {
    await withEditor({}, async (fixture) => {
      await fixture.act({ selectText: { start: 0, length: 9 } })
      await fixture.act({ key: { key: 'cmd+b' } })
      await fixture.act({ selectText: { start: 9, length: 7 } })
      await fixture.act({ key: { key: 'cmd+b' } })
      let { fields, events } = await fixture.state()
      assert.deepEqual(fields.boldRanges, [[0, 16]], 'adjacent bold runs merge')
      await fixture.act({ selectText: { start: 0, length: 10 } })
      await fixture.act({ key: { key: 'cmd+b' } })
      await fixture.act({ selectText: { start: 18, length: 7 } })
      await fixture.act({ key: { key: 'cmd+i' } })
      ;({ fields, events } = await fixture.state())
      assert.deepEqual(fields.boldRanges, [[10, 6]])
      assert.deepEqual(events.filter((e) => e.type === 'formatted').map((e) => [e.style, e.on]), [['bold', true], ['bold', true], ['bold', false], ['italic', true]])
    })
  })

  test('a word with an italic part, then bolded whole, is ONE bold range (bold and bold-italic runs merge)', async () => {
    await withEditor({}, async (fixture) => {
      // 'Quarterly': italic on 'Quart', then Bold over the whole word.
      await fixture.act({ selectText: { start: 0, length: 5 } })
      await fixture.act({ key: { key: 'cmd+i' } })
      await fixture.act({ selectText: { start: 0, length: 9 } })
      await fixture.act({ key: { key: 'cmd+b' } })
      const { fields } = await fixture.state()
      assert.deepEqual(fields.boldRanges, [[0, 9]])
    })
  })

  test("the 'formatted' fact carries the selection's own offsets, and on: false when Bold comes off", async () => {
    await withEditor({}, async (fixture) => {
      await fixture.act({ selectText: { start: 6, length: 5 } })
      await fixture.act({ key: { key: 'cmd+b' } })
      await fixture.act({ key: { key: 'cmd+b' } })
      const { events } = await fixture.state()
      const facts = events.filter((e) => e.type === 'formatted').map(({ style, on, start, length }) => ({ style, on, start, length }))
      assert.deepEqual(facts, [{ style: 'bold', on: true, start: 6, length: 5 }, { style: 'bold', on: false, start: 6, length: 5 }])
    })
  })

  test('Undo reverses a format too', async () => {
    await withEditor({}, async (fixture) => {
      await fixture.act({ selectText: { start: 0, length: 16 } })
      await fixture.act({ key: { key: 'cmd+b' } })
      await fixture.act({ key: { key: 'cmd+z' } })
      const { fields } = await fixture.state()
      assert.deepEqual(fields.boldRanges, [])
    })
  })

  test('the Format menu belongs to this screen: gone after another screen opens', async () => {
    const fixture = await launchFixture(executable, { offscreen: true })
    try {
      await fixture.open('text-editor', { title: 'Draft', text: TEXT })
      await fixture.act({ menu: 'Bold' }).catch(() => assert.fail('no Bold item on the text editor'))
      await fixture.open('hover-chart', { title: 'Revenue' })
      await assert.rejects(fixture.act({ menu: 'Bold' }), /no menu item Bold/)
    } finally {
      await fixture.close()
    }
  })
})
