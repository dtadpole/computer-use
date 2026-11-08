import assert from 'node:assert/strict'
import { before, describe, test } from 'node:test'

import { buildFixtureApp } from '../../_tools_/desktop-fixture/build.mjs'
import { launchFixture } from '../../_tools_/desktop-fixture/client.mjs'

// CU-66 S8 'chat-thread', offscreen: the hover button is a target only while its row is hovered; the context menu
// opens the same thread; a thread send records 'posted' {parent, text} and shows a reply count under the parent; a
// channel send records parent null and adds a row; rows below the fold are not targets until scrolled.

let executable
before(() => {
  executable = buildFixtureApp().executable
})

async function withChat(params, body) {
  const fixture = await launchFixture(executable, { offscreen: true })
  try {
    await fixture.open('chat-thread', { title: 'Team chat', ...params })
    return await body(fixture)
  } finally {
    await fixture.close()
  }
}

const rowsShown = (targets) => Object.keys(targets).filter((n) => n.startsWith('row-')).sort()

describe('chat-thread (CU-66 S8)', () => {
  test('at open: the first six rows are targets, the rest below the fold are not; no thread button until a hover', async () => {
    await withChat({}, async (fixture) => {
      let targets = await fixture.targets()
      assert.deepEqual(rowsShown(targets), ['row-m01', 'row-m02', 'row-m03', 'row-m04', 'row-m05', 'row-m06'])
      assert.ok(targets['channel-input'] && targets['channel-send'] && !targets['thread-m03'])
      await fixture.act({ hoverRow: { id: 'm03' } })
      targets = await fixture.targets()
      assert.ok(targets['thread-m03'])
      await fixture.act({ unhoverRow: { id: 'm03' } })
      targets = await fixture.targets()
      assert.equal(targets['thread-m03'], undefined)
      await fixture.act({ scrollTo: 'm12' })
      targets = await fixture.targets()
      assert.ok(rowsShown(targets).includes('row-m12') && !rowsShown(targets).includes('row-m01'))
    })
  })

  test('the hover button and the context menu open the same thread; a reply posts under its parent and is counted', async () => {
    await withChat({}, async (fixture) => {
      await fixture.act({ hoverRow: { id: 'm03' } })
      await fixture.act({ press: 'thread-m03' })
      await fixture.act({ set: 'thread-input', value: 'I can book it.' })
      await fixture.act({ press: 'thread-send' })
      await fixture.act({ contextMenu: { id: 'm05', choose: 'Reply in thread' } })
      await fixture.act({ set: 'thread-input', value: 'Done.' })
      await fixture.act({ press: 'thread-send' })
      await fixture.act({ contextMenu: { id: 'm03' } })
      await fixture.act({ set: 'thread-input', value: 'Booked for Friday.' })
      await fixture.act({ press: 'thread-send' })
      const { events, fields } = await fixture.state()
      assert.deepEqual(events.filter((e) => e.type === 'thread-opened').map((e) => [e.id, e.via]), [['m03', 'button'], ['m05', 'menu'], ['m03', 'menu']])
      assert.deepEqual(events.filter((e) => e.type === 'posted').map((e) => [e.parent, e.text]), [['m03', 'I can book it.'], ['m05', 'Done.'], ['m03', 'Booked for Friday.']])
      assert.deepEqual(fields.replyCounts, { m03: 2, m05: 1 })
      assert.equal(fields.openThread, 'm03')
    })
  })

  test('a channel send posts with no parent and adds a row; an empty send posts nothing', async () => {
    await withChat({}, async (fixture) => {
      await fixture.act({ press: 'channel-send' })
      await fixture.act({ set: 'channel-input', value: 'Heads up: the build is red.' })
      await fixture.act({ press: 'channel-send' })
      const { events, fields } = await fixture.state()
      assert.deepEqual(events.filter((e) => e.type === 'posted').map((e) => [e.parent, e.text]), [[null, 'Heads up: the build is red.']])
      assert.equal(fields.messageCount, 13)
      const targets = await fixture.targets()
      assert.ok(targets['row-you01'], 'the new message is scrolled into view')
    })
  })
})
