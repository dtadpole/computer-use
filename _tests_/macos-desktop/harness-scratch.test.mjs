import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { removeTree, scratch } from './harness.mjs'

// CU-390: scratch().remove must survive a process that is still exiting and writes one last file while the tree is
// removed. The writer below keeps creating dir/sub and files in it for a while, but never re-creates dir itself, so
// once dir is gone it stops (cu-verifier's probe on #436, as a test).
const WRITER = `
const fs = require('fs'), path = require('path')
const dir = process.argv[1], end = Date.now() + Number(process.argv[2])
let i = 0, started = false
while (Date.now() < end) {
  try { fs.mkdirSync(path.join(dir, 'sub')) } catch (e) { if (e.code !== 'EEXIST') { if (started) break; continue } }
  try { fs.writeFileSync(path.join(dir, 'sub', 'f' + (i++ % 40)), 'x'); if (!started) { started = true; fs.writeFileSync(path.join(dir, 'ready'), '1') } } catch { if (started && !fs.existsSync(dir)) break }
}
`

async function withWriter(ms, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'cu-scratch-test-'))
  const child = spawn(process.execPath, ['-e', WRITER, dir, String(ms)], { stdio: 'ignore' })
  const exited = new Promise((resolve) => child.once('exit', resolve))
  try {
    const deadline = Date.now() + 5000
    while (!existsSync(join(dir, 'ready')) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 5))
    assert.ok(existsSync(join(dir, 'ready')), 'the writer started')
    return await fn(dir)
  } finally {
    await exited
    rmSync(dir, { recursive: true, force: true })
  }
}

test('CU-390: removeTree removes a tree while a late writer keeps adding files for 250 ms', async () => {
  await withWriter(250, (dir) => {
    const started = Date.now()
    const attempts = removeTree(dir)
    const elapsed = Date.now() - started
    assert.equal(existsSync(dir), false, 'the tree is gone')
    // A retry really pauses: rmSync's own retryDelay did not on Node 24, giving up after ~34 ms.
    if (attempts > 1) assert.ok(elapsed >= (attempts - 1) * 90, `attempts ${attempts} took ${elapsed} ms`)
  })
})

test('CU-390: removeTree gives up after its tries and throws the writer\'s error code', async () => {
  await withWriter(1500, (dir) => {
    let thrown = null
    try { removeTree(dir, { tries: 2, delayMs: 20 }) } catch (error) { thrown = error }
    // Against a writer that outlives every try the last error surfaces; if the writer happened to pause long enough
    // for one pass, the tree is simply gone - either way nothing is swallowed silently.
    if (thrown) assert.ok(['ENOTEMPTY', 'EBUSY', 'EPERM'].includes(thrown.code), String(thrown.code))
    else assert.equal(existsSync(dir), false)
  })
})

test('CU-390: scratch().remove uses removeTree and deletes its directory', () => {
  const s = scratch()
  assert.ok(existsSync(s.dir))
  assert.equal(s.remove(), 1, 'an idle tree goes on the first try')
  assert.equal(existsSync(s.dir), false)
})
