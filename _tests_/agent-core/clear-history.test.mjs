import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-644 (cu-developer-one's go, 20 Nov 07:00Z): clearing a history asks delete, as 'Clear history' does.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name) => { const r = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://app.example/settings/privacy', target: { tag: 'button', role: 'button', name } }); return r.decision === 'allow' ? [] : (r.classes ?? [r.class]) }

const QUALIFIERS = ['search', 'browsing', 'chat', 'call', 'watch', 'viewing', 'location', 'order', 'recent', 'purchase', 'download']

test('CU-644: each qualifier reads as its twin \'Clear history\' (parity), with a possessive or determiner too', () => {
  assert.ok(click('Clear history').includes('delete'), 'the twin asks')
  for (const q of QUALIFIERS) {
    for (const name of [`Clear ${q} history`, `Clear your ${q} history`, `Clear all ${q} history`, `Clear my ${q} history`]) assert.ok(click(name).includes('delete'), name)
  }
  for (const name of ['Erase search history', 'Wipe browsing history', 'Clear the history', 'Clear recent history', 'CLEAR SEARCH HISTORY', 'Clear search history?']) assert.ok(click(name).includes('delete'), name)
})

test('CU-644 controls: naming, opening, pausing or toggling a history, and the transient clears, stay free', () => {
  for (const name of ['Search history', 'View history', 'Watch history', 'History', 'Browsing history settings', 'Pause watch history', 'Turn off search history',
    'Clear search', 'Clear filters', 'Clear cookies', 'Clear search box', 'Clear selection', 'Clear', 'View search history', 'Manage history']) assert.deepEqual(click(name), [], name)
})
