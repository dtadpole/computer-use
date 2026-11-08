import assert from 'node:assert/strict'
import { test } from 'node:test'

import { joinSplitResults, splitTypesAtTabs } from '../../_tools_/agent-core/type-split.mjs'

test('a type holding tabs becomes its segments with a Tab keypress between; others pass through', () => {
  const { actions, origin } = splitTypesAtTabs([{ type: 'click', x: 1, y: 1, button: 'left' }, { type: 'type', text: 'Fay 9\t42\tpaid\n' }, { type: 'type', text: 'plain' }])
  assert.deepEqual(actions, [
    { type: 'click', x: 1, y: 1, button: 'left' },
    { type: 'type', text: 'Fay 9' }, { type: 'keypress', keys: ['TAB'] }, { type: 'type', text: '42' }, { type: 'keypress', keys: ['TAB'] }, { type: 'type', text: 'paid\n' },
    { type: 'type', text: 'plain' },
  ])
  assert.deepEqual(origin, [0, 1, 1, 1, 1, 1, 2])
  assert.deepEqual(splitTypesAtTabs([{ type: 'type', text: '\tx\t' }]).actions, [{ type: 'keypress', keys: ['TAB'] }, { type: 'type', text: 'x' }, { type: 'keypress', keys: ['TAB'] }], 'leading and trailing tabs')
})

test('one result per original action: the first part that did not complete speaks for it', () => {
  const original = [{ type: 'type', text: 'a\tb' }, { type: 'click' }]
  const origin = [0, 0, 0, 1]
  const done = { status: 'done' }
  assert.deepEqual(joinSplitResults([{ ...done, index: 0 }, { ...done, index: 1 }, { ...done, index: 2 }, { ...done, index: 3 }], origin, original).map((r) => [r.index, r.type, r.status]), [[0, 'type', 'done'], [1, 'click', 'done']])
  const declined = joinSplitResults([done, done, { status: 'declined', code: 'consent_declined', message: 'no' }, { status: 'skipped' }], origin, original)
  assert.deepEqual(declined.map((r) => [r.index, r.status, r.code ?? null]), [[0, 'declined', 'consent_declined'], [1, 'skipped', null]])
})

test('the reason a split action stopped is what the model hears: declined, not the skipped part after it (cu-verifier)', () => {
  const original = [{ type: 'type', text: 'x\t ' }]
  const joined = joinSplitResults([{ status: 'done' }, { status: 'declined', code: 'consent_declined', message: 'declined' }, { status: 'skipped', message: 'skipped' }], [0, 0, 0], original)
  assert.deepEqual(joined.map((r) => [r.index, r.type, r.status, r.code ?? null]), [[0, 'type', 'declined', 'consent_declined']])
})
