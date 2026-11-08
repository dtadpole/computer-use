import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { createScriptedAdapter } from '../../_tools_/agent-core/adapter-scripted.mjs'
import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createRunControl } from '../../_tools_/agent-core/control.mjs'
import { createFakeEnvironment } from '../../_tools_/agent-core/fake-env.mjs'
import { runTask } from '../../_tools_/agent-core/loop.mjs'
import { readRun } from '../../_tools_/agent-core/trajectory.mjs'

// CU-196 (cu-developer-two): a desktop Edit > Copy is a pointer action, so its context target is the menu item, and the
// copy's recorded source is the AXMenuItem 'Copy' - no class. A copy out of IBAN then pastes anywhere unasked (the
// copy-side twin of CU-186). Todo until the loop reads the focused field beside a menu copy. One run holds the copy and
// the paste (cu-verifier's method note), so CU-151's owner-board rule cannot decide the row.

const FIXTURE = 'ai.reflection.cu.fixture'
const frame = { width: 1440, height: 900 }
const MENU_COPY = { type: 'click', x: 10, y: 10, button: 'left' }
const PASTE = { type: 'keypress', keys: ['META', 'V'] }

async function desktop(sourceName) {
  const dir = mkdtempSync(join(tmpdir(), 'cu-menu-copy-'))
  try {
    const control = createRunControl()
    const environment = createFakeEnvironment({ kind: 'desktop', control })
    const copies = () => environment.log.filter((a) => a.type === 'click').length
    const withCount = (fields) => ({ origin: FIXTURE, ...fields, pasteboardChangeCount: 41 + copies() })
    // Before the copy the named field holds the focus; the paste lands in an unnamed entry.
    environment.focusedElement = async () => withCount(copies() === 0 ? { role: 'AXTextField', name: sourceName, fingerprint: 's' } : { role: 'AXTextField', name: '', fingerprint: 'u' })
    environment.inspectPoint = async () => withCount({ role: 'AXMenuItem', name: 'Copy', keyEquivalent: { char: 'C', modifiers: 0 }, fingerprint: 'c' })
    const store = createAppApprovals({ path: join(dir, 'a.json') })
    store.grantAlways(FIXTURE, { by: 'api' })
    const model = createScriptedAdapter({ frame, turns: [{ actions: [MENU_COPY, PASTE] }, { final: 'done' }] })
    const result = await runTask({ task: 'reply', environment, model, control, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false }, apps: [FIXTURE], appApprovals: store })
    const events = [...new Map(readRun(result.trajectoryDir).events.filter((e) => e.kind === 'action').map((e) => [`${e.step}:${e.index}`, e])).values()]
    return events[events.length - 1]
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('CU-196: Edit > Copy out of IBAN, then Command-V into an unnamed entry, asks sensitive_data', async () => {
  const paste = await desktop('IBAN')
  assert.deepEqual([paste.decision, paste.class], ['confirm', 'sensitive_data'])
})

test('CU-196 negative: the same Edit > Copy out of Notes pastes unasked (an own copy, proven by the count)', async () => {
  const paste = await desktop('Notes')
  assert.equal(paste.decision, 'allow')
})
