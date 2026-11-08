import assert from 'node:assert/strict'
import { test } from 'node:test'

import { MAX_ACTIONS_PER_CALL, validateBatch } from '../../_tools_/agent-core/actions.mjs'

const frame = { width: 1440, height: 900 }
const ok = (actions, extensions) => {
  const result = validateBatch(actions, { frame, extensions })
  assert.equal(result.ok, true, JSON.stringify(result.results))
  return result
}
const refused = (actions, extensions) => {
  const result = validateBatch(actions, { frame, extensions })
  assert.equal(result.ok, false)
  return result.results
}

test("OpenAI's documented batch validates unchanged", () => {
  const { actions } = ok([{ type: 'click', button: 'left', x: 405, y: 157 }, { type: 'type', text: 'penguin' }])
  assert.deepEqual(actions, [{ type: 'click', button: 'left', x: 405, y: 157 }, { type: 'type', text: 'penguin' }])
})

test('all nine GA actions validate and normalise', () => {
  const { actions } = ok([
    { type: 'click', button: 'right', x: 1, y: 2, keys: ['shift'] },
    { type: 'double_click', x: 10.4, y: 20.6 },
    { type: 'drag', path: [{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 9, y: 9 }], keys: ['CTRL'] },
    { type: 'move', x: 1439, y: 899 },
    { type: 'scroll', x: 100, y: 100, scroll_x: 0, scroll_y: -300.4 },
    { type: 'keypress', keys: ['ctrl', 'a'] },
    { type: 'type', text: 'hello\n' },
    { type: 'wait' },
    { type: 'screenshot' },
  ])
  assert.deepEqual(actions[0], { type: 'click', button: 'right', x: 1, y: 2, keys: ['SHIFT'] })
  assert.deepEqual(actions[1], { type: 'double_click', x: 10, y: 21 })
  assert.deepEqual(actions[2].keys, ['CTRL'])
  assert.deepEqual(actions[4], { type: 'scroll', x: 100, y: 100, scroll_x: 0, scroll_y: -300 })
  assert.deepEqual(actions[5], { type: 'keypress', keys: ['CTRL', 'A'] })
  assert.deepEqual(actions[7], { type: 'wait', duration_ms: 1000 })
})

test('one bad action refuses the whole batch; each action is refused by name', () => {
  const results = refused([{ type: 'click', button: 'left', x: 1, y: 1 }, { type: 'hover', x: 1, y: 1 }])
  assert.deepEqual(results.map((r) => [r.status, r.code]), [['refused', 'batch_refused'], ['refused', 'unsupported_action']])
  assert.match(results[1].message, /hover/)
  assert.match(results[0].message, /action 1/)
})

test('malformed fields, bounds and keys are refused with their codes', () => {
  const cases = [
    [{ type: 'click', x: 1, y: 1 }, 'malformed'],
    [{ type: 'click', button: 'middle', x: 1, y: 1 }, 'malformed'],
    [{ type: 'click', button: 'left', x: 1440, y: 1 }, 'out_of_bounds'],
    [{ type: 'click', button: 'left', x: -1, y: 1 }, 'out_of_bounds'],
    [{ type: 'move', x: '5', y: 1 }, 'malformed'],
    [{ type: 'drag', path: [{ x: 1, y: 1 }] }, 'malformed'],
    [{ type: 'drag', path: [{ x: 1, y: 1 }, { x: 2, y: 901 }] }, 'out_of_bounds'],
    [{ type: 'scroll', x: 1, y: 1, scroll_x: 0 }, 'malformed'],
    [{ type: 'keypress', keys: [] }, 'malformed'],
    [{ type: 'keypress', keys: ['HYPER'] }, 'unsupported_key'],
    [{ type: 'keypress', keys: ['A'], repeat: 101 }, 'malformed'],
    [{ type: 'click', button: 'left', x: 1, y: 1, keys: ['é'] }, 'unsupported_key'],
    [{ type: 'type', text: '' }, 'malformed'],
    [{ type: 'wait', duration_ms: 10_001 }, 'malformed'],
    [{ type: 'wait', duration_ms: 1.5 }, 'malformed'],
    [{ text: 'no type' }, 'malformed'],
    ['click', 'malformed'],
  ]
  for (const [action, code] of cases) assert.equal(refused([action])[0].code, code, JSON.stringify(action))
})

test('extensions pass only when the adapter declared them', () => {
  for (const action of [{ type: 'triple_click', x: 1, y: 1 }, { type: 'zoom', region: [0, 0, 10, 10] }, { type: 'cursor_position' }, { type: 'navigate', url: 'http://127.0.0.1:43117/' }]) {
    assert.equal(refused([action])[0].code, 'unsupported_action', action.type)
  }
  const all = ['triple_click', 'zoom', 'cursor_position', 'navigate']
  const { actions } = ok([{ type: 'zoom', region: [0, 0, 1440, 900] }, { type: 'navigate', url: 'https://example.com' }, { type: 'keypress', keys: ['DOWN'], repeat: 30 }], all)
  assert.deepEqual(actions[1], { type: 'navigate', url: 'https://example.com/' })
  assert.deepEqual(actions[2], { type: 'keypress', keys: ['ARROWDOWN'], repeat: 30 })
  assert.equal(refused([{ type: 'zoom', region: [10, 10, 5, 20] }], all)[0].code, 'out_of_bounds')
  assert.equal(refused([{ type: 'navigate', url: 'file:///etc/passwd' }], all)[0].code, 'malformed')
  assert.equal(refused([{ type: 'navigate', url: '/relative' }], all)[0].code, 'malformed')
})

test('batch size is capped and an empty call is refused; unknown extra fields are only warned', () => {
  const many = Array.from({ length: MAX_ACTIONS_PER_CALL + 1 }, () => ({ type: 'screenshot' }))
  assert.ok(refused(many).every((r) => r.code === 'batch_too_large'))
  assert.equal(refused([])[0].code, 'malformed')
  const { warnings } = ok([{ type: 'screenshot', id: 'x' }, { type: 'click', button: 'left', x: 1, y: 1, pending: true }])
  assert.deepEqual(warnings, [{ index: 0, ignoredFields: ['id'] }, { index: 1, ignoredFields: ['pending'] }])
  assert.throws(() => validateBatch([{ type: 'screenshot' }]), TypeError)
})
