import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-542 (High; cu-coordinator 02:21Z), table PR 41: emergency help asks submit everywhere; a ride's stop / destination / fare-split asks
// purchase on ride pages only. Click and Space (D-106).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const classesOf = (name, url, key = false) => {
  const v = key ? policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url, target: { tag: 'button', role: 'button', name } }) : policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'button', name } })
  return v.decision === 'allow' ? [] : (v.classes ?? [v.class])
}
const RIDE = 'https://m.uber.example/ride/active'
const MAPS = 'https://maps.example/dir/home/work'

test('CU-542: emergency help asks submit everywhere', () => {
  for (const name of ['Emergency SOS', 'SOS', 'Send SOS', 'Emergency assistance', 'Contact emergency services', 'Call emergency services', 'Alert emergency contacts', 'Notify emergency contacts']) {
    for (const url of [RIDE, MAPS]) assert.ok(classesOf(name, url).includes('submit'), `${url}: ${name}`)
    assert.ok(classesOf(name, RIDE, true).includes('submit'), `Space: ${name}`)
  }
  for (const name of ['Emergency contacts', 'Safety', 'Emergency info']) assert.deepEqual(classesOf(name, RIDE), [], name)
})

test("CU-542: a ride's stop / destination / fare split ask purchase on ride pages only", () => {
  for (const name of ['Add stop', 'Change destination', 'Split fare']) {
    assert.ok(classesOf(name, RIDE).includes('purchase'), `ride: ${name}`)
    assert.ok(classesOf(name, 'https://app.example/rides/42').includes('purchase'), `ride path: ${name}`)
    assert.deepEqual(classesOf(name, MAPS), [], `maps: ${name}`)
  }
  assert.ok(classesOf('Upgrade ride', MAPS).includes('purchase'), 'older row unchanged')
})

test("#784 round 2 (cu-researcher 02:28Z): a ride host label; the ride names take a tail", () => {
  const FIX = 'https://ride.fixture.example/trip/active'
  for (const name of ['Add stop', 'Add another stop', 'Change destination', 'Update destination', 'Split fare']) assert.ok(classesOf(name, FIX).includes('purchase'), `ride host: ${name}`)
  for (const name of ['Add another stop on the way', 'Split fare with friends', 'Change destination to airport']) {
    assert.ok(classesOf(name, 'https://taxi.example/ride/9').includes('purchase'), `tail: ${name}`)
    assert.deepEqual(classesOf(name, MAPS), [], `maps: ${name}`)
  }
})

test('#784 round 3 (cu-coordinator 02:36Z): a trip / trips path segment binds', () => {
  for (const url of ['https://travel.example/trips/123', 'https://book.example/trip/edit']) for (const name of ['Change destination', 'Add stop']) assert.ok(classesOf(name, url).includes('purchase'), `${url}: ${name}`)
  assert.deepEqual(classesOf('Change destination', MAPS), [], 'maps stays free')
})
