import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-265 (cu-researcher; cu-coordinator 13:37Z: ask): a link with a non-web scheme hands the click to another app.
const policy = createPolicy({ sitePolicy: () => 'allow', preApprovals: [{ class: 'permission' }] })
const judge = (action, linkScheme) => policy.classify(action, { url: 'https://fixture.example/', target: { role: 'link', name: 'Call us', linkScheme } })
const click = { type: 'click', x: 1, y: 1, button: 'left' }

test('CU-265: a click or Return on a facetime:, tel:, zoommtg:, mailto:, file: or app link asks permission, never pre-approved', () => {
  for (const scheme of ['facetime', 'tel', 'sms', 'zoommtg', 'mailto', 'file', 'vscode', 'x-apple.systempreferences', 'cu-unhandled-test', 'TEL', 'mailto:']) {
    const v = judge(click, scheme)
    assert.deepEqual([v.decision, v.class], ['confirm', 'permission'], scheme)
  }
  assert.equal(judge({ type: 'keypress', keys: ['ENTER'] }, 'tel').class, 'permission', 'Return on the focused link')
})

test('CU-265: web schemes and no reported scheme keep today\'s judgement', () => {
  for (const scheme of ['http', 'https', 'javascript', 'about', undefined, '']) assert.equal(judge(click, scheme).decision, 'allow', String(scheme))
  assert.equal(judge({ type: 'scroll', x: 1, y: 1, dy: 3 }, 'tel').decision, 'allow', 'a scroll over it')
})

test('CU-265 on the desktop: an AXLink whose scheme the macos-desktop driver reports (#76) asks permission too; https stays free', async () => {
  const { createAppPolicy } = await import('../../_tools_/agent-core/app-policy.mjs')
  const app = 'ai.reflection.cu.fixture'
  const desk = createAppPolicy({ scope: [app] })
  desk.grantScope(app, { approved: true, answeredBy: 'api' })
  const at = (linkScheme) => desk.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { frontmostBundleId: app, target: { origin: app, role: 'AXLink', name: 'Call Ann', fingerprint: 'l', linkScheme } })
  for (const scheme of ['facetime', 'tel', 'mailto']) assert.deepEqual([at(scheme).decision, at(scheme).class], ['confirm', 'permission'], scheme)
  assert.equal(at('https').decision, 'allow')
  assert.equal(at(null).decision, 'allow', 'no scheme reported keeps today\'s judgement')
})
