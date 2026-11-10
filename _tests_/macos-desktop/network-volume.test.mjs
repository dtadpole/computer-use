import assert from 'node:assert/strict'
import { after, test } from 'node:test'

import { networkVolumeOf } from '../../_environments_/macos-desktop/environment.mjs'
import { fakeLauncher, logged, scratchLocks, stopFake } from './harness.mjs'

// CU-392: a drop target whose AXURL names a server or network share carries networkVolume: true - a boolean only; the
// URL itself never reaches the target (url stays null for a non-file scheme).

test('CU-392: networkVolumeOf - server schemes true; file, web, malformed and non-strings false', () => {
  for (const url of ['smb://fileserver.local/share', 'SMB://nas.example/x', 'afp://nas/Public', 'nfs://host/export', 'ftp://host/', 'cifs://h/s', 'webdav://h/', 'davs://h/x'])
    assert.equal(networkVolumeOf(url), true, url)
  for (const url of ['file:///Volumes/share/', 'https://example.com/', 'mailto:a@b.c', 'smbx://h', 'not a url', '', null, undefined, 7])
    assert.equal(networkVolumeOf(url), false, String(url))
})

const FINDER = 'com.apple.finder'
const locks = scratchLocks()
after(() => locks.remove())
const launchOnFake = fakeLauncher(locks, { apps: [FINDER] })
const ROW = { bundleId: FINDER, pid: 701, role: 'AXRow', subrole: null, title: 'fileserver.local', frame: { x: 20, y: 100, width: 200, height: 22 }, secure: false, editable: false }
const world = (value) => ({
  displays: [{ id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 800, height: 600 }, scale: 1 }],
  apps: [{ bundleId: FINDER, pid: 701, title: 'Network', rect: { x: 0, y: 0, width: 800, height: 600 } }],
  frontmost: FINDER,
  elements: [{ rect: value.frame, element: value }],
  focused: value,
})

async function hit(value) {
  const { env, child } = await launchOnFake(world(value))
  try {
    await logged(child, 3)
    return await env.inspectPoint({ x: 50, y: 110 })
  } finally {
    await env.close()
    await stopFake(child)
  }
}

test('CU-392: a server row carries networkVolume and no URL; a local folder carries neither flag nor server URL', async () => {
  const server = await hit({ ...ROW, url: 'smb://fileserver.local/share' })
  assert.deepEqual([server.networkVolume, server.url], [true, null])
  const local = await hit({ ...ROW, title: 'Projects', url: 'file:///tmp/cu-fixture-sandbox/Projects/' })
  assert.deepEqual([local.networkVolume, local.url], [undefined, 'Projects/'])
})
