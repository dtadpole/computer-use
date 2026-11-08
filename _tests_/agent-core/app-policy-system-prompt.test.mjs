import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createAppPolicy, isSystemPrompt } from '../../_tools_/agent-core/app-policy.mjs'
import { parsePreApproval } from '../../_tools_/agent-core/cli.mjs'

// CU-76: a system privacy or permission prompt is the person's to answer, even inside an approved app's window - a
// hand-off, never a consent and never pre-approved.

const FIXTURE = 'ai.reflection.cu.fixture'
const click = { type: 'click', button: 'left', x: 10, y: 10 }
const keypress = (...keys) => ({ type: 'keypress', keys })
const button = (name, extra = {}) => ({ origin: FIXTURE, role: 'AXButton', name, fingerprint: name, ...extra })
const ctx = (target, extra = {}) => ({ frontmostBundleId: FIXTURE, target, ...extra })
const tmp = mkdtempSync(join(tmpdir(), 'cu-system-prompt-'))
after(() => rmSync(tmp, { recursive: true, force: true }))
let n = 0
const policyFor = (options = {}) => {
  const store = createAppApprovals({ path: join(tmp, `a-${n += 1}.json`) })
  store.grantAlways(FIXTURE, { by: 'api' })
  return createAppPolicy({ scope: [FIXTURE], approvals: store, ...options })
}

test('the paste prompt\'s buttons in an approved app\'s window are handed off, never confirmed', () => {
  const policy = policyFor()
  for (const name of ['Allow Paste', "Don't Allow Paste", 'Don\u2019t Allow Paste', 'allow paste']) {
    const verdict = policy.classify(click, ctx(button(name)))
    assert.equal(verdict.decision, 'handoff', name)
    assert.equal(verdict.rule, 'system_prompt', name)
  }
})

test('Return on a focused "Open System Settings" is handed off too', () => {
  assert.equal(policyFor().classify(keypress('RETURN'), ctx(button('Open System Settings'))).rule, 'system_prompt')
})

test('the helper\'s systemPrompt marker hands off any button of the prompt, a generic "Allow" included', () => {
  assert.equal(policyFor().classify(click, ctx(button('Allow', { systemPrompt: 'privacy' }))).rule, 'system_prompt')
  assert.equal(isSystemPrompt(button('OK', { systemPrompt: true })), true)
})

test('an app\'s own "Allow" without the marker is not a system prompt', () => {
  assert.equal(isSystemPrompt(button('Allow')), false)
  assert.notEqual(policyFor().classify(click, ctx(button('Allow'))).decision, 'handoff')
})

test('a pre-approval cannot reach it: the hand-off comes before any class or pre-approval', () => {
  const policy = policyFor({ preApprovals: [parsePreApproval(`submit@${FIXTURE}`)] })
  assert.equal(policy.classify(click, ctx(button('Allow Paste'))).decision, 'handoff')
})

test('moving or scrolling over a prompt is not answering it', () => {
  assert.notEqual(policyFor().classify({ type: 'scroll', x: 10, y: 10, scrollX: 0, scrollY: 3 }, ctx(button('Allow Paste'))).decision, 'handoff')
})

test('the marker is structural: a localized prompt (non-English titles) carrying it is handed off', () => {
  const policy = policyFor()
  for (const name of ['Erlauben', 'Einsetzen erlauben', '允许粘贴', '不允许']) {
    assert.equal(policy.classify(click, ctx(button(name, { systemPrompt: 'paste' }))).rule, 'system_prompt', name)
  }
  assert.equal(isSystemPrompt(button('Erlauben')), false, 'without the mark a foreign title is not guessed at')
})

test('while a prompt is present every key is handed off, whatever has focus (Return, Space, Escape, typing)', () => {
  const policy = policyFor()
  const field = { origin: FIXTURE, role: 'AXTextField', name: 'Notes', fingerprint: 'notes' }
  for (const action of [keypress('RETURN'), keypress('SPACE'), keypress('ESCAPE'), { type: 'type', text: 'hello' }]) {
    assert.equal(policy.classify(action, ctx(field, { systemPrompt: true })).rule, 'system_prompt', JSON.stringify(action))
  }
  assert.notEqual(policy.classify(keypress('RETURN'), ctx(field)).decision, 'handoff', 'no prompt, no hand-off')
})

