import assert from 'node:assert/strict'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, test } from 'node:test'

import { isHello, startSocketHelper, startStdioHelper } from '../../_tools_/verify-kit/helper-client.mjs'
import { CONFORMANCE } from '../../_tools_/verify-kit/helper-conformance.mjs'

const DOUBLE = join(dirname(fileURLToPath(import.meta.url)), 'double-helper.mjs')

/** Run one conformance check against the double with an optional breach; resolves to the error or null. */
async function run(check, breach = '') {
  let helper
  try {
    helper = await startStdioHelper(process.execPath, [DOUBLE], { env: { ...process.env, CU_DOUBLE_BREAK: breach } })
  } catch (error) {
    return error
  }
  const exits = (ms) => Promise.race([helper.exited.then(() => true), new Promise((resolve) => setTimeout(() => resolve(false), ms))])
  try {
    await check.run(helper, { exits })
    return null
  } catch (error) {
    return error
  } finally {
    await helper.close()
  }
}

describe('helper conformance checks', () => {
  test('hello is recognised whichever way the wire spells it', () => {
    assert.equal(isHello({ type: 'hello', protocol: 1 }), true)
    assert.equal(isHello({ event: 'hello' }), true)
    assert.equal(isHello({ protocol: 1, grants: {} }), true)
    assert.equal(isHello({ id: 1, ok: true }), false)
  })

  test('every check holds against a conformant double', async () => {
    for (const check of CONFORMANCE) assert.equal((await run(check))?.message ?? null, null, check.name)
  })

  // Each check must fail on the breach it is about (proof that it can fail before the real helper exists).
  const BREACHES = {
    'bad-hello': 'the opening hello names protocol 1, the helper version, each grant and the displays',
    'unknown-ok': 'an unknown request is refused by name',
    'field-ok': 'a known request with an unknown field is refused by name',
    'capture-unscoped': 'nothing is captured before a scope is set',
    'excluded-accepted': 'a scope naming an excluded app is refused, each by bundle id',
    'input-granted': 'before the grant, input is refused as not_granted and nothing is posted',
    'no-pause': 'a local-input report pauses: localInput arrives, then input is refused as local_input or not_granted',
    'no-exit': 'bye drops the scope and the helper exits',
  }
  for (const [breach, name] of Object.entries(BREACHES)) {
    test(`the check "${name}" fails on the breach ${breach}`, async () => {
      const check = CONFORMANCE.find((c) => c.name === name)
      assert.ok(check, name)
      assert.ok(await run(check, breach), `passed despite ${breach}`)
    })
  }
})

describe('the socket transport, as the driver serves the helper', () => {
  // A helper started by executable path: a tiny shell shim that runs the double under node with its arguments.
  async function viaSocket(check, breach = '') {
    const { mkdtempSync, writeFileSync, chmodSync, rmSync } = await import('node:fs')
    const dir = mkdtempSync('/tmp/cu-verifier-shim-')
    const shim = join(dir, 'helper')
    writeFileSync(shim, `#!/bin/sh\nexec "${process.execPath}" "${DOUBLE}" "$@"\n`)
    chmodSync(shim, 0o755)
    let helper
    try {
      helper = await startSocketHelper(shim, { env: { ...process.env, CU_DOUBLE_BREAK: breach } })
      const exits = (ms) => Promise.race([helper.exited.then(() => true), new Promise((resolve) => setTimeout(() => resolve(false), ms))])
      await check.run(helper, { exits })
      return null
    } catch (error) {
      return error
    } finally {
      await helper?.close()
      rmSync(dir, { recursive: true, force: true })
    }
  }

  test('every check holds over the socket, the token included', async () => {
    for (const check of CONFORMANCE) assert.equal((await viaSocket(check))?.message ?? null, null, check.name)
  })

  test('a hello with the wrong token fails the token check', async () => {
    const check = CONFORMANCE.find((c) => c.name === 'the hello carries back the token the launcher gave')
    assert.ok(await viaSocket(check, 'bad-token'))
  })
})
