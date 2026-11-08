import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPanelFolder } from '../../_tools_/agent-core/panel-folder.mjs'

// CU-139 (CU-48 A, D-058): the panel folder from the agent's own Go to Folder - arm, hold, check.

const HOME = '/Users/someone'
const FOLDERS = new Set(['/Users/someone/Reports', '/Users/someone/Reports 2024', '/Users/someone/Desktop', '/Users/someone/Library/LaunchAgents'])
const fs = { folder: (path) => (FOLDERS.has(path) ? path : null), displayName: (path) => path.split('/').pop() }
const goTo = { type: 'keypress', keys: ['META', 'SHIFT', 'G'] }
const ret = { type: 'keypress', keys: ['ENTER'] }
const shown = (shownFolderName, nameFieldFocused = true) => ({ shownFolderName, nameFieldFocused, name: 'report.txt' })
const SHEET = { target: { role: 'AXTextField', name: null }, panelKind: 'save' }

/** cmd-shift-G (shown name read then), a path, Return; then `between` actions; then the commit with the panel's shown name. */
function run({ path = '~/Reports', atGoTo = 'Desktop', between = [], atCommit = 'Reports' } = {}) {
  const panel = createPanelFolder({ fs, home: HOME })
  panel.observe(goTo, shown(atGoTo, false))
  panel.observe({ type: 'type', text: path }, shown(atGoTo, false))
  panel.observe(ret, shown(atGoTo, false), SHEET)
  for (const [action, selection] of between) panel.observe(action, selection)
  return { panel, result: panel.observe(ret, shown(atCommit), { commit: true }) }
}

test('arms from the agent\'s own Go to Folder and names the folder at the commit when the panel shows it', () => {
  const { result } = run({ between: [[{ type: 'type', text: 'report.txt' }, shown('Reports', true)]] })
  assert.deepEqual(result, { known: true, path: '/Users/someone/Reports', source: 'go_to_folder' })
  const inline = createPanelFolder({ fs, home: HOME })
  inline.observe(goTo, shown('Desktop', false))
  inline.observe({ type: 'type', text: '/Users/someone/Reports\n' }, shown('Desktop', false), SHEET)
  assert.equal(inline.state.phase, 'held', 'a path typed with its Return arms in one action')
})

test('the arming read: a panel already showing the target\'s name cannot prove the Go to Folder worked', () => {
  const { panel, result } = run({ atGoTo: 'Reports' })
  assert.equal(result, null, 'never armed, so the commit knows no folder')
  assert.equal(panel.state.phase, 'idle')
})

test('the check is equality: a different or merely prefixed shown name leaves the folder unknown', () => {
  assert.deepEqual(run({ atCommit: 'Reports 2024' }).result, { known: false, source: null, reason: 'shown_name_mismatch' }, 'a sibling Go to Folder completed to')
  assert.equal(run({ path: '~/Reports 2024', atCommit: 'Reports' }).result.known, false, 'a prefix is not equal')
  assert.equal(run({ atCommit: null }).result.known, false, 'an older helper gives no shown name: no check, unknown')
})

test('every other action drops the folder (the allow-list)', () => {
  const drops = [
    [{ type: 'click', x: 1, y: 1, button: 'left' }, shown('Reports', true)],
    [{ type: 'keypress', keys: ['META', 'D'] }, shown('Reports', true)],
    [{ type: 'keypress', keys: ['META', 'UP'] }, shown('Reports', true)],
    [{ type: 'keypress', keys: ['DOWN'] }, shown('Reports', true)],
    [{ type: 'scroll', x: 1, y: 1, scroll_x: 0, scroll_y: 3 }, shown('Reports', true)],
    [{ type: 'type', text: 'report.txt' }, shown('Reports', false)],
    [{ type: 'type', text: 'sub/report.txt' }, shown('Reports', true)],
    [{ type: 'type', text: '~/report.txt' }, shown('Reports', true)],
    [{ type: 'type', text: '.hidden' }, shown('Reports', true)],
  ]
  for (const step of drops) assert.equal(run({ between: [step] }).result, null, JSON.stringify(step[0]))
  const paused = createPanelFolder({ fs, home: HOME })
  paused.observe(goTo, shown('Desktop', false)); paused.observe({ type: 'type', text: '~/Reports' }, shown('Desktop', false)); paused.observe(ret, shown('Desktop', false), SHEET)
  paused.drop()
  assert.equal(paused.observe(ret, shown('Reports'), { commit: true }), null, 'a pause, take-over, consent wait or the panel closing drops it')
})

test('never arms on a secret, a relative path, a protected place, or a path that is not an existing folder', () => {
  for (const path of ['{{secret:dir}}', '~/Reports/../Desktop', '~/Library/LaunchAgents', '~/Nowhere', '']) {
    assert.equal(run({ path, atCommit: path.split('/').pop() }).result, null, path)
  }
})

test('a secret placeholder never arms, even where such a folder exists', () => {
  const odd = { folder: (path) => (path === '/Users/someone/{{secret:dir}}' ? path : null), displayName: (path) => path.split('/').pop() }
  const panel = createPanelFolder({ fs: odd, home: HOME })
  panel.observe(goTo, shown('Desktop', false))
  panel.observe({ type: 'type', text: '~/{{secret:dir}}' }, shown('Desktop', false))
  panel.observe(ret, shown('Desktop', false), SHEET)
  assert.equal(panel.state.phase, 'idle')
})

test('a protected place is refused before any stat, and a symlink into one is refused after it', () => {
  const statted = []
  const spy = { folder: (path) => { statted.push(path); return path === '/Users/someone/link' ? '/Users/someone/Library/LaunchAgents' : null }, displayName: (path) => path.split('/').pop() }
  const arm = (path) => {
    const panel = createPanelFolder({ fs: spy, home: HOME })
    panel.observe(goTo, shown('Desktop', false))
    panel.observe({ type: 'type', text: path }, shown('Desktop', false))
    panel.observe(ret, shown('Desktop', false), SHEET)
    return panel.state.phase
  }
  assert.equal(arm('~/Library/LaunchAgents'), 'idle')
  assert.deepEqual(statted, [], 'a protected place is never even statted')
  assert.equal(arm('~/link'), 'idle', 'the canonical folder is protected')
})

test('the Go to Folder Return navigates only on positive evidence the sheet\'s field has it (note 0.3.3 rows 11-14)', () => {
  const typedPanel = (path = '~/Reports') => {
    const panel = createPanelFolder({ fs, home: HOME })
    panel.observe(goTo, shown('Desktop', false))
    panel.observe({ type: 'type', text: path }, shown('Desktop', false))
    return panel
  }
  const sheetField = { role: 'AXTextField', name: null }
  // Row 12: save panel, the sheet's text field focused, the name field not: navigation.
  assert.equal(typedPanel().gotoReturnNavigates(ret, sheetField, shown('Desktop', false), 'save'), true)
  // Row 11: cmd-shift-G opened no sheet - focus in the browser, Return presses Save: a commit.
  assert.equal(typedPanel().gotoReturnNavigates(ret, { role: 'AXOutline', name: 'Files' }, shown('Desktop', false), 'save'), false)
  // Row 13: open panel (no name field, always false), browser focus, Return opens the selection: a commit.
  assert.equal(typedPanel().gotoReturnNavigates(ret, { role: 'AXBrowser', name: null }, shown('Desktop', false), 'open'), false)
  // Row 14: open panel, the sheet's field, but a FILE path - it may open at once: a commit.
  const files = { folder: () => null, displayName: (path) => path.split('/').pop() }
  const filePanel = createPanelFolder({ fs: files, home: HOME })
  filePanel.observe(goTo, shown('Desktop', false)); filePanel.observe({ type: 'type', text: '~/Reports/a.txt' }, shown('Desktop', false))
  assert.equal(filePanel.gotoReturnNavigates(ret, sheetField, shown('Desktop', false), 'open'), false)
  // A folder path in an open panel's sheet navigates.
  assert.equal(typedPanel().gotoReturnNavigates(ret, sheetField, shown('Desktop', false), 'open'), true)
  // Not the sheet: a search field; the name field focused (the path went into it); an older helper (null).
  assert.equal(typedPanel().gotoReturnNavigates(ret, { role: 'AXTextField', subrole: 'AXSearchField' }, shown('Desktop', false), 'save'), false)
  assert.equal(typedPanel().gotoReturnNavigates(ret, sheetField, shown('Desktop', true), 'save'), false)
  assert.equal(typedPanel().gotoReturnNavigates(ret, sheetField, { shownFolderName: null, nameFieldFocused: null }, 'save'), false)
  // Only right after cmd-shift-G and a typed path.
  assert.equal(createPanelFolder({ fs, home: HOME }).gotoReturnNavigates(ret, sheetField, shown('Desktop', false), 'save'), false)
})

test('arming needs the same positive evidence as navigation (cu-researcher): no sheet means no folder', () => {
  const browser = { target: { role: 'AXOutline', name: 'Files' }, panelKind: 'save' }
  const viaReturn = createPanelFolder({ fs, home: HOME })
  viaReturn.observe(goTo, shown('Desktop', false))
  viaReturn.observe({ type: 'type', text: '~/Reports' }, shown('Desktop', false), browser)
  viaReturn.observe(ret, shown('Desktop', false), browser)
  assert.equal(viaReturn.state.phase, 'idle', 'the path then Return in the browser - that Return was Save')
  const viaNewline = createPanelFolder({ fs, home: HOME })
  viaNewline.observe(goTo, shown('Desktop', false))
  viaNewline.observe({ type: 'type', text: '~/Reports\n' }, shown('Desktop', false), browser)
  assert.equal(viaNewline.state.phase, 'idle', 'a typed path with its newline in the browser')
  const nameField = createPanelFolder({ fs, home: HOME })
  nameField.observe(goTo, shown('Desktop', true))
  nameField.observe({ type: 'type', text: '~/Reports\n' }, shown('Desktop', true), SHEET)
  assert.equal(nameField.state.phase, 'idle', 'the name field focused: the path went into it')
})
