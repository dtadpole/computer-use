import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { realpathSync } from 'node:fs'
import { PassThrough } from 'node:stream'
import { test } from 'node:test'

import { EnvironmentError } from '../../_environments_/macos-desktop/errors.mjs'
import {
  BUNDLE_ID, CODE_LOADING_ENV, defaultBundlePath, driverIdentity, driverLaunchProblems, helperOpenArgs, launchHelper, OPEN_BINARY, openEnv,
} from '../../_environments_/macos-desktop/launch.mjs'

/**
 * Launch is tested through its `spawn` seam only: no test ever runs `open`, and nothing here can start CUHelper.app.
 */

const code = (expected) => (error) => error instanceof EnvironmentError && error.code === expected
const paths = {
  bundlePath: '/cu/helper/CUHelper.app', socketPath: '/cu/run/helper-abc123/helper.sock', tokenPath: '/cu/run/helper-abc123/token',
  driverNode: '/opt/node/bin/node', driverEntry: '/Users/x/computer-use/_tools_/agent-core/cli.mjs',
}

/** A fake `spawn` that records its call and exits with `exitCode` on the next tick. */
function fakeSpawn({ exitCode = 0, stderr = '', error = null, hang = false } = {}) {
  const calls = []
  const spawn = (command, args, options) => {
    calls.push({ command, args, options })
    const child = new EventEmitter()
    child.stderr = new PassThrough()
    child.kill = () => { child.killed = true }
    if (!hang) {
      setImmediate(() => {
        if (error) return child.emit('error', error)
        if (stderr) child.stderr.write(stderr)
        child.emit('exit', exitCode, null)
      })
    }
    return child
  }
  return { spawn, calls }
}

test('the open arguments are exactly the design\'s LaunchServices call, the driver named as the helper expects', () => {
  // helper-and-protocol.md: open -g -n -a CUHelper.app --args --socket <path> --token-file <path> --driver-node <path> --driver-entry <path>
  assert.deepEqual(helperOpenArgs(paths), [
    '-g', '-n', '-a', '/cu/helper/CUHelper.app', '--args', '--socket', '/cu/run/helper-abc123/helper.sock', '--token-file', '/cu/run/helper-abc123/token',
    '--driver-node', '/opt/node/bin/node', '--driver-entry', '/Users/x/computer-use/_tools_/agent-core/cli.mjs',
  ])
  assert.equal(OPEN_BINARY, '/usr/bin/open')
  assert.equal(BUNDLE_ID, 'com.reflection.cu-helper')
  assert.equal(defaultBundlePath('/Users/x/.computer-use'), '/Users/x/.computer-use/helper/CUHelper.app')
})

test('only absolute paths and a bundle named CUHelper.app are accepted', () => {
  assert.throws(() => helperOpenArgs({ ...paths, bundlePath: 'CUHelper.app' }), code('invalid_argument'))
  assert.throws(() => helperOpenArgs({ ...paths, bundlePath: '/Applications/Terminal.app' }), code('invalid_argument'))
  assert.throws(() => helperOpenArgs({ ...paths, socketPath: 'run/helper.sock' }), code('invalid_argument'))
  assert.throws(() => helperOpenArgs({ ...paths, tokenPath: '/cu/token\n--evil' }), code('invalid_argument'))
  assert.throws(() => defaultBundlePath('relative'), code('invalid_argument'))
  // The helper requires both driver arguments whenever it checks its peer, so they are never left out.
  for (const name of ['driverNode', 'driverEntry']) {
    assert.throws(() => helperOpenArgs({ ...paths, [name]: undefined }), code('invalid_argument'), name)
    assert.throws(() => helperOpenArgs({ ...paths, [name]: 'relative/node' }), code('invalid_argument'), name)
    assert.throws(() => helperOpenArgs({ ...paths, [name]: '/a\0b' }), code('invalid_argument'), name)
  }
})

test('enforceBoundary adds --enforce-boundary, and lockPath --lock-path only with it (the helper refuses it alone)', () => {
  const tail = (args) => args.slice(args.indexOf('--driver-entry') + 2)
  assert.deepEqual(tail(helperOpenArgs(paths)), [], 'no boundary flags unless asked')
  assert.deepEqual(tail(helperOpenArgs({ ...paths, enforceBoundary: false })), [])
  assert.deepEqual(tail(helperOpenArgs({ ...paths, enforceBoundary: true })), ['--enforce-boundary'])
  assert.deepEqual(tail(helperOpenArgs({ ...paths, enforceBoundary: true, lockPath: '/tmp/cu-check/helper.lock' })), ['--enforce-boundary', '--lock-path', '/tmp/cu-check/helper.lock'])
  assert.throws(() => helperOpenArgs({ ...paths, lockPath: '/tmp/cu-check/helper.lock' }), code('invalid_argument'))
  assert.throws(() => helperOpenArgs({ ...paths, enforceBoundary: false, lockPath: '/tmp/cu-check/helper.lock' }), code('invalid_argument'))
  assert.throws(() => helperOpenArgs({ ...paths, enforceBoundary: true, lockPath: 'helper.lock' }), code('invalid_argument'))
  assert.throws(() => helperOpenArgs({ ...paths, enforceBoundary: 'yes' }), code('invalid_argument'))
})

test('driverIdentity: the real paths of the node binary and the entry script running this process', () => {
  const self = driverIdentity()
  assert.deepEqual(self, { driverNode: realpathSync(process.execPath), driverEntry: realpathSync(process.argv[1]) })
  // Real paths, through a symlink: the helper's entry-point list holds real paths.
  const seen = []
  const realpath = (path) => { seen.push(path); return `/real${path}` }
  assert.deepEqual(driverIdentity({ execPath: '/usr/local/bin/node', argv: ['/usr/local/bin/node', '/link/cli.mjs', 'run'], realpath }), { driverNode: '/real/usr/local/bin/node', driverEntry: '/real/link/cli.mjs' })
  assert.deepEqual(seen, ['/usr/local/bin/node', '/link/cli.mjs'])
  // No script (node -e, a REPL), or one that does not resolve, cannot be named.
  for (const argv of [['/usr/local/bin/node'], ['/usr/local/bin/node', '-e'], ['/usr/local/bin/node', '']]) {
    assert.throws(() => driverIdentity({ argv, realpath }), code('invalid_argument'), JSON.stringify(argv))
  }
  assert.throws(() => driverIdentity({ argv: ['/n', '/gone.mjs'], realpath: (path) => { if (path === '/gone.mjs') throw new Error('ENOENT'); return path } }), code('invalid_argument'))
})

test('driverLaunchProblems names what a peer-checking helper refuses: code-loading variables by name, node options by count', () => {
  assert.deepEqual(CODE_LOADING_ENV, ['DYLD_', 'LD_', 'NODE_OPTIONS', 'NODE_PATH', 'NODE_REPL_EXTERNAL_MODULE', 'NODE_ICU_DATA'])
  const env = { PATH: '/usr/bin', NODE_OPTIONS: '--require /tmp/x.js', DYLD_INSERT_LIBRARIES: '/tmp/evil.dylib', LD_PRELOAD: 'x', NODE_PATH: '/x', NODE_ENV: 'test', HOME: '/Users/x', NODE_ICU_DATA: '/i' }
  const problems = driverLaunchProblems({ env, execArgv: ['--import', '/tmp/x.mjs'] })
  assert.deepEqual(problems, { environment: ['DYLD_INSERT_LIBRARIES', 'LD_PRELOAD', 'NODE_ICU_DATA', 'NODE_OPTIONS', 'NODE_PATH'], nodeOptions: 2 })
  assert.equal(JSON.stringify(problems).includes('/tmp'), false, 'never a value')
  assert.deepEqual(driverLaunchProblems({ env: { PATH: '/usr/bin', NODE_ENV: 'x' }, execArgv: [] }), { environment: [], nodeOptions: 0 })
})

test('launchHelper runs open through the seam with a minimal environment', async () => {
  const { spawn, calls } = fakeSpawn()
  const result = await launchHelper({ ...paths, spawn, env: { HOME: '/Users/x', SECRET_KEY: 'k', PATH: '/opt/bin' } })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].command, '/usr/bin/open')
  assert.deepEqual(calls[0].args, helperOpenArgs(paths))
  assert.deepEqual(calls[0].options.env, { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', HOME: '/Users/x', LANG: 'en_US.UTF-8' })
  assert.equal(calls[0].options.env.SECRET_KEY, undefined)
  assert.deepEqual(result, { command: '/usr/bin/open', args: helperOpenArgs(paths) })
  assert.deepEqual(openEnv({}), { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', LANG: 'en_US.UTF-8' })
  // Without the driver paths, launchHelper names this very process; the boundary flags pass through.
  const own = fakeSpawn()
  const { bundlePath, socketPath, tokenPath } = paths
  await launchHelper({ bundlePath, socketPath, tokenPath, spawn: own.spawn, enforceBoundary: true, lockPath: '/tmp/cu-check/helper.lock' })
  assert.deepEqual(own.calls[0].args.slice(9), ['--driver-node', realpathSync(process.execPath), '--driver-entry', realpathSync(process.argv[1]), '--enforce-boundary', '--lock-path', '/tmp/cu-check/helper.lock'])
  await assert.rejects(launchHelper({ bundlePath, socketPath, tokenPath, spawn: own.spawn, lockPath: '/tmp/cu-check/helper.lock' }), code('invalid_argument'))
  assert.equal(own.calls.length, 1, 'a refused argument never reaches spawn')
})

test('an open that fails, errors or hangs is helper_lost, without the path in the details', async () => {
  const failing = fakeSpawn({ exitCode: 1, stderr: 'Unable to find application named /cu/helper/CUHelper.app\n' })
  await assert.rejects(launchHelper({ ...paths, spawn: failing.spawn }), (e) => code('helper_lost')(e) && !e.details.stderr.includes('/cu/'))
  const erroring = fakeSpawn({ error: Object.assign(new Error('nope'), { code: 'ENOENT' }) })
  await assert.rejects(launchHelper({ ...paths, spawn: erroring.spawn }), (e) => code('helper_lost')(e) && /ENOENT/.test(e.message))
  const hanging = fakeSpawn({ hang: true })
  await assert.rejects(launchHelper({ ...paths, spawn: hanging.spawn, timeoutMs: 20 }), code('helper_lost'))
  const throwing = () => { throw Object.assign(new Error('x'), { code: 'EACCES' }) }
  await assert.rejects(launchHelper({ ...paths, spawn: throwing }), code('helper_lost'))
})

test('heldMarkerPath adds --held-marker <abs path> last (CU-94): a check under a private CU_HOME keeps its held-keys marker there', () => {
  const tail = (args) => args.slice(args.indexOf('--driver-entry') + 2)
  assert.deepEqual(tail(helperOpenArgs(paths)), [], 'unset: the helper keeps its default marker')
  assert.deepEqual(tail(helperOpenArgs({ ...paths, heldMarkerPath: '/tmp/cu-g1/home/user/held-keys.json' })), ['--held-marker', '/tmp/cu-g1/home/user/held-keys.json'])
  assert.deepEqual(tail(helperOpenArgs({ ...paths, enforceBoundary: true, heldMarkerPath: '/tmp/m.json' })), ['--enforce-boundary', '--held-marker', '/tmp/m.json'])
  for (const bad of ['held-keys.json', '/a\nb', 7]) assert.throws(() => helperOpenArgs({ ...paths, heldMarkerPath: bad }), code('invalid_argument'), String(bad))
})
