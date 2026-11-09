import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createAppPolicy } from '../../_tools_/agent-core/app-policy.mjs'
import { isBrowserApp } from '../../_tools_/agent-core/app-kinds.mjs'

// CU-302, D-089 (interim): on the desktop route an approved browser's page is one opaque area - an AXWebArea, or an
// AXScrollArea the helper marks opaque (cu-researcher's Q2: {role AXScrollArea, name null, opaque true}) - where no web
// consent rule can see what a click, key or drop does (a saved login autofilled on load, Buy, Delete, Send). Acting inside
// it is refused by name; the browser's own chrome stays judged; browser tasks go through the browser environment.

const CHROME = 'com.google.chrome.for.testing'
const SAFARI = 'com.apple.Safari'
const PREVIEW = 'com.apple.Preview'
const FIREFOX = 'org.mozilla.firefox'
const policy = createAppPolicy({ scope: [CHROME, SAFARI, PREVIEW, FIREFOX], preApprovals: [{ class: 'unknown_target', app: CHROME }] })
for (const app of [CHROME, SAFARI, PREVIEW, FIREFOX]) policy.grantScope(app, { approved: true, answeredBy: 'api' })
const click = { type: 'click', x: 10, y: 10, button: 'left' }
const verdict = (v) => (v.decision === 'allow' ? 'allow' : v.decision === 'block' ? `block:${v.rule}` : v.class)
const at = (app, action, target, extra = {}) => verdict(policy.classify(action, { frontmostBundleId: app, target: target ? { origin: app, fingerprint: 't', ...target } : null, ...extra }))
const page = { role: 'AXScrollArea', name: null, opaque: true }

test('D-089: a click, key, typing, hold or drag inside an approved browser\'s opaque page is refused - even with unknown_target pre-approved', () => {
  const actions = [click, { type: 'double_click', x: 10, y: 10, button: 'left' }, { type: 'keypress', keys: ['ENTER'] }, { type: 'keypress', keys: ['SPACE'] },
    { type: 'type', text: 'hello' }, { type: 'hold_key', keys: ['ENTER'], duration_ms: 200 }, { type: 'drag', path: [{ x: 10, y: 10 }, { x: 60, y: 10 }] }]
  for (const action of actions) assert.equal(at(CHROME, action, page), 'block:browser_web_content', `${action.type} in Chrome's page`)
  assert.equal(at(SAFARI, click, { role: 'AXWebArea', name: 'Sign in - Example' }), 'block:browser_web_content', 'Safari\'s web area, named or not')
  assert.equal(at(FIREFOX, { type: 'keypress', keys: ['ENTER'] }, { role: 'AXWebArea', name: null }), 'block:browser_web_content', 'Firefox\'s web area focused, Return')
  assert.equal(at(CHROME, { type: 'click', x: 10, y: 10, button: 'right' }, page), 'block:browser_web_content', 'a right click (its menu may submit too)')
  assert.equal(at(CHROME, { type: 'triple_click', x: 10, y: 10, button: 'left' }, page), 'block:browser_web_content', 'a triple click')
  assert.equal(at(CHROME, { type: 'keypress', keys: ['META', 'V'] }, page, { paste: { fromOwner: false, text: 'x' } }), 'block:browser_web_content', 'a keystroke paste while the page holds the focus')
  assert.equal(at(CHROME, { type: 'keypress', keys: ['TAB'] }, page), 'block:browser_web_content', 'any key while the page holds the focus - Tab moves inside the unseen page')
})

test('D-089: a drop or a menu paste into the page is refused too', () => {
  const drag = { type: 'drag', path: [{ x: 10, y: 10 }, { x: 300, y: 200 }] }
  assert.equal(at(CHROME, drag, { role: 'AXRow', name: 'report.pdf' }, { dropTarget: { origin: CHROME, ...page } }), 'block:browser_web_content', 'a file dropped onto the page')
  const pasteItem = { role: 'AXMenuItem', name: 'Paste' }
  assert.equal(at(CHROME, click, pasteItem, { paste: { fromOwner: false, destination: { origin: CHROME, ...page } } }), 'block:browser_web_content', 'Edit > Paste into the page')
})

test('D-089: the browser\'s own chrome, other apps\' opaque areas and named scroll areas keep their rules', () => {
  assert.equal(at(CHROME, click, { role: 'AXTextField', name: 'Address and search bar', editable: true }), 'allow', 'the address bar')
  assert.equal(at(CHROME, click, { role: 'AXRadioButton', name: 'New Tab' }), 'allow', 'a tab')
  assert.equal(at(CHROME, click, { role: 'AXScrollArea', name: 'Bookmarks', opaque: false }), 'allow', 'a described scroll area')
  assert.equal(at(PREVIEW, click, page), 'unknown_target', 'an opaque area in a non-browser app still asks, as before (R92)')
  assert.equal(at(CHROME, { type: 'scroll', x: 10, y: 10, scroll_x: 0, scroll_y: 5 }, null), 'allow', 'a scroll reads no target and submits nothing (named limit)')
})

test('D-089: browsers are known by exact bundle id, case-insensitively; look-alikes are not', () => {
  for (const id of ['com.google.Chrome', 'COM.GOOGLE.CHROME', 'com.microsoft.edgemac', 'org.mozilla.firefox', 'com.apple.Safari', 'company.thebrowser.Browser']) assert.equal(isBrowserApp(id), true, id)
  for (const id of ['com.google.Chrome.app.abcdef', 'com.apple.finder', 'com.google.Chromex', '', null]) assert.equal(isBrowserApp(id), false, String(id))
})
