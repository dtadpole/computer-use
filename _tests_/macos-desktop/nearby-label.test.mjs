import assert from 'node:assert/strict'
import { after, test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'
import { fakeLauncher, logged, scratchLocks, stopFake } from './harness.mjs'

// CU-361 (helper 0.2.64): the desktop driver carries an unnamed entry's layout label - the static text the helper finds
// beside it (left on its row, else just above it), reported only when the entry has no title, caption or placeholder -
// as target.nearbyLabel: a trimmed string of at most 80 characters (longer is none, never cut) or null. Agent core uses
// it upgrade-only; outside the fingerprint.

const FIXTURE = 'ai.reflection.cu.fixture'
const locks = scratchLocks()
after(() => locks.remove())
const launchOnFake = fakeLauncher(locks, { apps: [FIXTURE] })

const BOX = { bundleId: FIXTURE, pid: 601, role: 'AXTextField', subrole: null, title: null, frame: { x: 20, y: 100, width: 200, height: 24 }, secure: false, editable: true }
const world = (value) => ({
  displays: [{ id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 800, height: 600 }, scale: 1 }],
  apps: [{ bundleId: FIXTURE, pid: 601, title: 'Fixture', rect: { x: 0, y: 0, width: 800, height: 600 } }],
  frontmost: FIXTURE,
  elements: [{ rect: value.frame, element: value }],
  focused: value,
})

async function read(value) {
  const { env, child } = await launchOnFake(world(value))
  try {
    await logged(child, 3)
    return { hit: await env.inspectPoint({ x: 50, y: 110 }), focused: await env.focusedElement() }
  } finally {
    await env.close()
    await stopFake(child)
  }
}

test('CU-361: an untitled box carries its nearby label, on a hit and on the focused element alike', async () => {
  const { hit, focused } = await read({ ...BOX, nearbyLabel: 'Password' })
  assert.deepEqual([hit.title ?? hit.name ?? null, hit.caption, hit.placeholder, hit.nearbyLabel], [null, null, null, 'Password'])
  assert.equal(focused.nearbyLabel, 'Password')
})

test('CU-361: the nearby label is a separate key - it never becomes the name, the caption or the placeholder', async () => {
  const { hit } = await read({ ...BOX, nearbyLabel: 'Password' })
  for (const key of ['name', 'title', 'caption', 'placeholder']) assert.notEqual(hit[key], 'Password', key)
})

test('CU-361: a nearby label is trimmed; 80 characters is kept, 81 is null (never cut)', async () => {
  assert.equal((await read({ ...BOX, nearbyLabel: '  Password \n' })).hit.nearbyLabel, 'Password')
  assert.equal((await read({ ...BOX, nearbyLabel: 'x'.repeat(80) })).hit.nearbyLabel, 'x'.repeat(80))
  assert.equal((await read({ ...BOX, nearbyLabel: 'x'.repeat(81) })).hit.nearbyLabel, null, 'longer is none, never cut mid-word')
})

test('CU-361: absent (an older helper), empty or not a string is null', async () => {
  const { hit, focused } = await read(BOX)
  assert.deepEqual([hit.nearbyLabel, focused.nearbyLabel], [null, null], 'an older helper sends none')
  for (const nearbyLabel of ['', '   ', 42, true, ['Password'], { text: 'Password' }, null]) {
    assert.equal((await read({ ...BOX, nearbyLabel })).hit.nearbyLabel, null, JSON.stringify(nearbyLabel))
  }
})

test('CU-361 (cu-researcher): a static text the value rules class as sensitive is a displayed value, not a label - it reads as null', async () => {
  const card = ['4111', '1111', '1111', '1111'].join(' ') // built from fragments: no card-shaped literal in the tree
  const iban = ['GB82', 'WEST', '1234', '5698', '7654', '32'].join(' ')
  for (const shown of [`Card ${card}`, card, `IBAN ${iban}`]) {
    const { hit, focused } = await read({ ...BOX, nearbyLabel: shown })
    assert.equal(hit.nearbyLabel, null, shown.replace(/\d/g, '#'))
    assert.equal(focused.nearbyLabel, null)
    for (const target of [hit, focused]) assert.ok(!JSON.stringify(target).includes(card.replace(/ /g, '').slice(0, 8)) && !JSON.stringify(target).includes('4111 1111'), 'no field carries the value')
  }
  assert.equal((await read({ ...BOX, nearbyLabel: 'Card number' })).hit.nearbyLabel, 'Card number', 'a label naming a card stays a label')
})

test('CU-374 (cu-researcher): a street address shown beside a box is a displayed value, not a label - no number of it is read', async () => {
  const shown = [
    '1 Infinite Loop, Cupertino, CA 95014',
    'Ship to 221B Baker Street',
    '350 Fifth Ave.',
    'Hauptstraße 5, 10115 Berlin',
    '12 rue de Rivoli, 75001 Paris',
    'Calle Mayor 10',
    'PO Box 4471',
    'London SW1A 1AA',
    // r2 (cu-researcher's review): the street words and postal lines as a class.
    'Unit 5/12 George St, Sydney NSW 2000',
    'Rua Augusta 1500, São Paulo',
    'Strada Nuova 3',
    'Pl. de la Concorde 8',
    '10115 Berlin',
    '1-2-3 Shibuya, Tokyo 150-0002',
    'Kalverstraat 1, Amsterdam',
    'Drottninggatan 5',
  ]
  for (const address of shown) {
    const { hit, focused } = await read({ ...BOX, nearbyLabel: address })
    // None, or (r3) the field words with the address cut out when they make the box ask - never a house number or code.
    for (const read1 of [hit.nearbyLabel, focused.nearbyLabel]) assert.ok(read1 === null || !/\d/.test(read1), `${address} read as ${read1}`)
    for (const target of [hit, focused]) assert.ok(!JSON.stringify(target).includes(address), `no field carries '${address}'`)
  }
})

test('CU-374 r4 (cu-researcher): a text that is all address reads as none - an alphanumeric house number, a bare UK postcode', async () => {
  for (const address of ['221B Baker Street', '12A Station Road', 'SW1A 2AA', 'M1 1AE', '1 Infinite Loop']) {
    const { hit, focused } = await read({ ...BOX, nearbyLabel: address })
    assert.deepEqual([hit.nearbyLabel, focused.nearbyLabel], [null, null], address)
  }
})

test('CU-374 r3 (cu-developer-three F1): a label that names a sensitive field keeps naming it - dropping an address never removes an ask', async () => {
  const policy = createPolicy({ sitePolicy: () => 'allow' })
  const judge = (nearbyLabel, typed) => {
    const v = policy.classify({ type: 'type', text: typed }, { url: `app:${FIXTURE}`, target: { origin: FIXTURE, role: 'AXTextField', name: null, editable: true, nearbyLabel } })
    return v.decision === 'allow' ? 'allow' : v.class
  }
  for (const label of ['Enter the 6-digit code we sent via SMS to 555-0123', 'Security code sent via email 2', 'Password for Parkplatz 3', 'PIN for 12 Baker Street', 'Ship to 221B Baker Street',
    'Bank account for 742 Evergreen Terrace', 'Passcode for Flat 3, 12 High St', 'Credit card for PO Box 742', 'Tax ID for 10115 Berlin entity', "Mother's maiden name (Via Roma 10)"]) {
    const read1 = (await read({ ...BOX, nearbyLabel: label })).hit.nearbyLabel
    for (const typed of ['123456', 'hunter2x', 'Pat']) assert.equal(judge(read1, typed), judge(label, typed), `${label} / ${typed}: the read label decides as the shown one`)
  }
  const cut = (await read({ ...BOX, nearbyLabel: 'Ship to 221B Baker Street' })).hit.nearbyLabel
  assert.equal(cut, 'Ship to street address', 'the address is cut out, its ask kept')
})

test('CU-374 r3 (cu-developer-three F2): everyday labels with a number stay labels', async () => {
  for (const label of ['Get updates via email every 7 days', 'Share my location via Find My 2', 'Ship via UPS Ground 2', 'Send reminders via SMS 1 day before',
    'Freeze 1 row', 'Add 1 row', '10 min walk', 'Area 2 square feet', 'Draw 1 circle', 'Use 2 Way sync', 'PS5 1TB', 'M2 1TB SSD', 'MP3 4GB',
    'Arbeitsplatz 2', 'Parkplatz 3', 'Keep me signed in for 30 days', 'Remind me in 2 days', 'Allow 2 devices', 'Auto-lock after 5 min', 'Enable 2-step verification']) {
    assert.equal((await read({ ...BOX, nearbyLabel: label })).hit.nearbyLabel, label, label)
  }
})

test('CU-374: a label that only names an address field stays a label', async () => {
  for (const label of ['Street address', 'Address line 1', 'Address 2', 'ZIP code', 'Postcode', 'City', 'Apt / Suite', 'Delivery address', 'Step 2 of 3',
    'Shipping address', 'Billing ZIP', 'Address line 2', 'House number', 'Suite or apartment', 'Building name', '5 items in cart', 'Route 66 playlist', 'Floor 3 meeting room']) {
    assert.equal((await read({ ...BOX, nearbyLabel: label })).hit.nearbyLabel, label, label)
  }
})

