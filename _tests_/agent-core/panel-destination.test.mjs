import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'

import { createScriptedAdapter } from '../../_tools_/agent-core/adapter-scripted.mjs'
import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createAppPolicy, panelDestination } from '../../_tools_/agent-core/app-policy.mjs'
import { createRunControl } from '../../_tools_/agent-core/control.mjs'
import { createFakeEnvironment } from '../../_tools_/agent-core/fake-env.mjs'
import { runTask } from '../../_tools_/agent-core/loop.mjs'

// CU-39 red team: an unknown destination folder is asked as such, never read as 'not protected'; a name typed as a
// path is resolved on its own and checked. Protected cases stay in unit tests - nothing here can write a file.

const FIXTURE = 'ai.reflection.cu.fixture'
const HOME = '/Users/someone'

test('panelDestination resolves typed paths, joins relative names to a known folder, and says unknown otherwise', () => {
  assert.deepEqual(panelDestination({ name: '~/Library/LaunchAgents/x.plist' }, HOME), { path: `${HOME}/Library/LaunchAgents/x.plist`, known: true })
  assert.deepEqual(panelDestination({ name: '/tmp/a/../b.txt', directory: `${HOME}/Documents` }, HOME), { path: '/tmp/b.txt', known: true })
  assert.deepEqual(panelDestination({ name: 'sub/x.txt', directory: `${HOME}/Documents` }, HOME), { path: `${HOME}/Documents/sub/x.txt`, known: true })
  assert.deepEqual(panelDestination({ name: 'sub/x.txt' }, HOME), { path: null, known: false }, 'a relative path without a folder is unknown')
  assert.deepEqual(panelDestination({ name: '~bob/x' }, HOME), { path: null, known: false }, 'another user\'s home is unknown')
  assert.deepEqual(panelDestination({ name: 'report.pdf', path: `${HOME}/Documents/report.pdf` }, HOME), { path: `${HOME}/Documents/report.pdf`, known: true })
  assert.deepEqual(panelDestination({ name: 'report.pdf', path: null, directory: null }, HOME), { path: null, known: false })
  assert.deepEqual(panelDestination(null, HOME), { path: null, known: false })
})

test('inside a panel, a typed protected path or a .. path is refused before any Return; a plain name passes', () => {
  const policy = createAppPolicy({ scope: [FIXTURE] })
  policy.grantScope(FIXTURE, { approved: true, answeredBy: 'api' })
  const field = { origin: FIXTURE, role: 'AXTextField', name: '', panel: 'save', fingerprint: 'name' }
  const typed = (text) => policy.classify({ type: 'type', text }, { frontmostBundleId: FIXTURE, target: field })
  assert.equal(typed('~/Library/LaunchAgents/probe.plist').rule, 'panel:protected_path')
  assert.equal(typed('~/.ssh/id_ed25519\n').rule, 'panel:protected_path', 'with the Return too')
  assert.equal(typed('../../Library/x').rule, 'panel:relative_path')
  assert.equal(typed('..').rule, 'panel:relative_path')
  assert.equal(typed('report.pdf').decision, 'allow')
})

let dir
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'cu-panel-dest-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

async function commitWith(selection) {
  const control = createRunControl()
  const environment = createFakeEnvironment({ kind: 'desktop', control })
  const store = createAppApprovals({ path: join(dir, 'app-approvals.json') })
  store.grantAlways(FIXTURE, { by: 'api' })
  const requests = []
  control.subscribe((event) => { if (event.type === 'consent_request' && event.request.class === 'file_choice') requests.push(event.request) })
  environment.inspectPoint = async () => ({ origin: FIXTURE, role: 'AXButton', name: 'Save', panel: 'save', fingerprint: 'save' })
  environment.panelSelection = async () => selection
  const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions: [{ type: 'click', button: 'left', x: 10, y: 10 }] }, { final: 'done' }] })
  const result = await runTask({ task: 'export the report', environment, model, control, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false }, apps: [FIXTURE], appApprovals: store })
  return { requests, result }
}

test('a commit with no known folder is asked as "destination folder unknown" and recorded folderKnown false', async () => {
  const { requests } = await commitWith({ path: null, directory: null, name: 'report.pdf' })
  assert.equal(requests.length, 1)
  assert.equal(requests[0].folderKnown, false)
  assert.match(requests[0].what, /destination folder unknown/)
  assert.equal(requests[0].path, undefined)
})

test('a name typed as a protected path is blocked at the commit without asking; a known folder shows the path', async () => {
  const { homedir } = await import('node:os')
  const blocked = await commitWith({ path: null, directory: '/tmp', name: '~/Library/LaunchAgents/probe.plist' })
  assert.equal(blocked.requests.length, 0)
  assert.equal(blocked.result.actions.blocked, 1)
  const shown = await commitWith({ path: `${homedir()}/Documents/report.pdf`, directory: `${homedir()}/Documents`, name: 'report.pdf' })
  assert.equal(shown.requests[0].folderKnown, true)
  assert.equal(shown.requests[0].path, `${homedir()}/Documents/report.pdf`)
})
