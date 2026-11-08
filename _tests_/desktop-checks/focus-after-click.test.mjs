import assert from 'node:assert/strict'
import { test } from 'node:test'

import { attemptPlan, attemptRow, framePoint, frameOf, guardRefusal, readOf, summarize, typeJudgements } from '../../_tools_/desktop-checks/focus-after-click.mjs'
import { buildFixtureApp } from '../../_tools_/desktop-fixture/build.mjs'
import { launchFixture } from '../../_tools_/desktop-fixture/client.mjs'

// CU-226's measurement logic, without a Mac's input: the plan's points, how a run's events are read, the guards.

const SCREEN = { width: 1512, height: 982, scale: 2 }
const WINDOWS = { main: { x: 100, y: 50 } }
const TARGETS = { password: { window: 'main', cx: 210, cy: 281 }, 'paste-target': { window: 'main', cx: 210, cy: 483 } }

test('the plan clicks the Password entry and types in one batch; the entry start clicks the paste entry first', () => {
  const { frame, factor } = frameOf(SCREEN)
  assert.deepEqual([frame.width, frame.height], [1512 * factor, 982 * factor])
  assert.deepEqual(framePoint('password', TARGETS, WINDOWS, factor), { x: Math.round(310 * factor), y: Math.round(331 * factor) })
  const none = attemptPlan('none', TARGETS, WINDOWS, SCREEN)
  assert.equal(none.turns.length, 2)
  assert.deepEqual(none.turns[0].actions.map((a) => a.type), ['click', 'type'], 'one batch: the race is inside it')
  assert.equal(none.turns[0].actions[1].text, 'x')
  const entry = attemptPlan('entry', TARGETS, WINDOWS, SCREEN)
  assert.deepEqual(entry.turns.map((t) => t.actions?.map((a) => a.type) ?? 'final'), [['click', 'type'], ['click', 'type'], 'final'])
  assert.deepEqual(entry.turns[0].actions[0], { type: 'click', button: 'left', ...framePoint('paste-target', TARGETS, WINDOWS, factor) })
  assert.equal(attemptPlan('none', {}, WINDOWS, SCREEN), null, 'no Password target: no plan')
  assert.equal(attemptPlan('none', TARGETS, WINDOWS, { width: 0 }), null, 'no screen: no plan')
  assert.throws(() => attemptPlan('other', TARGETS, WINDOWS, SCREEN))
})

const event = (step, index, type, target, extra = {}) => JSON.stringify({ kind: 'action', step, index, t: '2026-11-08T10:00:00.000Z', action: { type }, ...(target === undefined ? {} : { target }), decision: 'allow', rule: 'default', ...extra })

test('a run\'s events give each type\'s judged target once, in order; fresh only for the aimed entry', () => {
  const text = [
    event(1, 0, 'click', { origin: 'f', role: 'AXTextField', name: '' }),
    event(1, 1, 'type', { origin: 'f', role: 'AXTextField', name: '' }),
    event(1, 1, 'type', { origin: 'f', role: 'AXTextField', name: '' }, { status: 'done' }),
    event(2, 0, 'click', { origin: 'f', role: 'AXTextField', name: 'Password' }, { t: '2026-11-08T10:00:01.000Z' }),
    event(2, 0, 'click', { origin: 'f', role: 'AXTextField', name: 'Password' }, { status: 'done', t: '2026-11-08T10:00:01.180Z' }),
    event(2, 1, 'type', { origin: 'f', role: 'AXTextField', name: 'Password' }, { decision: 'handoff', rule: 'password_field', t: '2026-11-08T10:00:01.214Z' }),
    'not json',
  ].join('\n')
  const judged = typeJudgements(text)
  assert.equal(judged.length, 2, 'the decision and outcome events of one action count once')
  assert.deepEqual(judged[1], { step: 2, target: { role: 'AXTextField', name: 'Password' }, decision: 'handoff', rule: 'password_field', class: null, afterClickMs: 34 }, 'from the click\'s last record (its done) to the type\'s decision')
  assert.equal(judged[0].afterClickMs, 0, 'step 1: same stamp')
  assert.equal(readOf(judged[1], 'Password'), 'fresh')
  assert.equal(readOf(judged[0], 'Password'), 'stale', 'the entry that had the focus before')
  assert.equal(readOf({ target: null }, 'Password'), 'stale', 'no target at all')
  assert.equal(readOf({ target: { role: 'AXWindow', name: 'Password' } }, 'Password'), 'stale', 'not an entry')
  assert.equal(readOf(undefined, 'Password'), 'missing')
})

test('rows and the summary: stale run ids listed, the entry start\'s first pair counted', () => {
  const fresh = { target: { role: 'AXTextField', name: 'Password' }, decision: 'handoff', afterClickMs: 30 }
  const stale = { target: null, decision: 'allow', afterClickMs: 12 }
  const first = { target: { role: 'AXTextField', name: '' }, decision: 'allow' }
  const rows = [
    attemptRow({ start: 'none', index: 0, result: { runId: 'r1', status: 'needs_input' }, judgements: [fresh], facts: { fields: { passwordText: '' } } }),
    attemptRow({ start: 'none', index: 1, result: { runId: 'r2', status: 'completed' }, judgements: [stale], facts: { fields: { passwordText: 'x' } } }),
    attemptRow({ start: 'entry', index: 0, result: { runId: 'r3' }, judgements: [first, fresh], facts: {} }),
  ]
  assert.deepEqual([rows[0].measured.read, rows[1].measured.read, rows[1].typedIntoPassword], ['fresh', 'stale', true])
  assert.equal(rows[2].firstPair.read, 'fresh', 'the unnamed paste entry was the one aimed at')
  assert.deepEqual(summarize(rows), { attempts: 3, byStart: { none: { fresh: 1, stale: 1, missing: 0 }, entry: { fresh: 1, stale: 0, missing: 0 } }, staleRuns: ['r2'], firstPairs: { fresh: 1, stale: 0, missing: 0 }, afterClickMs: { min: 12, median: 30, max: 30 } })
})

test('guards refuse before any input: no seat, no hold of this seat, an active run, an unreadable or short idle time', () => {
  const held = { hold: { seat: 'cu-developer-two' }, run: null }
  assert.match(guardRefusal({ seat: undefined, status: held, idleSeconds: 900 }), /--seat/)
  assert.match(guardRefusal({ seat: 'cu-developer-two', status: { hold: { seat: 'cu-verifier' } }, idleSeconds: 900 }), /not held by cu-developer-two/)
  assert.match(guardRefusal({ seat: 'cu-developer-two', status: { ...held, run: { seat: 'cu-integrator' } }, idleSeconds: 900 }), /a run is active/)
  assert.match(guardRefusal({ seat: 'cu-developer-two', status: held, idleSeconds: NaN }), /could not be read/)
  assert.match(guardRefusal({ seat: 'cu-developer-two', status: held, idleSeconds: 299 }), /D-066/)
  assert.equal(guardRefusal({ seat: 'cu-developer-two', status: held, idleSeconds: 300 }), null)
})

test('on the real fixture (offscreen): consent-cells reports both targets, so a plan is built for each start', async () => {
  const fixture = await launchFixture(buildFixtureApp().executable, { offscreen: true })
  try {
    await fixture.open('consent-cells', { title: 'Import', copyRow: true })
    const [targets, windows, screen] = [await fixture.targets(), await fixture.call('windows', {}), await fixture.call('screen', {})]
    for (const start of ['none', 'entry']) assert.notEqual(attemptPlan(start, targets, windows, screen), null, `${start}: ${JSON.stringify(Object.keys(targets ?? {}))}`)
    assert.equal((await fixture.state()).fields.passwordText, '', 'the Password entry starts empty')
  } finally {
    await fixture.close()
  }
})
