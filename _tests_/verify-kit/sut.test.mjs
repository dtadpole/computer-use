import assert from 'node:assert/strict'
import { existsSync, lstatSync, mkdtempSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, test } from 'node:test'

import { DEFAULT_SUT_ROOT, SUT_FOLDERS, applyMutation, cleanEnvironment, createMutant, isLoaderVariable, isMutantDir, loadSut, removeMutant, sutRoot } from '../../_tools_/verify-kit/sut.mjs'

describe('choosing the system under test', () => {
  test('CU_VERIFY_SUT picks the root, else this tree', () => {
    assert.equal(sutRoot({}), DEFAULT_SUT_ROOT)
    assert.equal(sutRoot({ CU_VERIFY_SUT: '/tmp/cu-verifier-mutant-AbC123/x/' }), '/tmp/cu-verifier-mutant-AbC123/x')
    assert.ok(existsSync(join(DEFAULT_SUT_ROOT, '_tools_/agent-core/lib.mjs')))
  })

  test('loadSut imports agent-core and the driver through their public files', async () => {
    const sut = await loadSut(DEFAULT_SUT_ROOT)
    assert.equal(typeof sut.lib.runTask, 'function')
    assert.equal(typeof sut.lib.resourceGate, 'function')
    assert.equal(typeof sut.launchBrowserEnvironment, 'function')
    assert.ok(sut.cli.endsWith('_tools_/agent-core/cli.mjs'))
  })
})

describe('mutations', () => {
  test('applyMutation replaces exactly one occurrence, literally', () => {
    assert.equal(applyMutation('a $& b', { find: '$&', replace: '$1' }), 'a $1 b')
    assert.throws(() => applyMutation('a a', { find: 'a', replace: 'b' }, 'm'), /m: expected exactly one occurrence of the find text, found 2/)
    assert.throws(() => applyMutation('x', { find: 'a', replace: 'b' }), /found 0/)
  })

  test('isMutantDir accepts only the mutant shape', () => {
    assert.equal(isMutantDir('/tmp/cu-verifier-mutant-AbC123'), true)
    for (const path of ['/tmp', '/tmp/cu-verifier-mutant-', '/tmp/cu-verifier-mutant-AbC123/x', '/tmp/cu-verifier-chrome-AbC123', 'tmp/cu-verifier-mutant-AbC123', undefined]) {
      assert.equal(isMutantDir(path), false, String(path))
    }
    let called = false
    assert.throws(() => removeMutant('/tmp', () => (called = true)), /refusing/)
    assert.equal(called, false)
  })

  test('a mutant copies the code under test, mutates only the copy, links _vendor_, and cleans up', async () => {
    const file = '_environments_/chrome-browser/launch.mjs'
    const find = "'--headless=new',"
    const mutant = createMutant({ mutations: [{ file, find, replace: "'--headless=new', '--mutated',"}] })
    try {
      assert.equal(isMutantDir(mutant.dir), true)
      // Every folder of the code under test that exists is copied; one not landed yet (macos-desktop) is skipped.
      for (const folder of SUT_FOLDERS) assert.equal(existsSync(join(mutant.sutRoot, folder)), existsSync(join(DEFAULT_SUT_ROOT, folder)), folder)
      assert.ok(readFileSync(join(mutant.sutRoot, file), 'utf8').includes("'--mutated'"))
      assert.ok(!readFileSync(join(DEFAULT_SUT_ROOT, file), 'utf8').includes("'--mutated'"), 'the real tree must not change')
      const link = join(mutant.dir, '_vendor_')
      assert.ok(lstatSync(link).isSymbolicLink())
      assert.ok(existsSync(join(link, 'browser-use/cdp.mjs')))
      const sut = await loadSut(mutant.sutRoot)
      assert.equal(typeof sut.launchBrowserEnvironment, 'function', 'the mutant imports resolve')
    } finally {
      mutant.cleanup()
    }
    assert.equal(existsSync(mutant.dir), false)
    assert.ok(existsSync(join(DEFAULT_SUT_ROOT, '_vendor_/browser-use/cdp.mjs')), 'cleanup must not follow the link into _vendor_')
  })

  test('a mutation that does not apply removes the half-built mutant and says why', () => {
    let made
    assert.throws(
      () => createMutant({ mutations: [{ file: '_environments_/chrome-browser/launch.mjs', find: 'no such text', replace: '' }], make: (prefix) => (made = mkdtempSync(prefix)) }),
      /found 0/,
    )
    assert.ok(made && !existsSync(made), 'the half-built mutant was left behind')
  })

  test('a mutation outside the copied folders is refused', () => {
    assert.throws(() => createMutant({ mutations: [{ file: '_tools_/fixture-site/server.mjs', find: 'x', replace: 'y' }] }), /outside the copied folders/)
  })
})

test('cleanEnvironment drops exactly the variables that load other code', () => {
  const env = { PATH: '/bin', HOME: '/h', NODE_ENV: 'test', NODE_PATH: 'x', NODE_OPTIONS: '--require=y', DYLD_INSERT_LIBRARIES: 'z', LD_PRELOAD: 'w', NODE_REPL_EXTERNAL_MODULE: 'v', NODE_ICU_DATA: 'u' }
  assert.deepEqual(cleanEnvironment(env), { PATH: '/bin', HOME: '/h', NODE_ENV: 'test' })
  assert.equal(isLoaderVariable('NODE_ENV'), false)
  assert.equal(isLoaderVariable('DYLD_LIBRARY_PATH'), true)
})
