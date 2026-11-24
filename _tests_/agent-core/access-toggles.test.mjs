import assert from 'node:assert/strict'
import { test } from 'node:test'

import { accessRowContext, createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-754 (High): an access toggle - its list names a privacy right, or its own name makes something public - asks permission
// when it turns on. CU-757 (P1): 'Allow' / 'Grant' / 'Give access' (and localized) in a dialog that states access asks
// permission. Both sides of each rule (D-099), click and Space.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const verdict = (v) => (v.decision === 'allow' ? 'allow' : (v.classes ?? [v.class]).join('+'))
const press = (url, target, extra = {}, action = { type: 'click', x: 1, y: 1, button: 'left' }) => verdict(policy.classify(action, { url, target, ...extra }))
const SETTINGS = 'com.apple.systempreferences'
const axcb = (name, checked, rowContext) => press(`desktop://${SETTINGS}`, { role: 'AXCheckBox', name, checked, inWebArea: false, origin: SETTINGS, ...(rowContext !== undefined ? { rowContext } : {}) }, { frontmostBundleId: SETTINGS })
const sw = (name, checked, extra = {}) => press('https://social.example/settings', { role: 'switch', tag: 'button', name, checked, ...extra })
const webcb = (name, checked, extra = {}) => press('https://social.example/settings', { role: 'checkbox', tag: 'input', inputType: 'checkbox', name, checked, ...extra })
const space = (name, checked) => press('https://social.example/settings', { role: 'switch', tag: 'button', name, checked }, {}, { type: 'keypress', keys: ['SPACE'] })
const web = (name, dialogName, dialogDescription = '') => press('https://console.example/settings', { role: 'button', tag: 'button', name, dialogName, dialogDescription })
const desk = (app, name, dialogName, dialogDescription = '') => press(`desktop://${app}`, { role: 'AXButton', name, inWebArea: false, origin: app, dialogName, dialogDescription }, { frontmostBundleId: app })

test('CU-754: a toggle turned on in a list named for a privacy right asks permission', () => {
  assert.equal(axcb('Terminal', false, 'Full Disk Access'), 'permission')
  for (const list of ['Screen & System Audio Recording', 'Screen Recording', 'Input Monitoring', 'Accessibility', 'Camera', 'Microphone', 'Location Services', 'Files and Folders', 'Automation', 'App Management']) {
    assert.match(axcb('Example Helper', false, list), /permission/, list)
  }
  // The web driver's shape ({ list, hints }) and a hint that states the grant.
  assert.match(webcb('Example App', false, { rowContext: { list: 'Apps with camera access', hints: [] } }), /permission/)
  assert.match(axcb('Example App', false, { list: 'Privacy', hints: ['Allow the applications below to control'] }), /permission/)
})

test('CU-754: a toggle whose name makes something public asks permission', () => {
  for (const name of ['Public profile', 'Public', 'Make profile public', 'Public account', 'Visible to everyone', 'Discoverable', 'Show my profile to everyone']) {
    assert.match(sw(name, false), /permission/, name)
    assert.match(space(name, false), /permission/, `Space: ${name}`)
  }
})

test('CU-754: the other side - turning access off, plain toggles and harmless lists stay free', () => {
  // A native read that says the toggle is on: the press turns it off (revokes), so no grant.
  assert.equal(axcb('Terminal', true, 'Full Disk Access'), 'allow')
  assert.equal(webcb('Public profile', true), 'allow')
  for (const [name, checked] of [['Dark mode', false], ['Show previews', true], ['Public holidays', false], ['Show public posts first', false]]) assert.equal(sw(name, checked), 'allow', name)
  assert.equal(axcb('Show battery percentage', false), 'allow')
  for (const list of ['Display', 'Battery', 'Accessibility Shortcut options']) assert.equal(axcb('Reduce motion', false, list), 'allow', list)
})

test('CU-774: a toggle that makes the profile findable or indexable asks permission', () => {
  const findable = [
    'Searchable profile', 'Searchable', 'Findable by everyone', 'Make my profile searchable', 'Profile is searchable',
    'Show my profile in search results', 'Include me in search results', 'Appear in search results', 'Show up in search engines',
    'Visible in search', 'Let people find me by my email address', 'Allow others to find you by phone number',
    'Let anyone look up my profile', 'Allow search engines to index my profile', 'Let search engines link to your page',
    'Search engine indexing', 'Indexed by search engines',
  ]
  for (const name of findable) {
    assert.match(sw(name, false), /permission/, name)
    assert.match(space(name, false), /permission/, `Space: ${name}`)
  }
  // A web checkbox, an ARIA switch with no native state (asks both ways, as CU-754), and a desktop checkbox by its own name.
  assert.match(webcb('Show my profile in search results', false), /permission/)
  assert.match(sw('Searchable profile', undefined), /permission/)
  assert.match(axcb('Allow search engines to index my profile', false), /permission/)
})

test('CU-774: the other side - turning findability off, and local search features, stay free', () => {
  assert.equal(webcb('Searchable profile', true), 'allow')
  assert.equal(webcb('Let people find me by my email address', true), 'allow') // a native checkbox already on: the press turns findability off
  for (const name of ['Search history', 'Safe search', 'Searchable PDFs', 'Show search suggestions', 'Spotlight indexing', 'Allow indexing',
    'Hide my profile from search engines', 'Search engine', 'Show search bar', 'Find My']) {
    assert.equal(webcb(name, false), 'allow', name) // native checkboxes turning on: a known direction (an ARIA switch's unknown state can ask through other rules, e.g. a protection switch)
  }
  assert.equal(axcb('Spotlight indexing', false), 'allow')
})

test('CU-754: accessRowContext reads both shapes and nothing else', () => {
  assert.equal(accessRowContext('Full Disk Access'), true)
  assert.equal(accessRowContext({ list: 'Accessibility', hints: [] }), true)
  assert.equal(accessRowContext({ list: 'Display', hints: ['Increase contrast'] }), false)
  assert.equal(accessRowContext(null), false)
  assert.equal(accessRowContext(42), false)
})

test('CU-757: Allow / Grant / Give access in a dialog that states access asks permission', () => {
  assert.match(web('Allow', 'Connect Example app?', 'Example app will be able to read your files.'), /permission/)
  assert.match(web('Grant', 'Example app requests access', 'Review what it can do.'), /permission/)
  assert.match(web('Give access', 'Share your workspace', 'This gives the app full access to your workspace.'), /permission/)
  assert.match(web('Allow while using the app', 'Location', 'Maps would like to access your location.'), /permission/)
  assert.match(desk('com.example.app', 'Allow', '"Example" wants access', 'It will be able to control this computer.'), /permission/)
  // Localized buttons in a localized dialog.
  assert.match(web('Erlauben', 'Beispiel-App', 'Beispiel-App möchte auf Ihre Kontakte zugreifen.'), /permission/)
  assert.match(web('Autoriser', 'Exemple', 'Exemple souhaite accéder à vos photos.'), /permission/)
  assert.match(web('許可', 'サンプル', 'サンプルが連絡先へのアクセスを求めています。'), /permission/)
  // Return and Space press the same button.
  const enter = verdict(policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url: 'https://console.example/settings', target: { role: 'button', tag: 'button', name: 'Allow', dialogName: 'Connect Example app?', dialogDescription: 'Example app will be able to read your files.' } }))
  assert.match(enter, /permission/)
})

test('CU-757: the other side - the same buttons in a dialog that states no access, and access stated only for not confirming', () => {
  assert.equal(web('Allow', 'Use dark mode?', 'You can change this later in Settings.'), 'allow')
  assert.equal(web('Grant', 'Thanks!', 'Your badge is ready.'), 'allow')
  assert.equal(web('Autoriser', 'Mode sombre', 'Vous pourrez le changer plus tard.'), 'allow')
  // A sentence about NOT confirming describes the other button.
  assert.equal(web('Allow', 'Keep this layout?', 'If you cancel, the app will be able to read your old settings.'), 'allow')
})
