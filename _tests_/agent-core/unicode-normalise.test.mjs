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
