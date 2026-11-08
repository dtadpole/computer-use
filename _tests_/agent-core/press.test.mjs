import assert from 'node:assert/strict'
import { test } from 'node:test'

import { PRESS_HOLD_MAX_MS, composePresses } from '../../_tools_/agent-core/press.mjs'

// CU-64: a press, its moves, waits and release, in one batch, become one drag; nothing stays held past one request.

const down = { type: 'mouse_down' }
const up = { type: 'mouse_up' }
const move = (x, y) => ({ type: 'move', x, y })
const wait = (ms) => ({ type: 'wait', duration_ms: ms })
const codeAt = (r, i) => r.results[i].code

test('a batch without a press comes back unchanged, one member each', () => {
  const actions = [move(1, 2), { type: 'keypress', keys: ['A'] }]
  const r = composePresses(actions)
  assert.equal(r.ok, true)
  assert.equal(r.actions, actions)
  assert.deepEqual(r.members, [[0], [1]])
})

test('move, down, moves, up become one drag from the pointer; members map back to every original block', () => {
  const r = composePresses([move(10, 10), down, move(20, 10), move(30, 15), up, { type: 'screenshot' }])
  assert.equal(r.ok, true)
  assert.deepEqual(r.actions[0], move(10, 10))
  assert.deepEqual(r.actions[1].path, [{ x: 10, y: 10 }, { x: 20, y: 10 }, { x: 30, y: 15 }])
  assert.equal(r.actions[1].type, 'drag')
  assert.deepEqual(r.actions[1].composedFrom.map((m) => m.type), ['mouse_down', 'move', 'move', 'mouse_up'])
  assert.deepEqual(r.members, [[0], [1, 2, 3, 4], [5]])
})

test('the press starts at the last pointer agent core sent before the batch; without one it is refused', () => {
  assert.deepEqual(composePresses([down, move(5, 5), up], { lastPointer: { x: 1, y: 1 } }).actions[0].path, [{ x: 1, y: 1 }, { x: 5, y: 5 }])
  const r = composePresses([down, up])
  assert.equal(r.ok, false)
  assert.equal(codeAt(r, 0), 'no_pointer')
  assert.equal(codeAt(r, 1), 'batch_refused')
})

test('a long press: a wait becomes the point\'s holdMs, a one-place press is a two-point path; only where holds are supported', () => {
  const r = composePresses([move(40, 40), down, wait(1500), up], { holds: true })
  assert.deepEqual(r.actions[1].path, [{ x: 40, y: 40, holdMs: 1500 }, { x: 40, y: 40 }])
  const no = composePresses([move(40, 40), down, wait(1500), up])
  assert.equal(no.ok, false)
  assert.equal(codeAt(no, 2), 'unsupported_action')
  const plain = composePresses([move(40, 40), down, up])
  assert.deepEqual(plain.actions[1].path, [{ x: 40, y: 40 }, { x: 40, y: 40 }], 'a quick press needs no hold support')
})

test(`held at most ${PRESS_HOLD_MAX_MS} ms in all`, () => {
  const r = composePresses([move(1, 1), down, wait(6000), move(2, 2), wait(5000), up], { holds: true })
  assert.equal(r.ok, false)
  assert.equal(codeAt(r, 4), 'malformed')
})

test('nothing is ever left held: an unpaired down or up, a second down, or another action inside refuses the whole batch', () => {
  for (const [actions, at, code] of [
    [[move(1, 1), down, move(2, 2)], 1, 'unpaired_press'],
    [[move(1, 1), up], 1, 'unpaired_press'],
    [[move(1, 1), down, down, up], 2, 'interleaved_press'],
    [[move(1, 1), down, { type: 'keypress', keys: ['A'] }, up], 2, 'interleaved_press'],
    [[move(1, 1), down, { type: 'click', button: 'left', x: 3, y: 3 }, up], 2, 'interleaved_press'],
  ]) {
    const r = composePresses(actions, { holds: true })
    assert.equal(r.ok, false, JSON.stringify(actions))
    assert.equal(codeAt(r, at), code, JSON.stringify(actions))
    assert.ok(r.results.every((x) => x.status === 'refused'), 'every action is refused; nothing runs')
  }
})

test('two presses in one batch, and a press after a drag starts where the drag ended', () => {
  const r = composePresses([{ type: 'drag', path: [{ x: 1, y: 1 }, { x: 9, y: 9 }] }, down, move(12, 12), up, down, up])
  assert.equal(r.ok, true)
  assert.deepEqual(r.actions[1].path, [{ x: 9, y: 9 }, { x: 12, y: 12 }])
  assert.deepEqual(r.actions[2].path, [{ x: 12, y: 12 }, { x: 12, y: 12 }])
  assert.deepEqual(r.members, [[0], [1, 2, 3], [4, 5]])
})
