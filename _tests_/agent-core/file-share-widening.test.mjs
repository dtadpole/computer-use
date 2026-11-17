import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-425: widening what others may do with a file asks permission; narrowing and plain views stay as they were.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name, extra = {}) => { const r = policy.classify({ type: 'click', x: 5, y: 5, button: 'left' }, { url: 'https://drive.example/file/d/abc/view', target: { tag: 'button', role: 'button', name, ...extra } }); return r.decision === 'allow' ? 'allow' : r.class }

test('CU-425: moving into a shared drive, letting viewers download / print / copy and letting others edit ask permission', () => {
  for (const name of ['Move to shared drive', 'Move to Shared Drive', 'Move into a shared folder', 'Allow downloads', 'Allow downloading', 'Allow viewers to download', 'Allow printing and copying',
    'Enable downloads', 'Let others edit', 'Enable editing for others']) assert.equal(click(name), 'permission', name)
  assert.equal(click('Allow editing', { dialogName: 'Link settings' }), 'permission')
  // r2 (cu-developer-three): Drive's declarative checkbox, turned on; Dropbox's team folder and the old Team Drive.
  const box = { tag: 'input', inputType: 'checkbox', role: 'checkbox' }
  assert.equal(click('Viewers and commenters can see the option to download, print, and copy', { ...box, checked: false }), 'permission')
  assert.equal(click('Viewers can download, print and copy', { ...box, checked: false }), 'permission')
  assert.equal(click('Viewers and commenters can see the option to download, print, and copy', { ...box, checked: true }), 'allow')
  // r2 (cu-developer-one): the settings dialog's wording, two nouns and a verb list.
  assert.equal(click('Allow viewers and commenters to download, print, and copy', { ...box, checked: false }), 'permission')
  assert.equal(click('Allow viewers and commenters to see the option to download, print and copy', { ...box, checked: false }), 'permission')
  assert.equal(click('Allow viewers and commenters to download, print, and copy', { ...box, checked: true }), 'allow')
  for (const name of ['Move to team folder', 'Move to Team Drive', 'Move to the team folder']) assert.equal(click(name), 'permission', name)
})

test('CU-425 negatives: narrowing, a bare Allow editing outside a share dialog, and views stay as they were', () => {
  for (const name of ['Allow editing', 'Download', 'Move to My Drive', 'Move to folder', 'Shared drives', 'Restrict downloads', 'Print', 'Copy link', 'Downloads folder', 'Move to My Drive', 'Team folders', 'Viewers can comment']) assert.equal(click(name), 'allow', name)
})
