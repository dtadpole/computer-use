import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { ApprovalStoreError, createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createAppPolicy } from '../../_tools_/agent-core/app-policy.mjs'

const fresh = () => join(mkdtempSync(join(tmpdir(), 'cu-approvals-')), 'app-approvals.json')

test('grant always, list, revoke; the file is mode 600 and a second store sees changes at once', () => {
  const path = fresh()
  const store = createAppApprovals({ path, now: () => new Date('2026-11-02T09:00:00Z') })
  assert.equal(store.covers('com.apple.TextEdit'), false)
  store.grantAlways('com.apple.TextEdit', { by: 'live' })
  store.grantAlways('com.apple.textedit', { by: 'tty' })
  assert.equal(statSync(path).mode & 0o777, 0o600)
  assert.deepEqual(store.list().apps, [{ bundleId: 'com.apple.TextEdit', grantedAt: '2026-11-02T09:00:00.000Z', by: 'live' }])
  const running = createAppApprovals({ path })
  assert.equal(running.covers('com.apple.TEXTEDIT'), true)
  assert.equal(store.revoke('com.apple.TextEdit'), true)
  assert.equal(running.covers('com.apple.TextEdit'), false, 'a revoke reaches a running run at its next check')
  assert.equal(store.revoke('com.apple.TextEdit'), false)
})

test('an excluded app can never be granted or covered; only a human channel may grant', () => {
  const path = fresh()
  const store = createAppApprovals({ path })
  assert.throws(() => store.grantAlways('com.apple.Terminal', { by: 'live' }), (e) => e instanceof ApprovalStoreError && e.code === 'excluded_app')
  assert.throws(() => store.grantAlways('com.apple.Notes', { by: 'caller' }), (e) => e.code === 'not_human_channel')
  writeFileSync(path, JSON.stringify({ schema: 'cu-app-approvals/v1', apps: [{ bundleId: 'com.1password.1password' }] }))
  assert.equal(store.covers('com.1password.1password'), false, 'a hand-edited file cannot approve an excluded app')
})

test('a corrupt store fails closed: covers nothing, and grant or revoke refuse rather than overwrite', () => {
  const path = fresh()
  writeFileSync(path, '{ not json')
  const store = createAppApprovals({ path })
  assert.equal(store.covers('com.apple.Notes'), false)
  assert.equal(store.list().corrupt, true)
  assert.throws(() => store.grantAlways('com.apple.Notes', { by: 'live' }), (e) => e.code === 'store_corrupt')
  assert.throws(() => store.revoke('com.apple.Notes'), (e) => e.code === 'store_corrupt')
  assert.equal(readFileSync(path, 'utf8'), '{ not json', 'the file is left for the owner to inspect')
})

test('the app policy reads the store at every action', () => {
  const path = fresh()
  const store = createAppApprovals({ path })
  const policy = createAppPolicy({ scope: ['ai.reflection.cu.fixture'], approvals: store })
  const ctx = { frontmostBundleId: 'com.apple.Notes', target: null }
  assert.equal(policy.classify({ type: 'click', button: 'left', x: 1, y: 1 }, ctx).class, 'new_app')
  store.grantAlways('com.apple.Notes', { by: 'live' })
  assert.equal(policy.classify({ type: 'click', button: 'left', x: 1, y: 1 }, ctx).decision, 'allow')
  store.revoke('com.apple.Notes')
  assert.equal(policy.classify({ type: 'click', button: 'left', x: 1, y: 1 }, ctx).class, 'new_app')
})
