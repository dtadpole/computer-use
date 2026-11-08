import assert from 'node:assert/strict'
import { test } from 'node:test'

import { main, needsCleanExec, UsageError } from '../../_tools_/agent-core/cli.mjs'
import * as run from '../../_tools_/agent-core/run.mjs'

// CU-203 (cu-researcher, cu-verifier): the forged-pid measurement route died with the helper's forged seam - a build
// that trusts hardware-looking events carries no command that asks for forged ones.

test('measure-input-source is gone: the cli refuses it as an unknown command, and run.mjs exports no measurement', async () => {
  await assert.rejects(main(['measure-input-source', '--env', 'macos-desktop', '--seat', 's', '--app', 'ai.reflection.cu.fixture'], { env: {} }),
    (error) => error instanceof UsageError && /commands: run, replay, prune, control-link, apps, inspect$/.test(error.message))
  assert.equal(Object.hasOwn(run, 'measureInputSource'), false)
  assert.equal(needsCleanExec(['measure-input-source', '--env', 'macos-desktop'], { NODE_PATH: '/x' }), false)
})
