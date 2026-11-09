import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createAppPolicy } from '../../_tools_/agent-core/app-policy.mjs'

// CU-364 (High pending a live row): Command-D presses a save sheet's Don't Save whatever holds the focus; the focus may be
// the sheet or dialog itself, reported by role or subrole without the sheet flag. D-100: the real createAppPolicy, an
// approved app, and boundMenuItem {none: true} as the loop sends it for a chord that fires no menu item.
const FIXTURE = 'ai.reflection.cu.fixture'
const tmp = mkdtempSync(join(tmpdir(), 'cu-364-'))
after(() => rmSync(tmp, { recursive: true, force: true }))
const store = createAppApprovals({ path: join(tmp, 'a.json') })
store.grantAlways(FIXTURE, { by: 'api' })
const policy = createAppPolicy({ scope: [FIXTURE], approvals: store })
const chord = (keys, target) => {
  const r = policy.classify({ type: 'keypress', keys }, { frontmostBundleId: FIXTURE, url: `app:${FIXTURE}`, target: { origin: FIXTURE, ...target }, boundMenuItem: { none: true } })
  return r.decision === 'allow' ? 'allow' : r.class
}

test('CU-364: Command-D with the sheet or a dialog focused (by role or subrole, no sheet flag) asks delete', () => {
  assert.equal(chord(['META', 'D'], { role: 'AXSheet', name: '' }), 'delete')
  assert.equal(chord(['META', 'D'], { role: 'AXWindow', subrole: 'AXDialog', name: 'Save changes?' }), 'delete')
  assert.equal(chord(['META', 'SHIFT', 'D'], { role: 'AXSheet', name: '' }), 'delete')
  assert.equal(chord(['META', 'D'], { role: 'AXSheet', sheet: true }), 'delete', 'the flagged form, as before')
})

test('CU-364 negatives: Command-D in a plain window and other chords on a sheet stay as judged', () => {
  assert.equal(chord(['META', 'D'], { role: 'AXWindow', subrole: 'AXStandardWindow', name: 'Untitled' }), 'allow')
  assert.equal(chord(['META', 'A'], { role: 'AXSheet', name: '' }), 'allow')
})
