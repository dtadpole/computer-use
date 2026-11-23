import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { createScriptedAdapter } from '../../_tools_/agent-core/adapter-scripted.mjs'
import { createRunControl } from '../../_tools_/agent-core/control.mjs'
import { createFakeEnvironment } from '../../_tools_/agent-core/fake-env.mjs'
import { runTask } from '../../_tools_/agent-core/loop.mjs'
import { createSitePolicy } from '../../_tools_/agent-core/sites.mjs'
import { readRun } from '../../_tools_/agent-core/trajectory.mjs'

// cu-coordinator 22:17Z: after a focus-moving key the loop settles the focus, then asks keyTarget what Enter acts on - an
// aria-activedescendant option (CU-370) - instead of judging the listbox the focus settled on.
const tmp = mkdtempSync(join(tmpdir(), 'cu-aria-enter-'))
after(() => rmSync(tmp, { recursive: true, force: true }))
const LISTBOX = { origin: 'https://shop.example', role: 'listbox', name: 'Bulk actions' }

const run = async (optionName) => {
  const control = createRunControl()
  const environment = createFakeEnvironment({ kind: 'browser', control, url: 'https://shop.example/orders', focused: LISTBOX })
  environment.keyTarget = async (action) => ((action.keys ?? []).includes('ENTER') ? { origin: 'https://shop.example', role: 'option', name: optionName, selectOption: true } : null)
  const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions: [{ type: 'keypress', keys: ['ARROWDOWN'] }, { type: 'keypress', keys: ['ENTER'] }] }, { final: 'done' }] })
  const result = await runTask({ task: 'tidy the orders', environment, model, control, runsDirectory: join(tmp, optionName), build: { commit: 'test', dirty: false }, sitePolicy: createSitePolicy({ allowed: ['https://shop.example'] }) })
  return readRun(result.trajectoryDir).events.filter((e) => e.kind === 'action' && (e.action?.keys ?? []).includes('ENTER')).at(-1)
}

test('ArrowDown then Enter on an aria-activedescendant listbox: Delete asks (declined unattended), Archive is free', async () => {
  assert.equal((await run('Delete')).status, 'declined')
  assert.equal((await run('Archive')).status, 'done')
})

test('ArrowDown then Delete on a grid row still asks (keyTarget has no answer, the settled row is judged)', async () => {
  const control = createRunControl()
  const environment = createFakeEnvironment({ kind: 'browser', control, url: 'https://shop.example/orders', focused: { origin: 'https://shop.example', role: 'row', name: 'Order 1001' } })
  environment.keyTarget = async () => null
  const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions: [{ type: 'keypress', keys: ['ARROWDOWN'] }, { type: 'keypress', keys: ['DELETE'] }] }, { final: 'done' }] })
  const result = await runTask({ task: 'tidy the orders', environment, model, control, runsDirectory: join(tmp, 'grid'), build: { commit: 'test', dirty: false }, sitePolicy: createSitePolicy({ allowed: ['https://shop.example'] }) })
  const pressed = readRun(result.trajectoryDir).events.filter((e) => e.kind === 'action' && (e.action?.keys ?? []).includes('DELETE')).at(-1)
  assert.equal(pressed.status, 'declined')
})

test('a keyTarget answer without an option flag does not replace the settled focus', async () => {
  const control = createRunControl()
  const environment = createFakeEnvironment({ kind: 'browser', control, url: 'https://shop.example/orders', focused: { origin: 'https://shop.example', role: 'row', name: 'Order 1001' } })
  environment.keyTarget = async () => ({ origin: 'https://shop.example', role: 'button', name: 'Help' })
  const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions: [{ type: 'keypress', keys: ['ARROWDOWN'] }, { type: 'keypress', keys: ['DELETE'] }] }, { final: 'done' }] })
  const result = await runTask({ task: 'tidy the orders', environment, model, control, runsDirectory: join(tmp, 'unflagged'), build: { commit: 'test', dirty: false }, sitePolicy: createSitePolicy({ allowed: ['https://shop.example'] }) })
  const pressed = readRun(result.trajectoryDir).events.filter((e) => e.kind === 'action' && (e.action?.keys ?? []).includes('DELETE')).at(-1)
  assert.equal(pressed.status, 'declined', 'the settled row is judged, not the unflagged Help button')
})
