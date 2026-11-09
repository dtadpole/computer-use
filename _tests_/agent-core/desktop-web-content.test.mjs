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
  assert.equal(at(CHROME, click, { role: 'AXTextField', name: 'Address and search bar', editable: true, inWebArea: false }), 'allow', 'the address bar')
  assert.equal(at(CHROME, click, { role: 'AXRadioButton', name: 'New Tab', inWebArea: false }), 'allow', 'a tab')
  assert.equal(at(CHROME, click, { role: 'AXScrollArea', name: 'Bookmarks', opaque: false, inWebArea: false }), 'allow', 'a described scroll area')
  assert.equal(at(CHROME, click, { role: 'AXMenuItem', name: 'New Window', inWebArea: false }), 'allow', 'a menu item read as outside the page')
  assert.equal(at(PREVIEW, click, page), 'unknown_target', 'an opaque area in a non-browser app still asks, as before (R92)')
  assert.equal(at(CHROME, { type: 'scroll', x: 10, y: 10, scroll_x: 0, scroll_y: 5 }, null), 'allow', 'a scroll reads no target and submits nothing (named limit)')
})

test('D-089: browsers are known by exact bundle id, case-insensitively; look-alikes are not', () => {
  for (const id of ['com.google.Chrome', 'COM.GOOGLE.CHROME', 'com.microsoft.edgemac', 'org.mozilla.firefox', 'com.apple.Safari', 'company.thebrowser.Browser']) assert.equal(isBrowserApp(id), true, id)
  for (const id of ['com.google.Chrome.app.abcdef', 'com.apple.finder', 'com.google.Chromex', '', null]) assert.equal(isBrowserApp(id), false, String(id))
})

test('CU-322: inside a page the browser exposes (Safari; Chrome with AX on), the element is refused by its ancestry, never its name', () => {
  assert.equal(at(SAFARI, click, { role: 'AXButton', name: 'Sign in', inWebArea: true }), 'block:browser_web_content', 'Safari\'s Sign in button')
  assert.equal(at(SAFARI, { type: 'type', text: 'hello' }, { role: 'AXTextField', name: 'Search', editable: true, inWebArea: true }), 'block:browser_web_content', 'typing into a page field')
  assert.equal(at(CHROME, { type: 'keypress', keys: ['ENTER'] }, { role: 'AXTextField', name: 'Email', editable: true, inWebArea: true }), 'block:browser_web_content', 'Return in a page field')
  assert.equal(at(SAFARI, click, { role: 'AXLink', name: 'Continue', inWebArea: true }), 'block:browser_web_content', 'a link in the page')
})

test('CU-322 interim: a browser target with no inWebArea read fails closed - the address bar too - until the helper reports it', () => {
  assert.equal(at(SAFARI, click, { role: 'AXButton', name: 'Sign in' }), 'block:browser_web_content', 'an unread page button')
  assert.equal(at(CHROME, click, { role: 'AXTextField', name: 'Address and search bar', editable: true }), 'block:browser_web_content', 'the address bar, unread (over-block until the helper ships inWebArea)')
  assert.equal(at(SAFARI, click, { role: 'AXMenuItem', name: 'Sign in' }), 'block:browser_web_content', 'an unread menu item - a page\'s ARIA menuitem surfaces as AXMenuItem too')
  assert.equal(at(SAFARI, click, { role: 'AXToolbar', name: null }), 'block:browser_web_content', 'an unread toolbar - a page\'s ARIA toolbar surfaces as AXToolbar')
  assert.equal(at(PREVIEW, click, { role: 'AXButton', name: 'Rotate Left' }), 'allow', 'a non-browser app is not affected')
})

test('CU-322 (cu-researcher): no target read at all in an approved browser is the page too - keys go to its focus', () => {
  assert.equal(at(CHROME, click, null), 'block:browser_web_content', 'a click with no element read at the point')
  assert.equal(at(CHROME, { type: 'keypress', keys: ['ENTER'] }, null), 'block:browser_web_content', 'Return with no focused element read')
  assert.equal(at(CHROME, { type: 'type', text: 'x' }, null), 'block:browser_web_content', 'typing with no focused element read')
  const pasteItem = { role: 'AXMenuItem', name: 'Paste', inWebArea: false }
  assert.equal(at(CHROME, click, pasteItem, { paste: { fromOwner: false, destination: null } }), 'block:browser_web_content', 'a menu paste whose destination could not be read')
  assert.equal(at(PREVIEW, { type: 'keypress', keys: ['ENTER'] }, null), 'allow', 'outside a browser a null target keeps its rules')
})
