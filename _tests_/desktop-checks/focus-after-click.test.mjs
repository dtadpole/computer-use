import assert from 'node:assert/strict'
import { test } from 'node:test'

import { attemptPlan, attemptRow, fixtureVerdict, framePoint, frameOf, guardRefusal, keyJudgements, readOf, summarize, upper95 } from '../../_tools_/desktop-checks/focus-after-click.mjs'
import { buildFixtureApp } from '../../_tools_/desktop-fixture/build.mjs'
import { launchFixture } from '../../_tools_/desktop-fixture/client.mjs'

// CU-226's measurement logic, without a Mac's input: the plans' points and batches, how a run's events and the fixture's
// record are read, the summary's bound, the guards.

const SCREEN = { width: 1512, height: 982, scale: 2 }
const WINDOWS = { main: { x: 100, y: 50 } }
const CELLS = { password: { window: 'main', cx: 210, cy: 281 }, 'paste-target': { window: 'main', cx: 210, cy: 483 } }
const KEYS = { message: { window: 'main', cx: 210, cy: 65 }, notes: { window: 'main', cx: 210, cy: 197 } }

test('the type route clicks Password and types in one batch; its entry start, and the return route, click another entry first', () => {
  const { frame, factor } = frameOf(SCREEN)
  assert.deepEqual([frame.width, frame.height], [1512 * factor, 982 * factor])
  assert.deepEqual(framePoint('password', CELLS, WINDOWS, factor), { x: Math.round(310 * factor), y: Math.round(331 * factor) })
  const none = attemptPlan('type', 'none', CELLS, WINDOWS, SCREEN)
  assert.equal(none.turns.length, 2)
  assert.deepEqual(none.turns[0].actions.map((a) => a.type), ['click', 'type'], 'one batch: the race is inside it')
  const entry = attemptPlan('type', 'entry', CELLS, WINDOWS, SCREEN)
  assert.deepEqual(entry.turns.map((t) => t.actions?.map((a) => a.type) ?? 'final'), [['click', 'type'], ['click', 'type'], 'final'])
  assert.deepEqual(entry.turns[0].actions[0], { type: 'click', button: 'left', ...framePoint('paste-target', CELLS, WINDOWS, factor) })
  const ret = attemptPlan('return', 'notes', KEYS, WINDOWS, SCREEN)
  assert.deepEqual(ret.turns[1].actions, [{ type: 'click', button: 'left', ...framePoint('message', KEYS, WINDOWS, factor) }, { type: 'keypress', keys: ['ENTER'] }])
  assert.equal(attemptPlan('type', 'none', {}, WINDOWS, SCREEN), null, 'no Password target: no plan')
  assert.equal(attemptPlan('type', 'none', CELLS, WINDOWS, { width: 0 }), null, 'no screen: no plan')
  assert.throws(() => attemptPlan('type', 'notes', CELLS, WINDOWS, SCREEN))
  assert.throws(() => attemptPlan('other', 'none', CELLS, WINDOWS, SCREEN))
})

const event = (step, index, type, target, extra = {}) => JSON.stringify({ kind: 'action', step, index, t: '2026-11-08T10:00:00.000Z', action: { type }, ...(target === undefined ? {} : { target }), decision: 'allow', rule: 'default', ...extra })

test('a run\'s events give each key\'s judged target once, in order, with its time after the click; fresh only for the aimed entry', () => {
  const text = [
    event(1, 0, 'click', { origin: 'f', role: 'AXTextField', name: '' }),
    event(1, 1, 'type', { origin: 'f', role: 'AXTextField', name: '' }),
    event(1, 1, 'type', { origin: 'f', role: 'AXTextField', name: '' }, { status: 'done' }),
    event(2, 0, 'click', { origin: 'f', role: 'AXTextField', name: 'Message' }, { t: '2026-11-08T10:00:01.000Z' }),
    event(2, 0, 'click', { origin: 'f', role: 'AXTextField', name: 'Message' }, { status: 'done', t: '2026-11-08T10:00:01.180Z' }),
    event(2, 1, 'keypress', { origin: 'f', role: 'AXTextField', name: 'Message' }, { decision: 'confirm', class: 'submit', rule: 'class:submit', t: '2026-11-08T10:00:01.214Z' }),
    'not json',
  ].join('\n')
  const judged = keyJudgements(text)
  assert.equal(judged.length, 2, 'the decision and outcome events of one action count once')
  assert.deepEqual(judged[1], { step: 2, type: 'keypress', target: { role: 'AXTextField', name: 'Message' }, decision: 'confirm', rule: 'class:submit', class: 'submit', afterClickMs: 34 })
  assert.equal(readOf(judged[1], 'Message'), 'fresh')
  assert.equal(readOf(judged[0], 'Password'), 'stale', 'the entry that had the focus before')
  assert.equal(readOf({ target: { role: 'AXTextArea', name: 'Notes' } }, 'Notes'), 'fresh', 'a text area is an entry too')
  assert.equal(readOf({ target: null }, 'Password'), 'stale', 'no target at all')
  assert.equal(readOf({ target: { role: 'AXWindow', name: 'Password' } }, 'Password'), 'stale', 'not an entry')
  assert.equal(readOf(undefined, 'Password'), 'missing')
})

test('the verdict is the fixture\'s record: x in an entry, or Send\'s sent, is stale; a disagreement with the diagnosis is flagged', () => {
  assert.equal(fixtureVerdict('type', { fields: { passwordText: '', pasteTargetText: 'q' } }), 'fresh')
  assert.equal(fixtureVerdict('type', { fields: { passwordText: 'x', pasteTargetText: 'q' } }), 'stale')
  assert.equal(fixtureVerdict('type', { fields: { passwordText: '', pasteTargetText: 'qx' } }), 'stale', 'x landed in the previous entry')
  assert.equal(fixtureVerdict('type', {}), 'unknown')
  assert.equal(fixtureVerdict('return', { events: [{ type: 'sent', via: 'button' }] }), 'stale')
  assert.equal(fixtureVerdict('return', { events: [] }), 'fresh')
  assert.equal(fixtureVerdict('return', {}), 'unknown')
  const fresh = { target: { role: 'AXTextField', name: 'Password' }, decision: 'handoff', afterClickMs: 30 }
  const stale = { target: null, decision: 'allow', afterClickMs: 12 }
  const rows = [
    attemptRow({ route: 'type', start: 'none', index: 0, result: { runId: 'r1' }, judgements: [fresh], facts: { fields: { passwordText: '' } } }),
    attemptRow({ route: 'type', start: 'none', index: 1, result: { runId: 'r2' }, judgements: [stale], facts: { fields: { passwordText: 'x' } } }),
    attemptRow({ route: 'type', start: 'none', index: 2, result: { runId: 'r3' }, judgements: [fresh], facts: { fields: { passwordText: 'x' } } }),
    attemptRow({ route: 'return', start: 'notes', index: 0, result: { runId: 'r4' }, judgements: [{ target: { role: 'AXTextArea', name: 'Notes' } }, { target: { role: 'AXTextField', name: 'Message' }, afterClickMs: 40 }], facts: { events: [] }, label: 'loaded-3' }),
  ]
  assert.deepEqual(rows.map((r) => [r.verdict, r.measured.read, r.disagree]), [['fresh', 'fresh', false], ['stale', 'stale', false], ['stale', 'fresh', true], ['fresh', 'fresh', false]])
  assert.equal(rows[3].firstPair.read, 'fresh', 'the Notes click and its letter')
  const summary = summarize(rows)
  assert.deepEqual(summary.staleRuns, ['r2', 'r3'])
  assert.deepEqual(summary.disagreements, ['r3'])
  assert.deepEqual(summary.afterClickMs, { min: 12, median: 30, max: 40 })
  assert.deepEqual(summary.groups['return/notes/loaded-3'], { verdict: { fresh: 1, stale: 0, unknown: 0 }, read: { fresh: 1, stale: 0, missing: 0 } })
  assert.deepEqual(summary.bound.type, { stale: 2, of: 3, staleRateUpper95: upper95(2, 3) })
})

test('the detection bound: 0 in 60 is about 4.9%, 0 in 120 about 2.5% (cu-verifier\'s rule of three), and it rises with each stale read', () => {
  assert.equal(upper95(0, 60), 0.049)
  assert.equal(upper95(0, 120), 0.025)
  assert.ok(upper95(1, 60) > upper95(0, 60))
  assert.equal(upper95(3, 3), 1)
  assert.equal(upper95(0, 0), null)
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

test('on the real fixture (offscreen): both screens report their targets, so every route and start gets a plan', async () => {
  const fixture = await launchFixture(buildFixtureApp().executable, { offscreen: true })
  try {
    for (const [route, screen, params, starts] of [['type', 'consent-cells', { title: 'Import', copyRow: true }, ['none', 'entry']], ['return', 'consent-keys', { title: 'Messages' }, ['notes']]]) {
      await fixture.open(screen, params)
      const [targets, windows, shown] = [await fixture.targets(), await fixture.call('windows', {}), await fixture.call('screen', {})]
      for (const start of starts) assert.notEqual(attemptPlan(route, start, targets, windows, shown), null, `${route}/${start}`)
      assert.equal(fixtureVerdict(route, await fixture.state()), 'fresh', `${route}: nothing reached an entry yet`)
    }
  } finally {
    await fixture.close()
  }
})
