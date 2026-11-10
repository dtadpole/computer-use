// D-103: the probe kit's loop-level helper drives the real runTask - a known ask is declined, a known free action done.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { desk } from '../../_tools_/probe-kit/shapes.mjs'
import { lastStatus, throughLoop } from '../../_tools_/probe-kit/loop.mjs'

const drag = [{ type: 'drag', path: [{ x: 100, y: 100 }, { x: 600, y: 400 }] }]
const FINDER = 'com.apple.finder'; const SLACK = 'com.tinyspeck.slackmacgap'

test('a Finder file dragged into Slack is declined through the loop (dragSource derived by loop.mjs)', async () => {
  const events = await throughLoop({ frontmost: FINDER, apps: [FINDER, SLACK], targets: ({ x }) => (x < 200 ? desk.row(FINDER, 'report') : desk.webArea(SLACK, 'Message')), actions: drag })
  assert.equal(lastStatus(events), 'declined'); assert.equal(events.at(-1).class, 'permission')
})

test('a file moved within Finder is done through the loop', async () => {
  const events = await throughLoop({ frontmost: FINDER, apps: [FINDER], targets: ({ x }) => (x < 200 ? desk.row(FINDER, 'report') : desk.row(FINDER, 'Archive')), actions: drag })
  assert.equal(lastStatus(events), 'done')
})
