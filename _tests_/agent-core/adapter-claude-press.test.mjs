import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createClaudeGatewayAdapter, memberToAction } from '../../_tools_/agent-core/adapter-claude.mjs'

// CU-64: the button members map to canonical press types and are offered only where agent core composes presses;
// hold_key stays withheld until the driver plans a hold.

const PNG = { data: Buffer.from('png-bytes'), mimeType: 'image/png', width: 1440, height: 900, url: 'http://127.0.0.1:1/' }
const END = { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Done.' }], usage: { input_tokens: 1, output_tokens: 1 } }
/** A toolset model by local-config alias (local-config.mjs), so no real model id is named here. */
const LOCAL = { models: { 'model-a': { id: 'claude-test-model', toolset: true } } }

async function configsFor(tools) {
  const calls = []
  const adapter = createClaudeGatewayAdapter({
    model: 'model-a',
    config: LOCAL,
    fetch: async (url, init) => { calls.push(JSON.parse(init.body)); return { ok: true, status: 200, json: async () => END } },
    readKey: () => 'test-key-not-real-0123456789',
    retryDelays: [1],
  })
  const session = await adapter.open({ instructions: 'x', task: 'y', tools })
  await session.next({ task: 'y', screenshot: PNG })
  return calls[0].tools.find((t) => t.type === 'computer_toolset_20260801').configs
}

test('left_mouse_down and left_mouse_up become mouse_down and mouse_up', () => {
  assert.deepEqual(memberToAction('left_mouse_down', {}), { type: 'mouse_down' })
  assert.deepEqual(memberToAction('left_mouse_up', {}), { type: 'mouse_up' })
})

test('a desktop run (tools.press) is offered the button members; hold_key stays withheld; elsewhere all three are', async () => {
  const desktop = await configsFor({ navigate: false, press: true })
  assert.equal(desktop.left_mouse_down, undefined)
  assert.equal(desktop.left_mouse_up, undefined)
  assert.deepEqual(desktop.hold_key, { enabled: false })
  const browser = await configsFor({ navigate: true })
  for (const member of ['hold_key', 'left_mouse_down', 'left_mouse_up']) assert.deepEqual(browser[member], { enabled: false }, member)
})
