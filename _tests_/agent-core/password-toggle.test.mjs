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

// CU-194 (password-memory, #498): a 'Show password' toggle turns a password field into a plain, unnamed entry - the
// type flips, so the fingerprint changes; the drivers' fieldKey (outside the fingerprint) does not. The run must keep
// judging that entry as a password field. Todo until the loop remembers fieldKeys; the negative is a different key.

const START = 'http://127.0.0.1:43117/tasks/login/'
const ORIGIN = 'http://127.0.0.1:43117'
const frame = { width: 1440, height: 900 }
const CLICK = { type: 'click', x: 200, y: 200, button: 'left' }
const TYPE = { type: 'type', text: 'hunter2' }

async function browser(laterKey) {
  const dir = mkdtempSync(join(tmpdir(), 'cu-password-toggle-'))
  try {
    const control = createRunControl()
    const environment = createFakeEnvironment({ url: START, control })
    const clicks = () => environment.log.filter((a) => a.type === 'click').length
    // First seen as a password field; after the toggle click, the same node is a plain entry with no name.
    const seen = { tag: 'input', role: 'textbox', name: '', editable: true, isPassword: true, inputType: 'password', origin: ORIGIN, fingerprint: 'p1', fieldKey: 'node-7' }
    const shown = { tag: 'input', role: 'textbox', name: '', editable: true, isPassword: false, inputType: 'text', origin: ORIGIN, fingerprint: 'p2', fieldKey: laterKey }
    environment.focusedElement = async () => (clicks() === 0 ? seen : shown)
    environment.inspectPoint = async () => (clicks() === 0 ? seen : shown)
    const model = createScriptedAdapter({ frame, turns: [{ actions: [CLICK, TYPE] }, { final: 'done' }] })
    const result = await runTask({ task: 'sign in', environment, model, sitePolicy: createSitePolicy({ startUrl: START }), control, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false } })
    return readRun(result.trajectoryDir).events.filter((e) => e.kind === 'action').pop()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('CU-194: typing into a password field shown in plain text (same fieldKey) asks credential', async () => {
  const typed = await browser('node-7')
  assert.deepEqual([typed.decision, typed.class], ['confirm', 'credential'])
})

test('CU-194 negative: a different entry (another fieldKey) with no name takes the text unasked', async () => {
  const typed = await browser('node-9')
  assert.equal(typed.decision, 'allow')
})
