import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createAppPolicy } from '../../_tools_/agent-core/app-policy.mjs'

// CU-190 (keyboard-activation.md): a default button the helper could not read asks submit for a Return.
const FIXTURE = 'ai.reflection.cu.fixture'
const tmp = mkdtempSync(join(tmpdir(), 'cu-190-'))
after(() => rmSync(tmp, { recursive: true, force: true }))
const store = createAppApprovals({ path: join(tmp, 'a.json') })
store.grantAlways(FIXTURE, { by: 'api' })
const policy = createAppPolicy({ scope: [FIXTURE], approvals: store })
const field = (extra, role = 'AXTextField') => ({ origin: FIXTURE, role, name: 'Message', editable: true, fingerprint: 'm', ...extra })
const judge = (action, target) => policy.classify(action, { frontmostBundleId: FIXTURE, target })
const NEWLINE = { type: 'type', text: 'ok\n' }
const ENTER = { type: 'keypress', keys: ['ENTER'] }

test('CU-190: an unread default button asks submit for a typed newline or a Return, and says why', () => {
  for (const action of [NEWLINE, ENTER]) {
    const v = judge(action, field({ defaultButton: null, defaultButtonRead: false }))
    assert.deepEqual([v.decision, v.class], ['confirm', 'submit'], action.type)
    assert.match(v.reason, /the default button could not be read/)
  }
})

test('CU-190: a read with no default button, or no read state (an older helper), keeps today\'s rule', () => {
  assert.equal(judge(NEWLINE, field({ defaultButton: null, defaultButtonRead: true })).decision, 'allow', 'read, none')
  assert.equal(judge(NEWLINE, field({})).decision, 'allow', 'an older helper')
  const named = judge(NEWLINE, field({ defaultButton: { role: 'AXButton', name: 'Send', panel: null }, defaultButtonRead: true }))
  assert.equal(named.class, 'submit', 'a read button is judged by its name, as before')
  assert.doesNotMatch(named.reason, /could not be read/)
})

test('CU-190: in a text area a typed newline is text even when unread; Command-Return asks', () => {
  assert.equal(judge(NEWLINE, field({ defaultButton: null, defaultButtonRead: false }, 'AXTextArea')).decision, 'allow')
  assert.equal(judge({ type: 'keypress', keys: ['META', 'ENTER'] }, field({ defaultButton: null, defaultButtonRead: false }, 'AXTextArea')).class, 'submit')
})
