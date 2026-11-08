import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { createScriptedAdapter } from '../../_tools_/agent-core/adapter-scripted.mjs'
import { createRunControl } from '../../_tools_/agent-core/control.mjs'
import { createFakeEnvironment } from '../../_tools_/agent-core/fake-env.mjs'
import { runTask } from '../../_tools_/agent-core/loop.mjs'
import { createSitePolicy } from '../../_tools_/agent-core/sites.mjs'
import { readRun } from '../../_tools_/agent-core/trajectory.mjs'

// CU-144: a browser types a tab as a real Tab key (input-plan.mjs planType), so a typed tab is split and the space after
// it judged on the settled focus there too - keyboard-activation.md's rule is not desktop-only.

const START = 'http://127.0.0.1:43117/tasks/demo/'
const ORIGIN = 'http://127.0.0.1:43117'
const textbox = (name) => ({ tag: 'input', role: 'textbox', name, origin: ORIGIN, fingerprint: `fp-${name}` })
const button = (name) => ({ tag: 'button', role: 'button', name, origin: ORIGIN, fingerprint: `fp-${name}` })

async function run(actions, reads) {
  const dir = mkdtempSync(join(tmpdir(), 'cu-browser-tab-'))
  try {
    const control = createRunControl()
    const environment = createFakeEnvironment({ url: START, control })
    let i = 0
    environment.focusedElement = async () => reads[Math.min(i++, reads.length - 1)]
    const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions }, { final: 'done' }] })
    const result = await runTask({ task: 'fill the form', environment, model, sitePolicy: createSitePolicy({ startUrl: START }), control, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false } })
    const events = readRun(result.trajectoryDir).events.filter((e) => e.kind === 'action' && ['type', 'keypress'].includes(e.action?.type))
    return { events, performed: environment.log.length }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('in a browser, a typed tab then a space onto Delete is asked on the settled focus; unattended the space never runs', async () => {
  const name = textbox('Name')
  const { events, performed } = await run([{ type: 'type', text: 'x\t ' }], [name, name, name, button('Delete')])
  // A browser action event records no target; the decision and class show what the space was judged on.
  const space = events.find((e) => e.action.type === 'type' && e.action.text === ' ')
  assert.deepEqual([space.decision, space.class], ['confirm', 'delete'])
  assert.equal(performed, 2, 'the x and the tab ran, the space did not')
})

test('in a browser, a tab between text fields is typing - every part runs, nothing asked', async () => {
  const { events, performed } = await run([{ type: 'type', text: 'John\tDoe' }], [textbox('First'), textbox('First'), textbox('Last')])
  assert.equal(events.every((e) => e.decision === 'allow'), true)
  assert.equal(performed, 3)
})

test('in a browser, Tab then Space keypresses in one batch are judged on the settled focus', async () => {
  const name = textbox('Name')
  const { events, performed } = await run([{ type: 'keypress', keys: ['TAB'] }, { type: 'keypress', keys: ['SPACE'] }], [name, name, button('Delete')])
  const space = events.find((e) => e.action.keys?.includes('SPACE'))
  assert.deepEqual([space.decision, space.class], ['confirm', 'delete'])
  assert.equal(performed, 1)
})
