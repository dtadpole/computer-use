import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { test } from 'node:test'

import { EnvironmentError } from '../../_environments_/chrome-browser/errors.mjs'
import { chromeArgs, PROFILE_PREFERENCES, profilePrefix, seedProfile, startChrome } from '../../_environments_/chrome-browser/launch.mjs'

// CU-808 (cu-coordinator 12:33Z): a macOS UserNotificationCenter dialog appeared on the owner's screen during a headless row
// window. The agent's Chrome must never let a notification reach macOS: the Web Notifications API off, Chrome's system
// notification bridge off, and the throwaway profile seeded with notifications blocked before Chrome starts.
const SEAT = 'cu-test-seat'
const code = (expected) => (error) => error instanceof EnvironmentError && error.code === expected

function fakeChild(stderrLines) {
  const child = new EventEmitter()
  child.stderr = new EventEmitter()
  child.exitCode = null
  child.signalCode = null
  child.killed = []
  child.kill = (signal) => { child.killed.push(signal); child.signalCode = signal; setImmediate(() => child.emit('exit', null, signal)) }
  setImmediate(() => { for (const line of stderrLines) child.stderr.emit('data', Buffer.from(line)) })
  return child
}

test('CU-808: the command line turns notifications off at the API and at the OS bridge, in one --disable-features switch', () => {
  const args = chromeArgs({ profile: '/tmp/cu-test-seat-chrome-abcdef' })
  assert.ok(args.includes('--disable-notifications'))
  assert.ok(args.includes('--deny-permission-prompts'), 'the web prompt guard stays')
  const features = args.filter((arg) => arg.startsWith('--disable-features='))
  assert.equal(features.length, 1, 'Chrome reads only the last --disable-features switch, so there must be exactly one')
  const disabled = features[0].slice('--disable-features='.length).split(',')
  for (const feature of ['SystemNotifications', 'NativeNotifications', 'Translate', 'MediaRouter', 'OptimizationHints', 'AutofillServerCommunication']) {
    assert.ok(disabled.includes(feature), feature)
  }
  assert.ok(!args.some((arg) => arg.startsWith('--enable-features=') && /Notification/.test(arg)))
})

test('CU-808: a throwaway profile is seeded with notifications blocked for every site', () => {
  const dir = mkdtempSync(profilePrefix(SEAT))
  try {
    seedProfile(dir, SEAT)
    const prefs = JSON.parse(readFileSync(`${dir}/Default/Preferences`, 'utf8'))
    assert.equal(prefs.profile.default_content_setting_values.notifications, 2)
    assert.deepEqual(prefs.profile.content_settings.exceptions.notifications, {})
    assert.deepEqual(prefs, JSON.parse(JSON.stringify(PROFILE_PREFERENCES)))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('CU-808: seeding refuses any path that is not this seat\'s throwaway profile', () => {
  const writes = []
  for (const path of ['/tmp/elsewhere', '/Users/someone/Library/Application Support/Google/Chrome', '/tmp/cu-other-seat-chrome-abcdef']) {
    assert.throws(() => seedProfile(path, SEAT, { mkdir: () => writes.push(path), write: () => writes.push(path) }), code('invalid_argument'), path)
  }
  assert.deepEqual(writes, [])
})

test('CU-808: startChrome seeds the profile before Chrome is spawned, with the notification flags', async () => {
  let atSpawn
  const running = await startChrome({
    seat: SEAT, binary: '/fake/chrome',
    spawn: (binary, args) => {
      const profile = args.find((arg) => arg.startsWith('--user-data-dir=')).slice('--user-data-dir='.length)
      atSpawn = { args, seeded: existsSync(`${profile}/Default/Preferences`) ? JSON.parse(readFileSync(`${profile}/Default/Preferences`, 'utf8')) : null }
      return fakeChild(['DevTools listening on ws://127.0.0.1:4242/devtools/browser/x\n'])
    },
  })
  try {
    assert.equal(atSpawn.seeded?.profile?.default_content_setting_values?.notifications, 2, 'seeded before spawn')
    assert.ok(atSpawn.args.includes('--disable-notifications'))
  } finally {
    await running.stop()
  }
  assert.ok(!existsSync(running.profile))
})

test('CU-808: a profile that cannot be seeded is removed and Chrome is never spawned', async () => {
  let profile
  let spawned = false
  await assert.rejects(startChrome({
    seat: SEAT, binary: '/fake/chrome',
    mkdtemp: (prefix) => (profile = mkdtempSync(prefix)),
    seed: () => { throw new Error('disk full') },
    spawn: () => { spawned = true; return fakeChild([]) },
  }), code('resource_refused'))
  assert.equal(spawned, false)
  assert.ok(!existsSync(profile))
})
