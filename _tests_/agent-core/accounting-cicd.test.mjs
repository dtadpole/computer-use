import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-538 + CU-539 (High; cu-coordinator 01:36Z), table PR 39: accounting and CI/CD. Click and Space (D-106).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const classesOf = (name, url, key = false) => {
  const v = key ? policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url, target: { tag: 'button', role: 'button', name } }) : policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'button', name } })
  return v.decision === 'allow' ? [] : (v.classes ?? [v.class])
}
const BOOKS = 'https://books.example/accounting/invoices'
const ACTIONS = 'https://code.example/acme/app/settings/actions'

test('CU-538: accounting rows ask their ruled class', () => {
  for (const [name, cls] of [['Write off invoice', 'purchase'], ['Record payment', 'purchase'], ['Close books', 'submit'], ['Close period', 'submit'], ['Reopen period', 'permission'], ['Unlock period', 'permission'], ['Undo reconciliation', 'delete']]) {
    assert.ok(classesOf(name, BOOKS).includes(cls), name)
    assert.ok(classesOf(name, BOOKS, true).includes(cls), `Space: ${name}`)
  }
  for (const name of ['Invoices', 'Payments', 'Reconciliation', 'Period settings']) assert.deepEqual(classesOf(name, BOOKS), [], name)
})

test('CU-539: CI/CD rows; runner / workflow rows on actions pages only', () => {
  assert.ok(classesOf('Promote to production', ACTIONS).includes('submit'))
  for (const cls of ['permission', 'submit']) assert.ok(classesOf('Skip deployment protection rules', ACTIONS).includes(cls), cls)
  for (const name of ['Add self-hosted runner', 'Disable workflow']) {
    assert.ok(classesOf(name, ACTIONS).includes('permission'), `actions page: ${name}`)
    assert.deepEqual(classesOf(name, BOOKS), [], `elsewhere: ${name}`)
  }
  for (const name of ['Runners', 'Workflows', 'Production']) assert.deepEqual(classesOf(name, ACTIONS), [], name)
  assert.ok(classesOf('Deploy to production', ACTIONS).includes('submit'), 'older row unchanged')
})
