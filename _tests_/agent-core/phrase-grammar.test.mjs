import assert from 'node:assert/strict'
import { test } from 'node:test'

import { grammarClasses, tokens, MAX_TOKENS } from '../../_tools_/agent-core/phrase-grammar.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// Consent phrase grammar (_designs_/consent-phrase-grammar 0.3.1; cu-coordinator 16:46Z). The module is judged alone and
// through its one hook in policy.mjs: it fills gaps only (no older rule asked), never lowers or changes an older class.
// cu-researcher's conformance suite (every kept matrix row, an untouched held-out set, the F5 corpus) runs separately.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const URL = 'https://app.example/settings'
const click = (name, role = 'button') => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { role, name } }); return v.decision === 'allow' ? 'allow' : v.class }
const enter = (name) => { const v = policy.classify({ type: 'keypress', keys: ['ENTER'] }, { url: URL, target: { tag: 'input', role: 'textbox', name: 'Name', defaultButtonRead: true, defaultButton: { role: 'button', name } } }); return v.decision === 'allow' ? 'allow' : v.class }

test('grammar: folding - articles, possessives, plurals, amounts and parentheses fold; at most MAX_TOKENS tokens', () => {
  assert.deepEqual(tokens('Drop the production databases'), ['drop', 'production', 'database'])
  assert.deepEqual(tokens('Refund $20 (partial)'), ['refund', '<n>'])
  assert.deepEqual(tokens('Force-push my branch'), ['force', 'push', 'branch'])
  assert.equal(tokens(Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ')).length, MAX_TOKENS)
})

test('grammar: near forms with a window, plurals, devices, backups and person objects ask through the hook (click and Return)', () => {
  const rows = [
    ['Turn on space heater', 'physical'], ['Drop the production database', 'delete'], ['Launch 3 instances', 'purchase'],
    ['Wipe my phone', 'delete'], ['Erase iPad', 'delete'], ['Delete all backups', 'delete'], ['Tip the driver', 'purchase'],
    ['Pay Jane', 'purchase'], ['Rotate keys', 'credential'], ['Create access code', 'permission'], ['Make group admin', 'permission'],
    ['Clear chat', 'delete'], ['Unsend message', 'delete'], ['Exit group', 'submit'], ['Leave group', 'submit'],
    ['Report and block', 'submit'], ['Turn on disappearing messages', 'delete'], ['Make Playlist Public Anyway', 'permission'],
    ['Run this script', 'install'],
  ]
  for (const [name, cls] of rows) {
    assert.equal(click(name), cls, name)
    assert.equal(enter(name), cls, `Return: ${name}`)
  }
})

test('grammar module: each table row decides its near forms on its own (a table-row drop fails here)', () => {
  const rows = [
    ['Drop the staging databases', 'delete'], ['Wipe my laptop', 'delete'], ['Delete all snapshots', 'delete'],
    ['Turn on patio heater', 'physical'], ['Open the garage', 'physical'], ['Disable the front camera', 'physical'],
    ['Provision 2 servers', 'purchase'], ['Book the hotel room', 'purchase'], ['Tip the courier', 'purchase'],
    ['Invite as admin', 'permission'], ['Turn off firewall protection', 'permission'], ['Make the repo public', 'permission'],
    ['Regenerate secret', 'credential'], ['Export my keychain', 'credential'], ['Install the extension', 'install'],
    ['Cast my ballot', 'submit'], ['Publish now', 'submit'], ['Sign the lease agreement', 'permission'],
    ['Accept the updated terms', 'permission'], ['Release my medical records', 'permission'],
  ]
  for (const [name, cls] of rows) assert.deepEqual(grammarClasses(name), [cls], name)
})

test('grammar F1 / F5: object homonyms and the six false-ask clusters stay free', () => {
  for (const name of ['Update profile', 'Open Profile', 'View card', 'Show email', 'Copy email', 'Change key', 'Increase upload limit',
    'Send invoice', 'Clear table filters', 'Reset table view', 'Close branch', 'Open Message', 'Open Project', 'Open order',
    'Accept all changes in document', 'Apply to all', 'Move to columns', 'View as list', 'Cancel download', 'Resume all',
    'Get all new mail', 'Set up now', 'Start audio', 'Allow all', 'Post office', 'Copy link', 'Join group', 'Close message',
    'Add item to list', 'Make a copy', 'Refunds', 'Payroll settings', 'Delete old filter history', 'Sign in as guest', 'Back Up Now',
    'Back up my files']) {
    assert.deepEqual(grammarClasses(name), [], name)
  }
})

test('grammar F2: it never lowers or changes an older rule - older asks keep their class, older free context rules stay free', () => {
  assert.equal(click('Accept offer'), 'purchase', "CU-409's older purchase leads")
  assert.equal(click('Reset password', 'link'), 'allow', 'a link navigates: the grammar does not judge links (CU-411 link stays free)')
  assert.equal(click('Destroy', 'link'), 'allow', 'a Destroy link (docs) stays free (CU-417)')
  assert.equal(click('Sell an item'), 'allow', "a marketplace Sell keeps CU-400's context rule")
  assert.equal(click('Deposit'), 'allow', 'a bare Deposit keeps its context rule')
  assert.equal(click('Cancel scheduled payment'), 'allow', 'CU-408: cancelling a payment protects')
})

test('grammar F3: an 80k-character name is judged in well under the CU-272 budget, and so is a 48-word name', () => {
  const long = 'a'.repeat(80000)
  let start = process.hrtime.bigint()
  for (let i = 0; i < 50; i += 1) grammarClasses(long)
  const perLong = Number(process.hrtime.bigint() - start) / 50 / 1e6
  const words = Array.from({ length: 48 }, (_, i) => (i % 2 ? 'delete' : 'database')).join(' ')
  start = process.hrtime.bigint()
  for (let i = 0; i < 200; i += 1) grammarClasses(words)
  const perWords = Number(process.hrtime.bigint() - start) / 200 / 1e6
  assert.ok(perLong < 20, `80k name: ${perLong.toFixed(3)} ms`)
  assert.ok(perWords < 5, `48 words: ${perWords.toFixed(3)} ms`)
})

test('grammar: a priced choice cell asks purchase on a choice role (browser and desktop), never on a link (17:18Z)', () => {
  for (const role of ['gridcell', 'option', 'radio', 'button', 'AXCell', 'AXRadioButton', 'AXButton']) assert.equal(click('12A, extra legroom, $35', role), 'purchase', role)
  assert.equal(click('12A, extra legroom, $35', 'link'), 'allow', 'links never (named limit)')
  assert.equal(click('12A, window seat', 'gridcell'), 'allow', 'no amount, no ask')
  assert.equal(click('Wireless mouse $25', 'button'), 'allow', 'an amount without a seat / option / bag noun stays free')
})

test('grammar: CU-430 held-out folds - a count, a synonym, a demonstrative', () => {
  for (const [name, cls] of [['Add 2 bags', 'purchase'], ['Add trip insurance', 'purchase'], ['Cancel this trip', 'delete'], ['Use points', 'purchase']]) assert.equal(click(name), cls, name)
})

test('grammar round 2 (17:29Z): the three held-out misses, and Gift card $50 stands', () => {
  for (const [name, cls] of [['Renew the domain', 'purchase'], ['Sign the lease', 'permission'], ['Message all subscribers', 'submit']]) {
    assert.deepEqual(grammarClasses(name), [cls], name)
    assert.equal(click(name), cls, `hook: ${name}`)
  }
  assert.equal(click('Gift card $50'), 'purchase')
  assert.equal(click('Message subscriber'), 'allow', 'one recipient is not many')
})
