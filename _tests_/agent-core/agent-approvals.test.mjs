import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-427 (High): running a command on this Mac (install) and approving another agent's actions (permission). Click,
// Return and Space (D-106). Both sides (D-099). The Return field is not a chat compose field (that asks submit on its own).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const URL = 'https://chat.example/session'
const click = (name) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }
const enter = (name) => { const v = policy.classify({ type: 'keypress', keys: ['ENTER'] }, { url: URL, target: { tag: 'input', role: 'textbox', name: 'Working directory', defaultButtonRead: true, defaultButton: { role: 'button', name } } }); return v.decision === 'allow' ? 'allow' : v.class }
const space = (name) => { const v = policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url: URL, target: { tag: 'button', role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-427: running a command asks install', () => {
  for (const name of ['Run command', 'Run in terminal', 'Execute command', 'Run this command']) {
    assert.equal(click(name), 'install', name)
    assert.equal(enter(name), 'install', `Return: ${name}`)
    assert.equal(space(name), 'install', `Space: ${name}`)
  }
})

test('CU-427: approving tools, trusting a workspace, YOLO / auto-approve and accepting all edits ask permission', () => {
  for (const name of ['Allow tool', 'Always allow', 'Trust workspace', 'Trust folder', 'Turn on YOLO mode', 'Auto-approve', 'Accept all edits', 'Accept all changes', 'Apply all changes']) {
    assert.equal(click(name), 'permission', name)
    assert.equal(enter(name), 'permission', `Return: ${name}`)
  }
})

test('CU-427 negatives: lists, Reject, Deny, Review changes and the bare Accept all (cookie banners, named) stay free', () => {
  for (const name of ['Commands', 'Terminal', 'Tools', 'Reject', 'Deny', 'Review changes', 'Accept all']) assert.equal(click(name), 'allow', name)
})
