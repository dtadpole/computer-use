import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { createScriptedAdapter } from '../../_tools_/agent-core/adapter-scripted.mjs'
import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { apiController } from '../../_tools_/agent-core/consent.mjs'
import { createRunControl } from '../../_tools_/agent-core/control.mjs'
import { createFakeEnvironment } from '../../_tools_/agent-core/fake-env.mjs'
import { runTask } from '../../_tools_/agent-core/loop.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'
import { createSitePolicy } from '../../_tools_/agent-core/sites.mjs'
import { readRun } from '../../_tools_/agent-core/trajectory.mjs'
import { CARD_DIGITS, SSN } from '../fixture-shapes/shapes.mjs'

/**
 * CU-340 (cu-coordinator 12:56Z: High; design note 0.1 on the issue): a page that splits one value across boxes - an SSN
 * in 3/2/4, a card in 4x4 - left each box's buffer with only its part, so nothing asked. The loop now passes the last
 * three other fields typed in the same page or app within the last eight typed actions, and the policy judges short
 * parts joined with this field's text; the box that completes a value asks.
 */

const FIXTURE = 'ai.reflection.cu.fixture'
const tmp = mkdtempSync(join(tmpdir(), 'cu-340-'))
after(() => rmSync(tmp, { recursive: true, force: true }))
const store = createAppApprovals({ path: join(tmp, 'a.json') })
store.grantAlways(FIXTURE, { by: 'api' })
const fieldOf = (kind, name, fingerprint) => (kind === 'desktop'
  ? { origin: FIXTURE, role: 'AXTextField', name, editable: true, fingerprint, defaultButtonRead: true }
  : { origin: 'https://fixture.example', role: 'textbox', tag: 'input', name, editable: true, fingerprint })

let runs = 0
/** Run `actions` in one batch; a click at x < 100 focuses field A, any other click field B; ARROWDOWN and TAB move to B. */
async function run(kind, actions, { task = 'fill in the notes', approve = false, clipboard = null, unreadableFocus = false } = {}) {
  const control = createRunControl()
  const environment = createFakeEnvironment({ kind, control, ...(kind === 'browser' ? { url: 'https://fixture.example/' } : {}) })
  const A = fieldOf(kind, 'Notes', 'field-a')
  const B = fieldOf(kind, 'Reference', 'field-b')
  let focus = A
  environment.focusedElement = async () => (unreadableFocus ? null : focus)
  // The browser's run clipboard (the run's own copies); agent core reads it at a paste.
  if (clipboard !== null) environment.clipboard = { get: () => clipboard, set: () => {} }
  environment.inspectPoint = async ({ x }) => (x < 100 ? A : B)
  const perform = environment.perform.bind(environment)
  environment.perform = async (action) => {
    const effect = await perform(action)
    if (action.type === 'click') focus = action.x < 100 ? A : action.x < 1000 ? B : fieldOf(kind, `Field ${action.x}`, `field-${action.x}`)
    if (action.type === 'keypress' && ['ARROWDOWN', 'TAB'].includes(action.keys?.[0])) focus = B
    if (action.type === 'keypress' && action.keys?.[0] === 'SHIFT' && action.keys?.[1] === 'TAB') focus = A
    return effect
  }
  // A long sequence goes over several model turns (a call carries a bounded batch).
  const turns = []
  for (let i = 0; i < actions.length; i += 16) turns.push({ actions: actions.slice(i, i + 16) })
  const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [...turns, { final: 'done' }] })
  // A person who approves every request, counted.
  const controller = approve ? apiController() : undefined
  let asked = 0
  let running = true
  const answering = approve ? (async () => {
    while (running) {
      const request = await controller.waitForRequest(200).catch(() => null)
      if (request) { asked += 1; controller.respond({ id: request.id, approved: true }) }
    }
  })() : null
  const result = await runTask({ task, environment, model, control, ...(controller ? { controller } : {}), runsDirectory: join(tmp, `runs-${runs += 1}`), build: { commit: 'test', dirty: false }, ...(kind === 'desktop' ? { apps: [FIXTURE], appApprovals: store } : { sitePolicy: createSitePolicy({ startUrl: 'https://fixture.example/' }) }) })
  running = false
  await answering
  const events = readRun(result.trajectoryDir).events.filter((e) => e.kind === 'action' && e.status !== 'attempted')
  const text = readFileSync(join(result.trajectoryDir, 'events.jsonl'), 'utf8')
  return { asked, events, posted: environment.log.filter((x) => x && typeof x === 'object' && x.type && x.type !== 'screenshot').length, text }
}


const clickBox = (i) => ({ type: 'click', x: 1000 + i * 20, y: 400, button: 'left' })
const boxes = (...parts) => parts.flatMap((text, i) => [clickBox(i), { type: 'type', text }])
const verdicts = (events) => events.filter((e) => e.type !== 'click' && e.action?.type !== 'click').map((e) => (e.decision === 'allow' ? 'allow' : e.class))

const policy = createPolicy({ sitePolicy: () => 'allow' })
const judge = (next, parts, before = '', url = 'https://forms.example/apply') => {
  const r = policy.classify({ type: 'type', text: next }, { url, target: { tag: 'input', role: 'textbox', name: null, editable: true }, typedSplit: { parts, before, next } })
  return r.decision === 'allow' ? 'allow' : r.class
}
const [s1, s2, s3] = SSN.split('-')
const card = CARD_DIGITS.match(/.{4}/g)

test('CU-340 policy: the box that completes an SSN (3/2/4) or a card (4x4) asks; the boxes before it do not', () => {
  assert.equal(judge(s2, [s1]), 'allow')
  assert.equal(judge(s3, [s1, s2]), 'sensitive_data')
  assert.equal(judge(card[1], [card[0]]), 'allow')
  assert.equal(judge(card[2], [card[0], card[1]]), 'allow')
  assert.equal(judge(card[3], [card[0], card[1], card[2]]), 'sensitive_data')
  assert.equal(judge(s3.slice(-1), [s1, s2], s3.slice(0, -1)), 'sensitive_data', 'key by key in the last box: the completing key asks')
})

test('CU-340 policy negatives: unrelated short entries, a date in boxes, long text, and a value already judged', () => {
  assert.equal(judge('34', ['12']), 'allow')
  assert.equal(judge('2026', ['11', '09']), 'allow', 'a date split into boxes')
  assert.equal(judge(s3, ['hello world', s2]), 'allow', 'a long part breaks the join')
  assert.equal(judge('123', [card[0], card[1], card[2], card[3]].slice(-3)), judge('123', card.slice(-3)), 'deterministic')
})

for (const kind of ['desktop', 'browser']) {
  test(`CU-340 [${kind}]: an SSN typed into three boxes - the third asks and never reaches the app`, async () => {
    const { events, posted } = await run(kind, boxes(s1, s2, s3))
    const v = events.map((e) => (e.decision === 'allow' ? 'allow' : e.class))
    assert.equal(v.at(-1), 'sensitive_data', JSON.stringify(v))
    assert.deepEqual(v.slice(0, -1), Array(v.length - 1).fill('allow'))
    assert.equal(posted, v.length - 1, 'the completing box never reached the app')
  })

  test(`CU-340 [${kind}]: a card typed into four boxes - the fourth asks`, async () => {
    const { events } = await run(kind, boxes(...card))
    const v = events.map((e) => (e.decision === 'allow' ? 'allow' : e.class))
    assert.equal(v.at(-1), 'sensitive_data', JSON.stringify(v))
    assert.equal(v.filter((x) => x !== 'allow').length, 1)
  })

  test(`CU-340 [${kind}]: boxes typed more than eight field changes apart are not joined`, async () => {
    // Nine scratch boxes, each typed and erased, stay empty (not joined) but move the field-change clock on.
    const filler = Array.from({ length: 9 }, (_, i) => [clickBox(6 + i), { type: 'type', text: 'x' }, { type: 'keypress', keys: ['BACKSPACE'] }]).flat()
    const { events } = await run(kind, [clickBox(0), { type: 'type', text: s1 }, clickBox(1), { type: 'type', text: s2 }, ...filler, clickBox(2), { type: 'type', text: s3 }])
    assert.equal(events.filter((e) => e.decision !== 'allow').length, 0)
  })
}

test('CU-340 [browser]: boxes typed on another page are not joined', async () => {
  const { events } = await run('browser', [clickBox(0), { type: 'type', text: s1 }, clickBox(1), { type: 'type', text: s2 }, { type: 'navigate', url: 'https://fixture.example/other' }, clickBox(2), { type: 'type', text: s3 }])
  assert.equal(events.filter((e) => e.decision !== 'allow' && e.action?.type === 'type').length, 0, JSON.stringify(events.map((e) => [e.action?.type, e.decision, e.class])))
})

// CU-340's second shape (cu-researcher, cu-coordinator 12:59Z): half a card pasted, half typed into one field.
const half = CARD_DIGITS.slice(0, 8)
const rest = CARD_DIGITS.slice(8)
const typeVerdict = (events) => { const e = events.filter((x) => x.action?.type === 'type').at(-1); return e ? (e.decision === 'allow' ? 'allow' : e.class) : 'missing' }
test('CU-340 [desktop]: a paste the run cannot read, then digits typed into the same field - the typed digits ask', async () => {
  const { events } = await run('desktop', [{ type: 'keypress', keys: ['META', 'V'] }, { type: 'type', text: rest }], { approve: true })
  assert.equal(typeVerdict(events), 'sensitive_data', JSON.stringify(events.map((e) => [e.action?.type, e.decision, e.class])))
})
test('CU-340 [desktop]: text typed after such a paste stays as judged; select all clears the mark', async () => {
  const words = await run('desktop', [{ type: 'keypress', keys: ['META', 'V'] }, { type: 'type', text: 'kind regards' }], { approve: true })
  assert.equal(typeVerdict(words.events), 'allow')
  const cleared = await run('desktop', [{ type: 'keypress', keys: ['META', 'V'] }, { type: 'keypress', keys: ['META', 'A'] }, { type: 'type', text: '1234' }], { approve: true })
  assert.equal(typeVerdict(cleared.events), 'allow')
})
test('CU-340 [browser]: half a card pasted from the run clipboard, half typed - the typed half asks', async () => {
  const { events } = await run('browser', [{ type: 'keypress', keys: ['META', 'V'] }, { type: 'type', text: rest }], { clipboard: half, approve: true })
  assert.equal(typeVerdict(events), 'sensitive_data', JSON.stringify(events.map((e) => [e.action?.type, e.decision, e.class])))
})
for (const kind of ['desktop', 'browser']) {
  test(`CU-340 [${kind}]: a card in four boxes followed by a CVV box - the fourth box asks`, async () => {
    const { events } = await run(kind, [...boxes(...card), clickBox(4), { type: 'type', text: '123' }])
    const typedVerdicts = events.filter((e) => e.action?.type === 'type' || e.decision !== 'allow').map((e) => (e.decision === 'allow' ? 'allow' : e.class))
    assert.equal(typedVerdicts[3], 'sensitive_data', JSON.stringify(typedVerdicts))
  })
}

for (const kind of ['desktop', 'browser']) {
  test(`CU-340 [${kind}]: a card typed key by key into four boxes - the last key asks (cu-researcher)`, async () => {
    const keyed = card.flatMap((part, i) => [clickBox(i), ...[...part].map((ch) => ({ type: 'type', text: ch }))])
    const { events } = await run(kind, keyed)
    const v = events.filter((e) => e.action?.type === 'type').map((e) => (e.decision === 'allow' ? 'allow' : e.class))
    assert.equal(v.at(-1), 'sensitive_data', JSON.stringify(v))
    assert.equal(v.filter((x) => x !== 'allow').length, 1)
  })
}
