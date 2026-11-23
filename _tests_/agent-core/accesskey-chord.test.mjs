import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { createScriptedAdapter } from '../../_tools_/agent-core/adapter-scripted.mjs'
import { createRunControl } from '../../_tools_/agent-core/control.mjs'
import { createFakeEnvironment } from '../../_tools_/agent-core/fake-env.mjs'
import { runTask } from '../../_tools_/agent-core/loop.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'
import { createSitePolicy } from '../../_tools_/agent-core/sites.mjs'
import { readRun } from '../../_tools_/agent-core/trajectory.mjs'

// CU-353 (cu-researcher's probe, 9 Nov): Control-Option-<key> fires the element whose accesskey is that key, not the
// focused one. The browser driver's keyTarget reports that element (marked accessKey); agent core judges the chord as a
// press on it - a Delete button asks delete, a CAPTCHA box hands off - and a chord no element answers stays a plain key.

const START = 'http://127.0.0.1:43117/tasks/demo/'
const ORIGIN = 'http://127.0.0.1:43117'
const policy = createPolicy({ sitePolicy: () => 'allow' })
const chord = (key) => ({ type: 'keypress', keys: ['CTRL', 'ALT', key] })
const judged = (verdict) => (verdict.decision === 'allow' ? 'allow' : verdict.class ?? verdict.rule)
const target = (role, name, extra = {}) => ({ tag: role === 'checkbox' ? 'input' : 'button', role, name, origin: ORIGIN, fingerprint: `fp-${name}`, ...extra })

test('CU-353 policy: an accesskey chord on the element it fires is a press - Delete asks delete, a CAPTCHA box hands off, Buy asks purchase; without the accessKey mark the same chord is a plain key', () => {
  const at = (t, action = chord('D')) => judged(policy.classify(action, { url: START, target: t }))
  assert.equal(at(target('button', 'Delete account', { accessKey: true })), 'delete')
  assert.equal(at(target('checkbox', 'Verify you are human', { accessKey: true }), chord('H')), 'captcha')
  assert.equal(at(target('button', 'Buy now', { accessKey: true }), chord('B')), 'purchase')
  // CU-365: a chord the accesskey does not fire still reaches the page's handlers - a page shortcut, asked once per chord.
  assert.equal(at(target('button', 'Delete account')), 'permission', 'the focus, not fired by the chord: a page shortcut (CU-365)')
  assert.equal(at(target('textbox', 'Search', { accessKey: true }), chord('S')), 'allow', 'an accesskey that only focuses an entry is no press of a named control')
})

async function run(actions, { keyTarget, focused }) {
  const dir = mkdtempSync(join(tmpdir(), 'cu-353-'))
  try {
    const control = createRunControl()
    const environment = createFakeEnvironment({ url: START, control })
    environment.focusedElement = async () => focused
    const asked = []
    if (keyTarget) environment.keyTarget = async (action) => { asked.push(action.keys.join('+')); return keyTarget(action) }
    const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions }, { final: 'done' }] })
    const result = await runTask({ task: 'tidy the account page', environment, model, sitePolicy: createSitePolicy({ startUrl: START }), control, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false } })
    const events = readRun(result.trajectoryDir).events.filter((e) => e.kind === 'action' && e.action?.type === 'keypress')
    return { events, asked, performed: environment.log.length }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('CU-353 loop: a keypress takes its target from the driver\'s keyTarget when there is one - the chord on Delete is asked and, unattended, never runs; a chord no element answers runs as a plain key', async () => {
  const del = target('button', 'Delete account', { accessKey: true })
  const field = { tag: 'input', role: 'textbox', name: 'Notes', origin: ORIGIN, fingerprint: 'fp-notes', editable: true }
  const fired = await run([chord('D')], { keyTarget: (action) => (action.keys.includes('D') ? del : field), focused: field })
  assert.deepEqual(fired.asked, ['CTRL+ALT+D'], 'the loop asked the driver for the chord\'s target')
  assert.deepEqual([fired.events[0].decision, fired.events[0].class], ['confirm', 'delete'])
  assert.equal(fired.performed, 0, 'unattended, the chord did not run')
  const plain = await run([chord('Q')], { keyTarget: () => field, focused: field })
  assert.deepEqual([plain.events[0].decision, plain.performed], ['allow', 1], 'no element answers Q: the focus, a plain key')
  const older = await run([chord('D')], { focused: field })
  assert.deepEqual([older.events[0].decision, older.asked], ['allow', []], 'an environment without keyTarget (the desktop, fakes): the focus, as before')
})

test('CU-353 loop (cu-developer-one): a keyTarget that throws falls back to the focus, as before CU-353 - the step is judged on it, never failed', async () => {
  const del = target('button', 'Delete account')
  const thrown = await run([{ type: 'keypress', keys: ['SPACE'] }], { keyTarget: () => { throw new Error('the frame detached') }, focused: del })
  assert.deepEqual([thrown.events[0].decision, thrown.events[0].class], ['confirm', 'delete'], 'Space on the focused Delete button: judged on the focus')
  assert.equal(thrown.performed, 0)
})
