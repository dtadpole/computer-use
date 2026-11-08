import assert from 'node:assert/strict'
import { test } from 'node:test'

import { ENVIRONMENTS as CORE_ENVIRONMENTS } from '../../_tools_/agent-core/lib.mjs'
import { DEFAULT_PATHS, localConfig, localPath } from '../../_tools_/agent-core/local-config.mjs'
import { EXCLUDED_APPS } from '../../_tools_/agent-core/exclusions.mjs'
import { checkControl, checkRespond, checkStart, checkStatus, ENVIRONMENTS, FALLBACK_MODEL, ToolInputError, TOOLS } from '../../_tools_/computer-use-mcp/tools.mjs'

const refused = (pattern) => (error) => error instanceof ToolInputError && pattern.test(error.message)
const FIXTURE = 'ai.reflection.cu.fixture'
const desktop = (extra = {}) => ({ task: 'click once', environment: 'macos-desktop', apps: [FIXTURE], ...extra })
/** A machine's local config naming its default model by alias (local-config.mjs); the real id never appears here. */
const LOCAL = { defaultModel: 'claude-gateway/model-a', models: { 'model-a': { id: 'claude-test-model', toolset: true } } }

test('the four tools of the integration surface, each with an object input schema', () => {
  assert.deepEqual(TOOLS.map((tool) => tool.name), ['computer_use_start', 'computer_use_status', 'computer_use_respond', 'computer_use_control'])
  for (const tool of TOOLS) assert.equal(tool.inputSchema.type, 'object')
  assert.equal(TOOLS[1].inputSchema.properties.wait_seconds.maximum, 50, 'under the 60 s client timeout')
  assert.deepEqual(TOOLS[3].inputSchema.properties.command.enum, ['pause', 'resume', 'stop', 'guide'])
})

test('start: task and an http(s) start_url are required; defaults; unknown inputs and models are refused', () => {
  const start = { task: ' find the badge ', start_url: 'http://127.0.0.1:4000/tasks/visitor-badge' }
  const spec = checkStart(start, { config: LOCAL })
  assert.deepEqual([spec.task, spec.model, spec.liveView, spec.allowSites], ['find the badge', 'claude-gateway/model-a', true, []], "the local config's default, by alias")
  assert.equal(checkStart(start, { config: {} }).model, FALLBACK_MODEL, 'without a local config, the public fallback')
  assert.equal(FALLBACK_MODEL, 'claude-gateway/claude-opus-5')
  assert.equal(checkStart({ ...start, model: 'claude-gateway/claude-sonnet-5-5' }, { config: {} }).model, 'claude-gateway/claude-sonnet-5-5')
  assert.equal(checkStart({ ...start, model: 'claude-gateway/model-a' }, { config: LOCAL }).model, 'claude-gateway/model-a', 'the alias is kept; only the adapter resolves it')
  assert.throws(() => checkStart({ ...start, model: 'claude-gateway/model-a' }, { config: {} }), refused(/unknown model 'claude-gateway\/model-a'/), 'an alias the config does not define')
  assert.throws(() => checkStart({ ...start, model: 'claude-gateway/constructor' }, { config: LOCAL }), refused(/unknown model/))
  assert.match(TOOLS[0].inputSchema.properties.model.description, /local config's defaultModel/)
  assert.throws(() => checkStart({ start_url: 'http://x/' }), refused(/task is required/))
  assert.throws(() => checkStart({ task: 't', start_url: 'file:///etc/passwd' }), refused(/http\(s\)/))
  assert.throws(() => checkStart({ task: 't', start_url: 'http://x/', model: 'gpt-x' }), refused(/unknown model/))
  assert.throws(() => checkStart({ task: 't', start_url: 'http://x/', model: 'scripted' }), refused(/plan/))
  assert.throws(() => checkStart({ task: 't', start_url: 'http://x/', max_steps: 0 }), refused(/max_steps/))
  assert.throws(() => checkStart({ task: 't', start_url: 'http://x/', control_token: 'x' }), refused(/unknown input/))
})

test('status waits at most 50 s', () => {
  assert.deepEqual(checkStatus({ run_id: 'r' }), { runId: 'r', waitSeconds: 0 })
  assert.throws(() => checkStatus({ run_id: 'r', wait_seconds: 51 }), refused(/wait_seconds/))
})

test('respond answers questions only: approved and lifetime are refused by name', () => {
  assert.throws(() => checkRespond({ run_id: 'r', question_id: 'q', answer: 'yes', approved: true }), refused(/'approved' is refused/))
  assert.throws(() => checkRespond({ run_id: 'r', question_id: 'q', answer: 'yes', lifetime: 'run' }), refused(/'lifetime' is refused/))
  assert.deepEqual(checkRespond({ run_id: 'r', question_id: 'q', answer: 'blue' }), { runId: 'r', questionId: 'q', answer: 'blue' })
})

test('control: take_over, hand_back and consent need the control token this tool never holds', () => {
  for (const command of ['take_over', 'hand_back', 'consent']) assert.throws(() => checkControl({ run_id: 'r', command }), refused(/control token/))
  assert.throws(() => checkControl({ run_id: 'r', command: 'guide' }), refused(/guide needs text/))
  assert.deepEqual(checkControl({ run_id: 'r', command: 'stop', text: 'enough' }), { runId: 'r', command: 'stop', text: 'enough' })
})

test('nothing the calling model reads names control-link: it is a command for the person, in their own terminal', async () => {
  const { dshRow, heddleRow, ownerText } = await import('../../_tools_/computer-use-mcp/install-rows.mjs')
  const modelFacing = [JSON.stringify(TOOLS)]
  for (const input of [{ run_id: 'r', command: 'take_over' }, { run_id: 'r', command: 'consent' }]) {
    try { checkControl(input) } catch (error) { modelFacing.push(error.message) }
  }
  try { checkRespond({ run_id: 'r', question_id: 'q', answer: 'a', approved: true }) } catch (error) { modelFacing.push(error.message) }
  const { readFileSync } = await import('node:fs')
  modelFacing.push(readFileSync(new URL('../../_tools_/computer-use-mcp/runs.mjs', import.meta.url), 'utf8').match(/how: '[^']*'/)[0])
  for (const text of modelFacing) assert.doesNotMatch(text, /control-link/)
  const owner = ownerText()
  assert.ok(owner.includes(dshRow()) && owner.includes(heddleRow()), 'the owner text carries the tested rows verbatim')
  assert.match(owner, /run this yourself, in your own terminal/)
  assert.match(owner, /Never paste that URL or its token into a session/)
  // CU-5 (D-039): the rows and the text point at the owner's clone of github.com/dtadpole/computer-use, code at its root:
  // the local config's project path, else ~/computer-use, built here as install-rows.mjs builds it.
  const project = localPath('project', DEFAULT_PATHS.project, localConfig())
  assert.ok(dshRow().includes(`'${project}/_tools_/computer-use-mcp/server.mjs'`))
  assert.ok(heddleRow().includes(`${project}/_tools_/heddle-plugin/computer-use.mjs`))
  const elsewhere = { project: '/opt/cu', node: '/opt/node/bin/node', keyFile: '/opt/keys/gateway.key' }
  assert.ok(dshRow(elsewhere).includes("command: /opt/node/bin/node") && dshRow(elsewhere).includes("['/opt/cu/_tools_/computer-use-mcp/server.mjs', '--seat', 'cu-owner', '--key-file', '/opt/keys/gateway.key']"))
  assert.match(owner, /git -C ~\/computer-use pull/)
  assert.doesNotMatch(owner, /reflection/, 'nothing in the owner text points at the old reflection layout')
})

test('start offers macos-desktop: environment (browser default), apps and exclude_apps; start_url is required only for the browser', () => {
  const { properties, required } = TOOLS[0].inputSchema
  assert.deepEqual(properties.environment.enum, ['chrome-browser', 'macos-desktop'])
  assert.deepEqual([properties.apps.type, properties.apps.items.type, properties.apps.maxItems], ['array', 'string', 32])
  assert.equal(properties.exclude_apps.type, 'array')
  assert.deepEqual(required, ['task'])
  assert.match(JSON.stringify(TOOLS), /macos-desktop/, "the desktop-integration verifier's M9 check reads this")
  assert.match(properties.apps.description, /not approvals/)
  assert.ok(!Object.keys(properties).some((name) => /approv|consent|lifetime|grant/.test(name) && name !== 'pre_approve'), 'no input that approves')
  assert.deepEqual(checkStart({ task: 't', start_url: 'http://x/' }).environment, 'chrome-browser', 'the browser stays the default')
})

test("the environment names are agent core's", () => {
  assert.deepEqual([...ENVIRONMENTS].sort(), Object.keys(CORE_ENVIRONMENTS).sort())
})

test('a desktop start: apps are kept as candidates, start_url is not needed', () => {
  const spec = checkStart(desktop({ exclude_apps: ['com.example.secret.*'], max_steps: 3 }))
  assert.deepEqual([spec.environment, spec.apps, spec.excludeApps, spec.startUrl, spec.allowSites, spec.maxSteps], ['macos-desktop', [FIXTURE], ['com.example.secret.*'], null, [], 3])
})

test('refusals by name: an unknown environment, apps missing or malformed, and each field in the wrong environment', () => {
  assert.throws(() => checkStart({ task: 't', environment: 'windows-desktop', apps: [FIXTURE] }), refused(/unknown environment 'windows-desktop': one of chrome-browser, macos-desktop/))
  assert.throws(() => checkStart({ task: 't', environment: 'macos-desktop' }), refused(/apps is required for a macos-desktop run/))
  assert.throws(() => checkStart(desktop({ apps: [] })), refused(/apps is required/))
  assert.throws(() => checkStart(desktop({ apps: 'com.apple.TextEdit' })), refused(/apps must list 1 to 32/))
  assert.throws(() => checkStart(desktop({ apps: Array.from({ length: 33 }, (_, i) => `com.example.app${i}`) })), refused(/apps must list 1 to 32/))
  assert.throws(() => checkStart(desktop({ apps: ['not a bundle id'] })), refused(/'not a bundle id' is not a bundle id/))
  assert.throws(() => checkStart(desktop({ start_url: 'http://x/' })), refused(/start_url is for environment chrome-browser/))
  assert.throws(() => checkStart(desktop({ allow_sites: ['https://x/'] })), refused(/allow_sites is for environment chrome-browser/))
  assert.throws(() => checkStart({ task: 't', start_url: 'http://x/', apps: [FIXTURE] }), refused(/apps is for environment macos-desktop/))
  assert.throws(() => checkStart({ task: 't', start_url: 'http://x/', exclude_apps: ['com.x'] }), refused(/exclude_apps is for environment macos-desktop/))
  assert.throws(() => checkStart({ task: 't' }), refused(/start_url is required for a chrome-browser run/))
  assert.throws(() => checkStart(desktop({ exclude_apps: ['bad pattern'] })), refused(/exclude_apps: 'bad pattern' is not a bundle id/))
})

test("excluded apps are refused by name and kind, per agent core's table: every entry, its children, any case", () => {
  for (const { kind, ids } of EXCLUDED_APPS) {
    for (const id of ids) {
      const app = id.endsWith('.*') ? `${id.slice(0, -2)}.anything` : id
      assert.throws(() => checkStart(desktop({ apps: [FIXTURE, app] })), refused(new RegExp(`${app.replace(/\./g, '\\.')} is excluded \\(${kind}\\)`)), app)
    }
  }
  assert.throws(() => checkStart(desktop({ apps: ['com.apple.Terminal.helper'] })), refused(/excluded \(terminal\)/))
  assert.throws(() => checkStart(desktop({ apps: ['COM.APPLE.TERMINAL'] })), refused(/excluded \(terminal\)/))
  assert.throws(() => checkStart(desktop({ apps: [FIXTURE], exclude_apps: ['ai.reflection.*'] })), refused(/is also in exclude_apps/))
})

test('the caller can never approve an app or consent: approval-shaped inputs and new_app pre-approvals are refused by name', () => {
  for (const key of ['approved', 'lifetime', 'approve_apps', 'approved_apps', 'app_approvals', 'always', 'consent', 'grant']) {
    assert.throws(() => checkStart(desktop({ [key]: true })), refused(new RegExp(`'${key}' is refused: apps and consequential steps are approved only by a person`)), key)
  }
  assert.throws(() => checkStart(desktop({ pre_approve: ['new_app'] })), refused(/pre_approve 'new_app' is refused: an app is approved only by a person/))
  assert.throws(() => checkStart(desktop({ pre_approve: [`new_app@${FIXTURE}`] })), refused(/'new_app' is refused/))
  assert.throws(() => checkStart({ task: 't', start_url: 'http://x/', pre_approve: ['new_app'] }), refused(/'new_app' is refused/))
  for (const cls of ['launch_code', 'credential']) assert.throws(() => checkStart(desktop({ pre_approve: [cls] })), refused(new RegExp(`'${cls}' is refused: on the desktop it is never pre-approved`)))
  assert.deepEqual(checkStart(desktop({ pre_approve: ['submit'] })).preApprove, ['submit'], 'other classes pass as for the browser')
})

test('on the desktop only unknown_target may name one app: any other class@app is refused rather than widened to every app', () => {
  assert.throws(() => checkStart(desktop({ pre_approve: [`submit@${FIXTURE}`] })), refused(/only unknown_target can be limited to one app; give 'submit' alone/))
  assert.throws(() => checkStart(desktop({ pre_approve: ['unknown_target@not an app'] })), refused(/after @ comes the bundle id/))
  assert.deepEqual(checkStart(desktop({ pre_approve: [`unknown_target@${FIXTURE}`, 'unknown_target'] })).preApprove, [`unknown_target@${FIXTURE}`, 'unknown_target'])
  assert.deepEqual(checkStart({ task: 't', start_url: 'http://x/', pre_approve: ['submit@http://x'] }).preApprove, ['submit@http://x'], 'the browser keeps class@origin')
})
