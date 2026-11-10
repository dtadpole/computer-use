import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-373 (High pending a live row; design note 0.1): a control named for account security reaches a credential (D-063),
// so a press asks, whatever a toggle's direction (the driver reports no checked state yet).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (role, name) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://mail.example/settings', target: { role, name } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-373: app passwords, auto-forwarding, two-factor and recovery controls ask credential on any control kind', () => {
  for (const [role, name] of [['button', 'Generate app password'], ['link', 'App passwords'], ['button', 'Add a forwarding address'], ['checkbox', 'Forward a copy of incoming mail to'], ['switch', 'Two-factor authentication'], ['switch', '2-Step Verification'], ['button', 'Recovery codes'], ['button', 'Create app-specific password'], ['button', 'Create filter']]) {
    assert.equal(click(role, name), 'credential', `${role} ${name}`)
  }
  assert.notEqual(click('button', 'Turn off 2FA'), 'allow', 'a stronger class may lead, it still asks')
})

test('CU-373 negatives: a bare Forward on one message and other mail controls keep their rules', () => {
  for (const name of ['Forward', 'Archive', 'Forwarded messages']) assert.equal(click('button', name), 'allow', name)
  assert.equal(click('switch', 'Disable forwarding'), 'allow', 'turning forwarding off is the safe direction')
})

test('CU-373 refinement: a native toggle state decides the direction; an ARIA, mixed or missing state asks', () => {
  const press = (target) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://mail.example/settings', target }); return v.decision === 'allow' ? 'allow' : v.class }
  const box = (name, checked) => ({ tag: 'input', inputType: 'checkbox', role: 'checkbox', name, checked })
  assert.equal(press(box('Two-factor authentication', false)), 'allow', 'native off -> on: protection on')
  assert.equal(press(box('Two-factor authentication', true)), 'credential', 'native on -> off asks')
  assert.equal(press(box('Two-factor authentication', 'mixed')), 'credential', 'mixed asks')
  assert.equal(press({ role: 'switch', name: 'Two-factor authentication', checked: false }), 'credential', 'an ARIA-sourced off asks (the derivation pin)')
  assert.equal(press(box('Forward a copy of incoming mail to', true)), 'allow', 'native forwarding on -> off is the safe direction')
  assert.equal(press(box('Forward a copy of incoming mail to', false)), 'credential', 'turning forwarding on asks')
  const radio = (name) => ({ tag: 'input', inputType: 'radio', role: 'radio', name, checked: false })
  assert.equal(press(radio('Two-factor authentication off')), 'credential', 'a radio has no direction: its label decides')
  assert.equal(press(radio('2-Step Verification: Off')), 'credential')
  assert.equal(press(box('App passwords', false)), 'credential', 'only the protection list goes free when turned on')
})

test('CU-373 audit: the recorded target of a 2FA-checkbox click carries its checked state', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { createScriptedAdapter } = await import('../../_tools_/agent-core/adapter-scripted.mjs')
  const { createRunControl } = await import('../../_tools_/agent-core/control.mjs')
  const { createFakeEnvironment } = await import('../../_tools_/agent-core/fake-env.mjs')
  const { runTask } = await import('../../_tools_/agent-core/loop.mjs')
  const { createSitePolicy } = await import('../../_tools_/agent-core/sites.mjs')
  const { readRun } = await import('../../_tools_/agent-core/trajectory.mjs')
  const tmp = mkdtempSync(join(tmpdir(), 'cu-373-'))
  try {
    const control = createRunControl()
    const environment = createFakeEnvironment({ kind: 'browser', control, url: 'https://mail.example/settings' })
    environment.inspectPoint = async () => ({ origin: 'https://mail.example', tag: 'input', inputType: 'checkbox', role: 'checkbox', name: '2-Step Verification', checked: false })
    const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions: [{ type: 'click', x: 10, y: 10, button: 'left' }] }, { final: 'done' }] })
    const result = await runTask({ task: 'secure my account', environment, model, control, runsDirectory: join(tmp, 'runs'), build: { commit: 'test', dirty: false }, sitePolicy: createSitePolicy({ allowed: ['https://mail.example'] }) })
    const click = readRun(result.trajectoryDir).events.filter((e) => e.kind === 'action' && e.action?.type === 'click').at(-1)
    assert.equal(click.target?.checked, false)
  } finally { rmSync(tmp, { recursive: true, force: true }) }
})
