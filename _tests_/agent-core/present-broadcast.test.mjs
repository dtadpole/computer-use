import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-396: presenting, broadcasting, streaming, recording others and calling back ask permission, like 'Share screen'.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name) => { const r = policy.classify({ type: 'click', x: 5, y: 5, button: 'left' }, { url: 'https://meet.example/abc-defg-hij', target: { tag: 'button', role: 'button', name } }); return r.decision === 'allow' ? 'allow' : r.class }

test('CU-396: presenting, going live, streaming, recording and calling back ask permission', () => {
  for (const name of ['Present now', 'Present a tab', 'Present a window', 'Present your screen', 'Present entire screen', 'Go Live', 'Go live now', 'Start Broadcast',
    'Start streaming', 'Start livestream', 'Start live stream', 'Start recording', 'Record meeting', 'Call Back']) assert.equal(click(name), 'permission', name)
})

test('CU-396 negatives: a bare Present, presenter tools, stopping and captions stay free', () => {
  for (const name of ['Present', 'Presenter view', 'Stop recording', 'Stop presenting', 'End broadcast', 'Live captions', 'Recordings', 'Call history', 'Go back', 'Live chat']) assert.equal(click(name), 'allow', name)
})

// CU-397: messages to an event's guests ask submit; declining to send stays free.
const clickCal = (name) => { const r = policy.classify({ type: 'click', x: 5, y: 5, button: 'left' }, { url: 'https://calendar.example/event/123', target: { tag: 'button', role: 'button', name } }); return r.decision === 'allow' ? 'allow' : r.class }

test('CU-397: emailing, notifying or forwarding to guests and proposing a new time ask submit', () => {
  for (const name of ['Email All Invitees', 'Email guests', 'Notify Guests', 'Notify attendees', 'Forward Invitation', 'Forward event', 'Propose New Time', 'Send updates', 'Send Update']) assert.equal(clickCal(name), 'submit', name)
})

test('CU-397 negatives: not sending, editing the guest list and views stay free', () => {
  for (const name of ["Don't Send", 'Don\u2019t send', "Don't send updates", "Don't notify guests", 'Do not send', 'Add Invitees', 'Guest list', 'Guests can modify event', 'Find a time']) assert.equal(clickCal(name), 'allow', name)
})
