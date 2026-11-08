import assert from 'node:assert/strict'
import { before, describe, test } from 'node:test'

import { buildFixtureApp } from '../../_tools_/desktop-fixture/build.mjs'
import { launchFixture } from '../../_tools_/desktop-fixture/client.mjs'

// CU-66 S2 'mail-inbox', offscreen: wholly shown rows as targets (pruned on scroll); a single selection opens the
// message once; Archive takes the selection in list order out of the list; Reply opens a compose area whose multi-line
// body Send records.

let executable
before(() => {
  executable = buildFixtureApp().executable
})

async function withMail(params, body) {
  const fixture = await launchFixture(executable, { offscreen: true })
  try {
    await fixture.open('mail-inbox', { title: 'Inbox', ...params })
    return await body(fixture)
  } finally {
    await fixture.close()
  }
}

const rows = (targets) => Object.keys(targets).filter((name) => /^msg-\d+$/.test(name)).sort()

describe('mail-inbox (CU-66 S2)', () => {
  test('about fifteen wholly shown rows are targets, with reply and archive; scrolling replaces them', async () => {
    await withMail({}, async (fixture) => {
      let targets = await fixture.targets()
      const first = rows(targets)
      assert.ok(first.length >= 14 && first.length <= 17 && first[0] === 'msg-01', first.join(','))
      assert.ok(targets.reply && targets.archive && !targets.send && !targets.body, 'compose controls shown before Reply')
      await fixture.act({ scrollTo: 'msg-30' })
      targets = await fixture.targets()
      assert.ok(rows(targets).includes('msg-30') && !rows(targets).includes('msg-01'))
    })
  })

  test('a single selection opens the message once; a multiple selection opens nothing new', async () => {
    await withMail({}, async (fixture) => {
      await fixture.act({ select: { ids: ['msg-03'] } })
      await fixture.act({ select: { ids: ['msg-03'] } })
      await fixture.act({ select: { ids: ['msg-03', 'msg-05'] } })
      await fixture.act({ select: { ids: ['msg-07'] } })
      const { events, fields } = await fixture.state()
      assert.deepEqual(events.filter((e) => e.type === 'opened').map((e) => e.id), ['msg-03', 'msg-07'])
      assert.deepEqual([fields.open, fields.selection], ['msg-07', ['msg-07']])
    })
  })

  test('A, then A and B, then A again: one opened for A (the open message is remembered across a multiple selection)', async () => {
    await withMail({}, async (fixture) => {
      await fixture.act({ select: { ids: ['msg-04'] } })
      await fixture.act({ select: { ids: ['msg-04', 'msg-06'] } })
      await fixture.act({ select: { ids: ['msg-04'] } })
      const { events } = await fixture.state()
      assert.deepEqual(events.filter((e) => e.type === 'opened').map((e) => e.id), ['msg-04'])
    })
  })

  test('opening C, then extending to A and C opens nothing - not the first row either - and the pane counts them', async () => {
    await withMail({}, async (fixture) => {
      await fixture.act({ select: { ids: ['msg-08'] } })
      await fixture.act({ select: { ids: ['msg-02', 'msg-08'] } })
      const { events, fields } = await fixture.state()
      assert.deepEqual(events.filter((e) => e.type === 'opened').map((e) => e.id), ['msg-08'])
      assert.equal(fields.paneTitle, '2 messages selected')
      assert.equal(fields.open, 'msg-08')
    })
  })

  test('Archive takes the selection out of the list, in list order', async () => {
    await withMail({}, async (fixture) => {
      await fixture.act({ select: { ids: ['msg-09', 'msg-02', 'msg-05'] } })
      await fixture.act({ press: 'archive' })
      const { events, fields } = await fixture.state()
      assert.deepEqual(events.filter((e) => e.type === 'archived').map((e) => e.ids), [['msg-02', 'msg-05', 'msg-09']])
      assert.equal(fields.messageCount, 27)
      const targets = await fixture.targets()
      assert.ok(!targets['msg-02'] && !targets['msg-05'] && targets['msg-03'])
    })
  })

  test('Reply shows the compose area; Send records the multi-line body to the sender and closes it', async () => {
    await withMail({ messages: [{ id: 'msg-01', from: 'Dana Ruiz', subject: 'Venue booking' }, { id: 'msg-02', from: 'Lee Park', subject: 'Lunch' }] }, async (fixture) => {
      await fixture.act({ select: { ids: ['msg-02'] } })
      await fixture.act({ press: 'reply' })
      let targets = await fixture.targets()
      assert.ok(targets.body && targets.send)
      await fixture.act({ set: 'body', value: 'Sounds good.\nSee you at noon.' })
      await fixture.act({ press: 'send' })
      const { events, fields } = await fixture.state()
      assert.deepEqual(events.filter((e) => e.type === 'sent').map((e) => [e.inReplyTo, e.to, e.body]), [['msg-02', 'Lee Park', 'Sounds good.\nSee you at noon.']])
      assert.equal(fields.composing, false)
      targets = await fixture.targets()
      assert.ok(!targets.send)
    })
  })

  test('a send is never silent: the pane says who it went to and the Sent count goes up (CU-128)', async () => {
    await withMail({ messages: [{ id: 'msg-01', from: 'Dana Ruiz', subject: 'Venue booking' }, { id: 'msg-02', from: 'Lee Park', subject: 'Lunch' }] }, async (fixture) => {
      let { fields } = await fixture.state()
      assert.deepEqual([fields.sentNote, fields.sentCount], [null, 'Sent (0)'])
      for (const id of ['msg-02', 'msg-01']) {
        await fixture.act({ select: { ids: [id] } })
        await fixture.act({ press: 'reply' })
        await fixture.act({ set: 'body', value: 'Thanks.' })
        await fixture.act({ press: 'send' })
      }
      ;({ fields } = await fixture.state())
      assert.deepEqual([fields.sentNote, fields.sentCount], ['\u2713 Sent to Dana Ruiz', 'Sent (2)'])
    })
  })

  test('Reply with nothing open does nothing', async () => {
    await withMail({}, async (fixture) => {
      await fixture.act({ press: 'reply' })
      const { fields } = await fixture.state()
      assert.equal(fields.composing, false)
    })
  })
})
