import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { createScriptedAdapter } from '../../_tools_/agent-core/adapter-scripted.mjs'
import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createRunControl } from '../../_tools_/agent-core/control.mjs'
import { runTask } from '../../_tools_/agent-core/loop.mjs'
import { fakeLauncher, logged, scratchLocks, stopFake } from './harness.mjs'

/**
 * CU-48's A across the real seam (panel-folder-source.md 0.3.4): agent core's loop over the real driver and the fake
 * helper, so the panel's shown folder name, the name field's focus and the focused element's role and subrole reach
 * agent core through #309's panelSelection and the driver's #describe - not through agent core's own stand-in, whose
 * field names are whatever agent core reads. A rename on either side would pass every stand-in test while the folder
 * silently never arms; here it fails.
 *
 * The fake's `phases` play the panel's reactions: after each input it takes, the focus and the panel move as AppKit's
 * would. A declined action posts nothing, so the world stays where it was. No controller: the run is unattended,
 * so each file_choice question is declined at once (and recorded), as D-047 wants.
 */

const FIXTURE = 'ai.reflection.cu.fixture'
const locks = scratchLocks()
const dir = mkdtempSync(join(tmpdir(), 'cu-pf-seam-'))
after(() => { locks.remove(); rmSync(dir, { recursive: true, force: true }) })
const launchOnFake = fakeLauncher(locks, { apps: [FIXTURE] })

// The folder Go to Folder goes to: a real one, since agent core checks it exists by one stat of its canonical path.
mkdirSync(join(dir, 'Reports'))
const REPORTS = realpathSync(join(dir, 'Reports'))

const at = (frame) => ({ x: frame.x + Math.round(frame.width / 2), y: frame.y + Math.round(frame.height / 2) })
const NAME_FIELD = { role: 'AXTextField', subrole: null, title: 'Save As:', frame: { x: 100, y: 60, width: 300, height: 24 }, secure: false, editable: true, panel: 'save' }
const GO_FIELD = { role: 'AXTextField', subrole: null, title: 'Go to the folder:', frame: { x: 120, y: 120, width: 360, height: 24 }, secure: false, editable: true, panel: 'save' }
const BROWSER = { role: 'AXOutline', subrole: null, title: null, frame: { x: 20, y: 160, width: 560, height: 300 }, secure: false, panel: 'save' }
const SEARCH = { role: 'AXTextField', subrole: 'AXSearchField', title: 'Search', frame: { x: 600, y: 20, width: 180, height: 24 }, secure: false, editable: true, panel: 'save' }
const SAVE = { role: 'AXButton', subrole: null, title: 'Save', frame: { x: 480, y: 500, width: 80, height: 28 }, secure: false, panel: 'save' }
const own = (element) => ({ bundleId: FIXTURE, pid: 601, ...element })

function world({ phases, focused = own(NAME_FIELD), panelSelection }) {
  return {
    displays: [{ id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 800, height: 600 }, scale: 1 }],
    apps: [{ bundleId: FIXTURE, pid: 601, title: 'Fixture', rect: { x: 0, y: 0, width: 800, height: 600 } }],
    frontmost: FIXTURE,
    elements: [NAME_FIELD, GO_FIELD, BROWSER, SEARCH, SAVE].map((element) => ({ rect: element.frame, element: own(element) })),
    focused,
    panelSelection,
    phases,
  }
}

let runs = 0
async function runOnFake(config, actions) {
  const control = createRunControl()
  const { env, child } = await launchOnFake(config, { control })
  await logged(child, 3)
  const requests = []
  control.subscribe((event) => { if (event.type === 'consent_request' && event.request.class === 'file_choice') requests.push(event.request) })
  try {
    const store = createAppApprovals({ path: join(dir, `approvals-${runs += 1}.json`) })
    store.grantAlways(FIXTURE, { by: 'api' })
    const model = createScriptedAdapter({ frame: { width: env.frame.width, height: env.frame.height }, turns: [...actions.map((action) => ({ actions: [action] })), { final: 'done' }] })
    const result = await runTask({ task: 'save the report', environment: env, model, control, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false }, apps: [FIXTURE], appApprovals: store })
    const events = readFileSync(join(result.trajectoryDir, 'events.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line))
    return { requests, actions: events.filter((e) => e.kind === 'action' && e.status !== 'attempted') }
  } finally {
    await env.close()
    await stopFake(child)
  }
}

const GO_TO = { type: 'keypress', keys: ['META', 'SHIFT', 'G'] }
const RETURN = { type: 'keypress', keys: ['RETURN'] }

test('CU-48 seam: Go to Folder, its Return, a name, then Save - asked once, naming the canonical folder, folderSource go_to_folder', async () => {
  const config = world({
    panelSelection: { path: null, directory: null, name: 'Untitled', shownFolderName: 'Desktop', nameFieldFocused: true },
    phases: [
      // cmd-shift-G taken: the Go to Folder sheet has focus; the panel still shows Desktop.
      { afterInputs: 1, focused: own(GO_FIELD), panelSelection: { path: null, directory: null, name: 'Untitled', shownFolderName: 'Desktop', nameFieldFocused: false } },
      // The sheet's Return taken: the panel moved to Reports, focus back in the name field.
      { afterInputs: 3, focused: own(NAME_FIELD), panelSelection: { path: null, directory: null, name: 'Untitled', shownFolderName: 'Reports', nameFieldFocused: true } },
      { afterInputs: 4, panelSelection: { path: null, directory: null, name: 'report.txt', shownFolderName: 'Reports', nameFieldFocused: true } },
    ],
  })
  const { requests, actions } = await runOnFake(config, [GO_TO, { type: 'type', text: REPORTS }, RETURN, { type: 'type', text: 'report.txt' }, { type: 'click', button: 'left', ...at(SAVE.frame) }])
  // The loop records keys normalised: Return is ENTER.
  const goReturn = actions.find((e) => e.action?.type === 'keypress' && e.action.keys?.includes('ENTER'))
  const seen = JSON.stringify(actions.map((e) => [e.action?.type, e.action?.keys ?? e.action?.text?.slice(-12), e.decision, e.rule, e.target?.role, e.target?.subrole, e.status]))
  assert.equal(goReturn?.rule, 'panel:go_to_folder', `the Go to Folder Return is a navigation, not asked: ${seen} requests ${JSON.stringify(requests.map((r) => [r.path ?? null, r.folderKnown, r.folderSource ?? null]))}`)
  assert.equal(requests.length, 1, `one file_choice question, at Save: ${JSON.stringify(requests.map((r) => r.path ?? null))}`)
  assert.deepEqual([requests[0].path, requests[0].folderSource, requests[0].folderKnown], [`${REPORTS}/report.txt`, 'go_to_folder', true])
})

test('CU-48 seam: the path typed into the browser (no sheet) - its Return is asked and Save does not know the folder', async () => {
  const config = world({
    panelSelection: { path: null, directory: null, name: 'Untitled', shownFolderName: 'Desktop', nameFieldFocused: true },
    // cmd-shift-G opened no sheet: focus went to the browser, where the typed path is type-select.
    phases: [{ afterInputs: 1, focused: own(BROWSER), panelSelection: { path: null, directory: null, name: 'Untitled', shownFolderName: 'Desktop', nameFieldFocused: false } }],
  })
  const { requests } = await runOnFake(config, [GO_TO, { type: 'type', text: REPORTS }, RETURN, { type: 'click', button: 'left', ...at(SAVE.frame) }])
  assert.equal(requests.length, 2, 'the browser Return (it would press Save) and the Save click are both asked')
  for (const request of requests) assert.equal(request.folderSource, undefined, 'nothing armed without the sheet\'s evidence')
  assert.equal(requests[1].folderKnown, false, 'the folder stays unknown at Save')
})

test('CU-48 seam: the path typed into the panel\'s search field - the subrole reaches agent core, so its Return is asked and nothing arms', async () => {
  const config = world({
    panelSelection: { path: null, directory: null, name: 'Untitled', shownFolderName: 'Desktop', nameFieldFocused: true },
    // Focus in the search field: a text input, but its subrole (AXSearchField, through the driver's #describe) rules it out.
    phases: [{ afterInputs: 1, focused: own(SEARCH), panelSelection: { path: null, directory: null, name: 'Untitled', shownFolderName: 'Desktop', nameFieldFocused: false } }],
  })
  const { requests, actions } = await runOnFake(config, [GO_TO, { type: 'type', text: REPORTS }, RETURN, { type: 'click', button: 'left', ...at(SAVE.frame) }])
  const searchReturn = actions.find((e) => e.action?.type === 'keypress' && e.action.keys?.includes('ENTER'))
  // The trajectory keeps a reduced target (origin, role, name), so the subrole is proved by what it decides: a driver
  // that dropped it would make the search field look like the Go to Folder sheet, and this Return would not be asked.
  assert.deepEqual([searchReturn?.target?.role, searchReturn?.decision, searchReturn?.rule], ['AXTextField', 'confirm', 'panel:file_choice'], 'the search field\'s Return is asked')
  assert.equal(requests.length, 2, 'the search field\'s Return and the Save click are both asked')
  for (const request of requests) assert.equal(request.folderSource, undefined, 'nothing armed')
})
