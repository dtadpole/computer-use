import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { createScriptedAdapter } from '../../_tools_/agent-core/adapter-scripted.mjs'
import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createAppPolicy } from '../../_tools_/agent-core/app-policy.mjs'
import { createRunControl } from '../../_tools_/agent-core/control.mjs'
import { createFakeEnvironment } from '../../_tools_/agent-core/fake-env.mjs'
import { runTask } from '../../_tools_/agent-core/loop.mjs'
import { normaliseText } from '../../_tools_/agent-core/normalise.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'
import { readRun } from '../../_tools_/agent-core/trajectory.mjs'
import { CARD_DIGITS, SSN } from '../fixture-shapes/shapes.mjs'

// CU-266 (cu-researcher; cu-coordinator: High): a hostile page or app hides class words and values with invisible or
// look-alike characters. Built from code points, so no file carries the disguised strings literally.
const ZWSP = String.fromCodePoint(0x200b)
const SHY = String.fromCodePoint(0x00ad)
const WJ = String.fromCodePoint(0x2060)
const CYR_E = String.fromCodePoint(0x0435) // Cyrillic small e
const CYR_O = String.fromCodePoint(0x043e) // Cyrillic small o
const fullwidth = (text) => [...text].map((ch) => (ch >= '!' && ch <= '~' ? String.fromCodePoint(ch.codePointAt(0) + 0xfee0) : ch)).join('')

const FIXTURE = 'ai.reflection.cu.fixture'
const tmp = mkdtempSync(join(tmpdir(), 'cu-266-'))
after(() => rmSync(tmp, { recursive: true, force: true }))
const store = createAppApprovals({ path: join(tmp, 'a.json') })
store.grantAlways(FIXTURE, { by: 'api' })
const desktop = createAppPolicy({ scope: [FIXTURE], approvals: store })
const web = createPolicy({ sitePolicy: () => 'allow' })
const click = { type: 'click', x: 1, y: 1, button: 'left' }
const judged = (v) => (v.decision === 'allow' ? 'allow' : v.decision === 'handoff' ? 'handoff' : v.class)
const button = (name) => ({ origin: FIXTURE, role: 'AXButton', name, fingerprint: 'b', defaultButtonRead: true })

test('CU-266: disguised class words still match - zero-width, soft hyphen, word joiner, Cyrillic look-alikes, fullwidth', () => {
  const cases = [
    [`Se${ZWSP}nd`, 'submit'], [`De${SHY}lete`, 'delete'], [`Pl${WJ}ace order`, 'purchase'], [`D${CYR_E}l${CYR_E}t${CYR_E}`, 'delete'],
    [`S${CYR_E}nd`, 'submit'], [fullwidth('Send'), 'submit'], [`Sh${CYR_O}w Password`, null],
  ]
  for (const [name, cls] of cases.filter(([, c]) => c !== null)) {
    assert.equal(judged(desktop.classify(click, { frontmostBundleId: FIXTURE, target: button(name) })), cls, `desktop ${JSON.stringify(name)}`)
    assert.equal(judged(web.classify(click, { url: 'https://fixture.example/', target: { role: 'button', name } })), cls, `web ${JSON.stringify(name)}`)
  }
  const pw = desktop.classify({ type: 'type', text: 'hunter2' }, { frontmostBundleId: FIXTURE, target: { origin: FIXTURE, role: 'AXTextField', name: `Pass${ZWSP}word`, editable: true, fingerprint: 'p', defaultButtonRead: true } })
  assert.equal(judged(pw), 'handoff', 'a password-named entry with a zero-width space still hands off')
})

test('CU-266: disguised values still read - a card or SSN with zero-width characters or fullwidth digits; a name like Bank account', () => {
  const notes = { origin: FIXTURE, role: 'AXTextArea', name: 'Notes', editable: true, fingerprint: 'n', defaultButtonRead: true }
  for (const text of [[...CARD_DIGITS].join(ZWSP), fullwidth(CARD_DIGITS), fullwidth(SSN), SSN.split('-').join(`${SHY}-`)]) {
    assert.equal(judged(desktop.classify({ type: 'type', text }, { frontmostBundleId: FIXTURE, target: notes })), 'sensitive_data', JSON.stringify(text))
  }
  const bank = { ...notes, role: 'AXTextField', name: `Bank acc${CYR_O}unt` }
  assert.equal(judged(desktop.classify({ type: 'type', text: 'abc' }, { frontmostBundleId: FIXTURE, target: bank })), 'sensitive_data', 'a look-alike in a sensitive name')
})

test('CU-266: the normalisation keeps line breaks, plain text and non-Latin words; the posted action is untouched', () => {
  assert.equal(normaliseText('a\r\nb'), 'a\r\nb')
  assert.equal(normaliseText('Cancel'), 'Cancel')
  assert.equal(normaliseText('日本語'), '日本語')
  const action = { type: 'type', text: `x${ZWSP}y` }
  desktop.classify(action, { frontmostBundleId: FIXTURE, target: { origin: FIXTURE, role: 'AXTextArea', name: 'Notes', editable: true, fingerprint: 'n' } })
  assert.equal(action.text, `x${ZWSP}y`, 'the caller\'s action is not modified')
})

test('CU-266 through the loop: a click on a zero-width "Send" is declined unattended, nothing posted', async () => {
  const control = createRunControl()
  const environment = createFakeEnvironment({ kind: 'desktop', control })
  environment.inspectPoint = async () => button(`Se${ZWSP}nd`)
  const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions: [click] }, { final: 'done' }] })
  const result = await runTask({ task: 'tidy up', environment, model, control, runsDirectory: join(tmp, 'runs'), build: { commit: 'test', dirty: false }, apps: [FIXTURE], appApprovals: store })
  const action = readRun(result.trajectoryDir).events.find((e) => e.kind === 'action')
  assert.deepEqual([action.decision, action.class], ['confirm', 'submit'])
  assert.equal(environment.log.filter((x) => (x.action ?? x)?.type).length, 0)
})

test('CU-266: a letter-spaced class word closes up (cu-coordinator\'s ruling) - S e n d asks submit; ordinary spaced text stays as it is', () => {
  assert.equal(judged(desktop.classify(click, { frontmostBundleId: FIXTURE, target: button('S e n d') })), 'submit')
  assert.equal(judged(desktop.classify(click, { frontmostBundleId: FIXTURE, target: button('Place o r d e r') })), 'purchase')
  assert.equal(judged(web.classify(click, { url: 'https://fixture.example/', target: { role: 'button', name: `D e ${ZWSP}l e t e` } })), 'delete', 'with a zero-width space between the letters too')
  assert.equal(normaliseText('A B'), 'A B', 'two letters are no letter-spaced word')
  assert.equal(normaliseText('1 2 3 4'), '1 2 3 4', 'digit groups are the value rules\' own')
  assert.equal(normaliseText('Save as PDF'), 'Save as PDF')
})

test('CU-266: a copy source whose name hides IBAN with a zero-width space still lends its class to the paste', () => {
  const into = { origin: FIXTURE, role: 'AXTextField', name: 'Notes', editable: true, fingerprint: 'n', defaultButtonRead: true }
  const source = { role: 'AXTextField', name: `IB${ZWSP}AN`, editable: true, fingerprint: 's' }
  const paste = { type: 'keypress', keys: ['META', 'V'] }
  const verdict = desktop.classify(paste, { frontmostBundleId: FIXTURE, target: into, paste: { fromOwner: false, source } })
  assert.equal(judged(verdict), 'sensitive_data', JSON.stringify({ decision: verdict.decision, rule: verdict.rule }))
  const plain = desktop.classify(paste, { frontmostBundleId: FIXTURE, target: into, paste: { fromOwner: false, source: { ...source, name: 'Nickname' } } })
  assert.equal(judged(plain), 'allow', 'the same paste from a plain field is allowed')
})

test('CU-266 through the loop: a menu item named Paste with a soft hyphen and no key equivalent is still the loop\'s menu paste - no own copy, asked', async () => {
  const control = createRunControl()
  const environment = createFakeEnvironment({ kind: 'desktop', control })
  environment.inspectPoint = async () => ({ origin: FIXTURE, role: 'AXMenuItem', name: `Pa${SHY}ste`, fingerprint: 'm', defaultButtonRead: true })
  const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions: [click] }, { final: 'done' }] })
  const result = await runTask({ task: 'tidy up', environment, model, control, runsDirectory: join(tmp, 'runs'), build: { commit: 'test', dirty: false }, apps: [FIXTURE], appApprovals: store })
  const action = readRun(result.trajectoryDir).events.find((e) => e.kind === 'action')
  assert.equal(action.pasteboard?.kind, 'paste', 'the loop built a paste context')
  assert.deepEqual([action.decision, action.class], ['confirm', 'sensitive_data'])
  assert.equal(environment.log.filter((x) => (x.action ?? x)?.type).length, 0)
})

// CU-268: the residue cu-researcher found after #82 - invisible characters outside Cf, and other scripts' digits.
const VS16 = String.fromCodePoint(0xfe0f) // variation selector-16
const CGJ = String.fromCodePoint(0x034f) // combining grapheme joiner
const HANGUL_FILLER = String.fromCodePoint(0x3164)
const scriptDigits = (text, zero) => [...text].map((ch) => (ch >= '0' && ch <= '9' ? String.fromCodePoint(zero + Number(ch)) : ch)).join('')

test('CU-268: default-ignorable characters outside Cf no longer hide a class word - variation selector, grapheme joiner, Hangul filler', () => {
  for (const [name, cls] of [[`Se${VS16}nd`, 'submit'], [`De${CGJ}lete`, 'delete'], [`Place${HANGUL_FILLER}order`.replace(HANGUL_FILLER, ` ${HANGUL_FILLER}`), 'purchase']]) {
    assert.equal(judged(desktop.classify(click, { frontmostBundleId: FIXTURE, target: button(name) })), cls, `desktop ${JSON.stringify(name)}`)
    assert.equal(judged(web.classify(click, { url: 'https://fixture.example/', target: { role: 'button', name } })), cls, `web ${JSON.stringify(name)}`)
  }
  assert.equal(normaliseText(String.fromCodePoint(0x2800)), String.fromCodePoint(0x2800), 'the braille blank draws a cell: a named limit')
})

test('CU-268: a card or SSN in another script\'s digits reads as one - Arabic-Indic, Extended Arabic-Indic, Devanagari, Bengali', () => {
  const notes = { origin: FIXTURE, role: 'AXTextArea', name: 'Notes', editable: true, fingerprint: 'n', defaultButtonRead: true }
  for (const zero of [0x0660, 0x06f0, 0x0966, 0x09e6]) {
    for (const value of [CARD_DIGITS, SSN]) {
      const text = scriptDigits(value, zero)
      assert.equal(judged(desktop.classify({ type: 'type', text }, { frontmostBundleId: FIXTURE, target: notes })), 'sensitive_data', `${zero.toString(16)} ${value === SSN ? 'SSN' : 'card'}`)
    }
  }
  assert.equal(normaliseText(scriptDigits('2026', 0x0660)), '2026', 'a year stays a year')
  assert.equal(judged(desktop.classify({ type: 'type', text: scriptDigits('12', 0x0966) }, { frontmostBundleId: FIXTURE, target: notes })), 'allow')
})

// CU-268: a look-alike outside the fold table cannot be folded, so a word mixing scripts asks instead.
const ARM_OH = String.fromCodePoint(0x0585) // Armenian small oh, drawn like o
const ARM_VO = String.fromCodePoint(0x0578) // Armenian small vo, drawn like n

test('CU-268: a control whose name has one word mixing scripts asks - desktop unknown_target each time, browser permission (never pre-approved)', () => {
  const name = `Sh${ARM_OH}w details`
  const d = desktop.classify(click, { frontmostBundleId: FIXTURE, target: button(name) })
  assert.deepEqual([d.decision, d.class, d.rule, d.askEachTime], ['confirm', 'unknown_target', 'target:mixed_script', true])
  const w = web.classify(click, { url: 'https://fixture.example/', target: { role: 'button', name } })
  assert.deepEqual([w.decision, w.class, w.rule], ['confirm', 'permission', 'target:mixed_script'])
  const enter = web.classify({ type: 'keypress', keys: ['ENTER'] }, { url: 'https://fixture.example/', target: { role: 'button', name } })
  assert.equal(enter.class, 'permission', 'Return on it too')
  // cu-developer-one: CJK and Southeast Asian UIs mix their scripts with Latin inside one word; those letters look like no Latin one.
  for (const plain of ['Отправить', '日本語', 'Save 保存', 'Café', 'Show details', 'iCloud云盘', '打开Safari', 'Googleで検索', 'Gmail로 보내기', 'เปิดSafari', 'ーSettings']) {
    assert.equal(judged(desktop.classify(click, { frontmostBundleId: FIXTURE, target: button(plain) })), 'allow', `desktop ${plain}`)
    assert.equal(judged(web.classify(click, { url: 'https://fixture.example/', target: { role: 'button', name: plain } })), 'allow', `web ${plain}`)
  }
  assert.equal(judged(desktop.classify({ type: 'type', text: 'abc' }, { frontmostBundleId: FIXTURE, target: { origin: FIXTURE, role: 'AXTextField', name: `N${ARM_OH}tes`, editable: true, fingerprint: 'x', defaultButtonRead: true } })), 'allow', 'typing is no activation')
})

test('CU-268: a chord whose bound menu item mixes scripts asks unknown_target (cu-developer-one: a disguised Send in a menu)', () => {
  const bound = { items: [{ role: 'AXMenuItem', name: `Se${ARM_VO}d`, keyEquivalent: { char: 'D', modifiers: 1 } }] }
  const target = { origin: FIXTURE, role: 'AXTextArea', name: 'Message', editable: true, fingerprint: 'm', defaultButtonRead: true }
  const v = desktop.classify({ type: 'keypress', keys: ['META', 'SHIFT', 'D'] }, { frontmostBundleId: FIXTURE, target, boundMenuItem: bound })
  assert.deepEqual([v.decision, v.class, v.rule], ['confirm', 'unknown_target', 'menu:mixed_script'])
  const plain = desktop.classify({ type: 'keypress', keys: ['META', 'SHIFT', 'D'] }, { frontmostBundleId: FIXTURE, target, boundMenuItem: { items: [{ role: 'AXMenuItem', name: 'Archive', keyEquivalent: { char: 'D', modifiers: 1 } }] } })
  assert.equal(judged(plain), 'allow')
})

test('CU-268 through the loop: a click on a mixed-script control is declined unattended, nothing posted, and the record keeps the name only', async () => {
  const control = createRunControl()
  const environment = createFakeEnvironment({ kind: 'desktop', control })
  environment.inspectPoint = async () => button(`Sh${ARM_OH}w details`)
  const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions: [click] }, { final: 'done' }] })
  const result = await runTask({ task: 'tidy up', environment, model, control, runsDirectory: join(tmp, 'runs'), build: { commit: 'test', dirty: false }, apps: [FIXTURE], appApprovals: store })
  const action = readRun(result.trajectoryDir).events.find((e) => e.kind === 'action')
  assert.deepEqual([action.decision, action.class, action.rule], ['confirm', 'unknown_target', 'target:mixed_script'])
  assert.equal(environment.log.filter((x) => (x.action ?? x)?.type).length, 0)
  assert.equal(Object.hasOwn(action.target ?? {}, 'mixedScriptName'), false)
})
