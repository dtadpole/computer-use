import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { createScriptedAdapter } from '../../_tools_/agent-core/adapter-scripted.mjs'
import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createRunControl } from '../../_tools_/agent-core/control.mjs'
import { createFakeEnvironment } from '../../_tools_/agent-core/fake-env.mjs'
import { runTask } from '../../_tools_/agent-core/loop.mjs'
import { createSitePolicy } from '../../_tools_/agent-core/sites.mjs'
import { readRun } from '../../_tools_/agent-core/trajectory.mjs'

// CU-194 (password-memory.md): an entry the run saw as a password field is still judged as one after 'Show password'
// turns it into plain text - matched by the driver's fieldKey, which survives the toggle when the fingerprint does not.
const TYPE = (text) => ({ type: 'type', text })
const START = 'http://127.0.0.1:43117/tasks/login/'
const FIXTURE = 'ai.reflection.cu.fixture'

async function run({ desktop, first, second }) {
  const dir = mkdtempSync(join(tmpdir(), 'cu-194-'))
  try {
    const control = createRunControl()
    const environment = desktop ? createFakeEnvironment({ kind: 'desktop', control }) : createFakeEnvironment({ url: START, control })
    // The run first clicks the field (a focus click: allowed and performed, so the run sees it), then - after 'Show
    // password' - types into it. Only the typing is judged on the shown field.
    environment.inspectPoint = async () => ({ ...first, ...(desktop ? { origin: FIXTURE } : {}) })
    environment.focusedElement = async () => ({ ...second, ...(desktop ? { origin: FIXTURE } : {}) })
    const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions: [{ type: 'click', button: 'left', x: 100, y: 100 }] }, { actions: [TYPE('def')] }, { final: 'done' }] })
    const extra = desktop
      ? (() => { const store = createAppApprovals({ path: join(dir, 'a.json') }); store.grantAlways(FIXTURE, { by: 'api' }); return { apps: [FIXTURE], appApprovals: store } })()
      : { sitePolicy: createSitePolicy({ startUrl: START }) }
    const result = await runTask({ task: 'sign in', environment, model, control, runsDirectory: join(dir, 'runs'), build: { commit: 't', dirty: false }, ...extra })
    const actions = readRun(result.trajectoryDir).events.filter((e) => e.kind === 'action')
    const runText = readFileSync(join(result.trajectoryDir, 'events.jsonl'), 'utf8')
    // A performed click writes 'attempted' then 'done' (write-ahead); the typing is the one action judged on the shown field.
    assert.ok(actions.some((e) => e.action?.type === 'click' && e.decision === 'allow' && e.status === 'done'), 'the focus click is allowed and performed')
    // An allowed typing writes 'attempted' then 'done', an asked or handed-off one a single record: its final record decides.
    const typing = actions.filter((e) => e.action?.type === 'type')
    assert.ok(typing.length >= 1 && new Set(typing.map((e) => e.index)).size === 1, 'one typing action')
    const last = typing.at(-1)
    return { verdict: [last.decision, last.class ?? last.rule], runText }
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

const webPassword = { tag: 'input', role: 'textbox', name: '', editable: true, inputType: 'password', isPassword: true, fieldKey: 'k-web-1', fingerprint: 'f1' }
const webShown = (fieldKey) => ({ tag: 'input', role: 'textbox', name: '', editable: true, inputType: 'text', isPassword: false, fieldKey, fingerprint: 'f2' })

test('CU-194 browser: a password field shown in plain text (same fieldKey, new fingerprint) still asks credential', async () => {
  const { verdict, runText } = await run({ desktop: false, first: webPassword, second: webShown('k-web-1') })
  assert.deepEqual(verdict, ['confirm', 'credential'])
  assert.equal(runText.includes('k-web-1'), false, 'the key is in no run file')
})

test('CU-194 browser: another field (another key) is unaffected', async () => {
  const { verdict } = await run({ desktop: false, first: webPassword, second: webShown('k-web-2') })
  assert.equal(verdict[0], 'allow')
})

test('CU-194 desktop: a secure field swapped for a plain AXTextField at its place hands off as a password field', async () => {
  const secure = { role: 'AXSecureTextField', name: '', editable: true, secure: true, fieldKey: 'k-desk-1', fingerprint: 'd1' }
  const plain = { role: 'AXTextField', name: '', editable: true, fieldKey: 'k-desk-1', fingerprint: 'd2' }
  const { verdict } = await run({ desktop: true, first: secure, second: plain })
  assert.deepEqual(verdict, ['handoff', 'password_field'])
})

test('CU-194: a Password hint field is never remembered - its plain twin is judged as today', async () => {
  const hint = { tag: 'input', role: 'textbox', name: 'Password hint', editable: true, inputType: 'text', fieldKey: 'k-hint', fingerprint: 'h1' }
  const { verdict } = await run({ desktop: false, first: hint, second: webShown('k-hint') })
  assert.equal(verdict[0], 'allow')
})
