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

// CU-192 (red team of CU-186): a toolbar or popover 'Paste' button pastes the pasteboard as Command-V does, but the loop
// recognises a paste only as a chord or a menu item, so the paste checks never run. Todo until the fix: a click on a
// control named exactly 'Paste' (or 'Paste and Match Style') is a paste. The same harness as paste-consent.test.mjs.

const FIXTURE = 'ai.reflection.cu.fixture'
const frame = { width: 1440, height: 900 }
const copies = (log) => log.filter((a) => a.type === 'keypress' && a.keys.includes('META') && (a.keys.includes('C') || a.keys.includes('X'))).length
const CLICK = { type: 'click', x: 10, y: 10, button: 'left' }
const COPY = { type: 'keypress', keys: ['META', 'C'] }

async function desktop(actions, count, button) {
  const dir = mkdtempSync(join(tmpdir(), 'cu-toolbar-paste-'))
  try {
    const control = createRunControl()
    const environment = createFakeEnvironment({ kind: 'desktop', control })
    const withCount = (fields) => ({ origin: FIXTURE, ...fields, pasteboardChangeCount: count(environment.log) })
    environment.focusedElement = async () => withCount({ role: 'AXTextField', name: 'Message', fingerprint: 'm' })
    environment.inspectPoint = async () => withCount(button)
    const store = createAppApprovals({ path: join(dir, 'a.json') })
    store.grantAlways(FIXTURE, { by: 'api' })
    const model = createScriptedAdapter({ frame, turns: [{ actions }, { final: 'done' }] })
    const result = await runTask({ task: 'reply', environment, model, control, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false }, apps: [FIXTURE], appApprovals: store })
    const events = [...new Map(readRun(result.trajectoryDir).events.filter((e) => e.kind === 'action').map((e) => [`${e.step}:${e.index}`, e])).values()]
    return events[events.length - 1]
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const TOOLBAR_PASTE = { role: 'AXButton', subrole: 'AXToolbarButton', name: 'Paste', fingerprint: 'tb' }

test('CU-192: a toolbar Paste button with no copy of the run\'s own asks - the owner\'s pasteboard', async () => {
  const paste = await desktop([CLICK], () => 41, TOOLBAR_PASTE)
  assert.deepEqual([paste.decision, paste.class], ['confirm', 'sensitive_data'])
})

test('CU-192: a popover Paste and Match Style item asks the same', async () => {
  const paste = await desktop([CLICK], () => 41, { role: 'AXButton', name: 'Paste and Match Style', fingerprint: 'pm' })
  assert.deepEqual([paste.decision, paste.class], ['confirm', 'sensitive_data'])
})

test('CU-192 negative: after the run\'s own copy (count rose by it) the toolbar paste into Message is allowed, as Command-V is', async () => {
  const paste = await desktop([COPY, CLICK], (log) => 41 + copies(log), TOOLBAR_PASTE)
  assert.equal(paste.decision, 'allow')
})

test('CU-192 negative: a button that only mentions paste ("Paste link here") is not a paste', async () => {
  const paste = await desktop([CLICK], () => 41, { role: 'AXButton', name: 'Paste link here', fingerprint: 'pl' })
  assert.equal(paste.decision, 'allow')
})
