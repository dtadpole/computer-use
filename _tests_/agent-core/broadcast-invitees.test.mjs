import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-396 (presenting, broadcasting, recording, calling back) and CU-397 (messages to calendar guests), both sides (D-099).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://meet.example/abc', target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-396: Present now/a tab/a window/your screen, Go live, Start broadcast/streaming/livestream, Start recording and Call back ask permission', () => {
  for (const name of ['Present now', 'Present a tab', 'Present a window', 'Present your screen', 'Present entire screen', 'Go live', 'Start broadcast', 'Start streaming', 'Start livestream', 'Start recording', 'Call back']) assert.equal(click(name), 'permission', name)
})

test('CU-396 negatives: a bare Present, Stop recording and Live captions stay free', () => {
  for (const name of ['Present', 'Stop recording', 'Live captions', 'Presenter view']) assert.equal(click(name), 'allow', name)
})

test("CU-397: messages to guests ask submit; Don't Send and Don't send updates are free", () => {
  for (const name of ['Email All Invitees', 'Email guests', 'Notify Guests', 'Send updates', 'Forward Invitation', 'Propose New Time']) assert.equal(click(name), 'submit', name)
  for (const name of ["Don't Send", 'Don\u2019t Send', "Don't send updates", 'Do not send']) assert.equal(click(name), 'allow', name)
  assert.equal(click('Send'), 'submit', 'a plain Send still asks')
})
