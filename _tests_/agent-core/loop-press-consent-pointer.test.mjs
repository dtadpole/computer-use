import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'

import { createScriptedAdapter } from '../../_tools_/agent-core/adapter-scripted.mjs'
import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createRunControl } from '../../_tools_/agent-core/control.mjs'
import { createFakeEnvironment } from '../../_tools_/agent-core/fake-env.mjs'
import { runTask } from '../../_tools_/agent-core/loop.mjs'

// CU-64 D5, cu-verifier's addition: while consent is awaited the person may answer in the live view on this Mac and
// move the real mouse, so the last pointer agent core sent is stale afterwards, as after a pause or a take-over.

const FIXTURE = 'ai.reflection.cu.fixture'
let dir
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'cu-consent-pointer-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

test('after a consent was asked and answered, a bare press is refused and nothing is sent', async () => {
  const control = createRunControl()
  const environment = createFakeEnvironment({ kind: 'desktop', control })
  const store = createAppApprovals({ path: join(dir, 'app-approvals.json') })
  store.grantAlways(FIXTURE, { by: 'api' })
  const seen = []
  const model = createScriptedAdapter(async (input, { index }) => {
    seen.push(input)
    if (index === 0) return { actions: [{ type: 'move', x: 10, y: 10 }] }
    if (index === 1) {
      const answer = control.requestConsent({ id: 'c-test', kind: 'test', class: 'test' })
      assert.equal(control.state, 'awaiting_consent')
      control.send({ command: 'consent', id: 'c-test', approved: true }, { source: 'control' })
      await answer
      return { actions: [{ type: 'mouse_down' }, { type: 'mouse_up' }] }
    }
    return { final: 'done' }
  })
  await runTask({ task: 'press', environment, model, control, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false }, apps: [FIXTURE], appApprovals: store })
  assert.equal(environment.log.map((e) => e.action ?? e).filter((a) => a?.type === 'drag').length, 0)
  assert.equal(seen[2].results[0].code, 'no_pointer')
})
