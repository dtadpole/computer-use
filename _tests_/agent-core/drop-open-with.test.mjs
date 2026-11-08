import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createAppPolicy } from '../../_tools_/agent-core/app-policy.mjs'

// CU-269 (cu-researcher): a file dropped onto an app's icon in Finder or the Dock is 'open with' that app.
const FINDER = 'com.apple.finder'
const tmp = mkdtempSync(join(tmpdir(), 'cu-269-'))
after(() => rmSync(tmp, { recursive: true, force: true }))
const store = createAppApprovals({ path: join(tmp, 'a.json') })
store.grantAlways(FINDER, { by: 'api' })
const policy = createAppPolicy({ scope: [FINDER], approvals: store, preApprovals: [{ class: 'launch_code' }, { class: 'unknown_target' }] })
const drag = { type: 'drag', path: [{ x: 10, y: 10 }, { x: 300, y: 200 }] }
const item = (name) => ({ origin: FINDER, role: 'AXImage', name, filename: name, fingerprint: 'f' })
const judge = (source, dropTarget) => policy.classify(drag, { frontmostBundleId: FINDER, target: source, dropTarget })

test('CU-269: a drop onto a terminal or code runner icon is refused; onto any other app icon asks launch_code, never pre-approved', () => {
  for (const name of ['Terminal.app', 'iTerm.app', 'Script Editor.app', 'Automator', 'Shortcuts.app/']) {
    const dropTarget = name.includes('.app') ? item(name) : { origin: 'com.apple.dock', role: 'AXDockItem', subrole: 'AXApplicationDockItem', name }
    const v = judge(item('install.command'), dropTarget)
    assert.deepEqual([v.decision, v.rule], ['block', 'excluded:terminal'], name)
  }
  for (const dropTarget of [item('TextEdit.app'), item('Preview.app'), { origin: 'com.apple.dock', role: 'AXDockItem', subrole: 'AXApplicationDockItem', name: 'Mail' }]) {
    const v = judge(item('notes.txt'), dropTarget)
    assert.deepEqual([v.decision, v.class, v.rule], ['confirm', 'launch_code', 'drop:open_with'], dropTarget.name)
  }
})

test('CU-269: a drop onto a folder, a document or empty space is judged as before', () => {
  for (const dropTarget of [item('Projects'), item('report.pdf'), { origin: FINDER, role: 'AXScrollArea', name: '' }, undefined]) {
    assert.equal(judge(item('notes.txt'), dropTarget).decision, 'allow', String(dropTarget?.name))
  }
})
