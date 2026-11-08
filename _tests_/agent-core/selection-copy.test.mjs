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

// CU-187, driver to policy: a person-visible value on a profile page (static text, nothing focused) is selected and
// copied, then pasted into an unnamed entry. focusedElement() is null at the copy (body has the focus), so the copy's
// source can only come from environment.selectionSource() (#461: role, tag, origin, caption - never a name). Todo until
// the loop reads it and the policy classes the caption.

const START = 'http://127.0.0.1:43117/tasks/profile/'
const ORIGIN = 'http://127.0.0.1:43117'
const frame = { width: 1440, height: 900 }
const COPY = { type: 'keypress', keys: ['CTRL', 'C'] }
const PASTE = { type: 'keypress', keys: ['CTRL', 'V'] }
const copied = (log) => log.some((a) => a.type === 'keypress' && a.keys?.includes('C'))

async function browser(caption) {
  const dir = mkdtempSync(join(tmpdir(), 'cu-selection-copy-'))
  try {
    const control = createRunControl()
    const environment = createFakeEnvironment({ url: START, control })
    // The run buffer holds the value only after the copy, as a real copy writes it.
    environment.clipboard = { get: () => (copied(environment.log) ? 'X1234567' : '') }
    environment.focusedElement = async () => (copied(environment.log) ? { tag: 'input', role: 'textbox', name: '', editable: true, origin: ORIGIN, fingerprint: 'u' } : null)
    environment.selectionSource = async () => (copied(environment.log) ? null : { role: 'cell', tag: 'td', origin: ORIGIN, caption })
    const model = createScriptedAdapter({ frame, turns: [{ actions: [COPY, PASTE] }, { final: 'done' }] })
    const result = await runTask({ task: 'copy the value into the form', environment, model, sitePolicy: createSitePolicy({ startUrl: START }), control, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false } })
    return readRun(result.trajectoryDir).events.filter((e) => e.kind === 'action').pop()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('CU-187: a selected value captioned Passport number, copied and pasted into an unnamed entry, asks sensitive_data', async () => {
  const paste = await browser('Passport number')
  assert.deepEqual([paste.decision, paste.class], ['confirm', 'sensitive_data'])
})

test('CU-187 negative: the same copy captioned Notes pastes unasked', async () => {
  const paste = await browser('Notes')
  assert.equal(paste.decision, 'allow')
})
