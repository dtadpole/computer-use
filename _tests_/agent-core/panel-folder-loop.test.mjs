import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'

import { createScriptedAdapter } from '../../_tools_/agent-core/adapter-scripted.mjs'
import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createRunControl } from '../../_tools_/agent-core/control.mjs'
import { createFakeEnvironment } from '../../_tools_/agent-core/fake-env.mjs'
import { runTask } from '../../_tools_/agent-core/loop.mjs'

// CU-139 through the loop (panel-folder-source.md 0.3.3): cmd-shift-G, a typed path, the sheet's Return (navigation, not
// asked), a plain name, Save - asked once, naming the folder the agent itself set, when the panel shows it.

const FIXTURE = 'ai.reflection.cu.fixture'
const frame = { width: 1440, height: 900 }
let dir
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'cu-panel-folder-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

async function saveThroughGoTo({ shownAtCommit = 'Reports', pauseBeforeName = false, waits = false } = {}) {
  const reports = join(dir, 'Reports')
  mkdirSync(reports)
  const control = createRunControl()
  const environment = createFakeEnvironment({ kind: 'desktop', control })
  const nameField = { origin: FIXTURE, role: 'AXTextField', name: 'Save As:', panel: 'save', fingerprint: 'name' }
  const sheetField = { origin: FIXTURE, role: 'AXTextField', name: null, panel: 'save', fingerprint: 'goto' }
  const focus = [nameField, sheetField, sheetField, nameField]
  environment.focusedElement = async () => {
    // The fourth read is for the plain name, right after the Go to Folder Return: a person pausing there (D5).
    if (pauseBeforeName && focus.length === 1) { control.send('pause', { source: 'api' }); control.send('resume', { source: 'api' }) }
    return focus.shift() ?? nameField
  }
  environment.inspectPoint = async () => ({ origin: FIXTURE, role: 'AXButton', name: 'Save', panel: 'save', fingerprint: 'save' })
  const reads = [
    { shownFolderName: 'Desktop', nameFieldFocused: true, name: 'Untitled' },
    { shownFolderName: 'Desktop', nameFieldFocused: false, name: 'Untitled' },
    { shownFolderName: 'Desktop', nameFieldFocused: false, name: 'Untitled' },
    { shownFolderName: 'Reports', nameFieldFocused: true, name: '' },
  ]
  environment.panelSelection = async () => reads.shift() ?? { shownFolderName: shownAtCommit, nameFieldFocused: true, name: 'report.txt' }
  const requests = []
  control.subscribe((event) => {
    if (event.type !== 'consent_request') return
    requests.push(event.request)
    control.answer?.(event.request.id, { approved: false, lifetime: 'once' })
  })
  const store = createAppApprovals({ path: join(dir, 'app-approvals.json') })
  store.grantAlways(FIXTURE, { by: 'api' })
  // cu-verifier's live sequence (0.2.40) puts a wait between each Go to Folder step; a wait sends no input.
  const pause = waits ? [{ type: 'wait', duration_ms: 0 }] : []
  const model = createScriptedAdapter({ frame, turns: [{ actions: [
    { type: 'keypress', keys: ['META', 'SHIFT', 'G'] },
    ...pause,
    { type: 'type', text: reports },
    ...pause,
    { type: 'keypress', keys: ['ENTER'] },
    ...pause,
    { type: 'type', text: 'report.txt' },
    { type: 'click', x: 600, y: 500, button: 'left' },
  ] },
  // CU-274: a pause voids the rest of its batch; the model plans the name and the Save again on a fresh screenshot.
  ...(pauseBeforeName ? [{ actions: [{ type: 'type', text: 'report.txt' }, { type: 'click', x: 600, y: 500, button: 'left' }] }] : []),
  { final: 'done\nOUTCOME: not_done' }] })
  await runTask({ task: 'save the report', environment, model, control, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false }, apps: [FIXTURE], appApprovals: store })
  return { reports, choices: requests.filter((r) => r.class === 'file_choice') }
}

test('Save after the agent\'s own Go to Folder is asked once, naming that folder; the Go to Folder Return is not asked', async () => {
  const { reports, choices } = await saveThroughGoTo()
  assert.equal(choices.length, 1, 'only the Save - the sheet\'s Return navigated')
  // Canonical, symlinks resolved (the temp folder is under a symlink on macOS).
  assert.deepEqual([choices[0].folderKnown, choices[0].path, choices[0].folderSource], [true, join(realpathSync(reports), 'report.txt'), 'go_to_folder'])
})

test('a panel not showing that folder at the Save leaves it unknown', async () => {
  const { choices } = await saveThroughGoTo({ shownAtCommit: 'Desktop' })
  assert.equal(choices.length, 1)
  assert.deepEqual([choices[0].folderKnown, choices[0].path, choices[0].folderSource], [false, undefined, undefined])
})

test('a pause after the Go to Folder drops the folder: the Save is asked with it unknown (D5)', async () => {
  const { choices } = await saveThroughGoTo({ pauseBeforeName: true })
  assert.equal(choices.length, 1)
  assert.equal(choices[0].folderKnown, false)
})

test('waits between cmd-shift-G, the path and the Return keep the Go to Folder state: the Save is asked once, naming the folder (CU-139 reopened live)', async () => {
  const { reports, choices } = await saveThroughGoTo({ waits: true })
  assert.equal(choices.length, 1, 'only the Save - the sheet\'s Return still navigated after the waits')
  assert.deepEqual([choices[0].folderKnown, choices[0].path, choices[0].folderSource], [true, join(realpathSync(reports), 'report.txt'), 'go_to_folder'])
})
