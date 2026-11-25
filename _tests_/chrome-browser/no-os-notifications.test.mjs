import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
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

// cu-developer-one's #1477 review: every Chrome a [cu] job starts carries the protections. The agent's Chrome starts in
// launch.mjs; the only other launcher is the vendored one, which only verify-kit/guarded-page.mjs may open.
const ROOT = fileURLToPath(new URL('../../', import.meta.url))
function sources(dir = ROOT, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules', '_vendor_', '_tests_'].includes(entry.name)) continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) sources(path, out)
    else if (/\.(?:mjs|js|cjs)$/.test(entry.name)) out.push(path)
  }
  return out
}

test('CU-808: no module but verify-kit/guarded-page.mjs opens a vendored Chrome; the check browser and the live probe go through it', () => {
  const launchers = sources().filter((path) => {
    const text = readFileSync(path, 'utf8')
    return /import\s*\{[^}]*\b(?:openPage|openBrowser|launchChrome)\b[^}]*\}\s*from\s*'[^']*_vendor_\/browser-use\//.test(text)
  }).map((path) => relative(ROOT, path))
  assert.deepEqual(launchers, ['_tools_/verify-kit/guarded-page.mjs'])
  assert.match(readFileSync(join(ROOT, '_tools_/verify-kit/check-browser.mjs'), 'utf8'), /open = openGuardedPage,/)
  assert.match(readFileSync(join(ROOT, '_tools_/live-view/live-probe.mjs'), 'utf8'), /await openGuardedPage\(\{ profile \}\)/)
  const guarded = readFileSync(join(ROOT, '_tools_/verify-kit/guarded-page.mjs'), 'utf8')
  assert.match(guarded, /seed\(options\.profile\)/)
  assert.match(guarded, /args: \[\.\.\.NO_NOTIFICATION_ARGS\]/)
})

test('CU-808: no other module spawns a Chrome binary', () => {
  // A module that names a Chrome executable path and spawns: only the agent's own launcher may.
  const spawners = sources().filter((path) => /Contents\/MacOS\/(?:Google Chrome|Chromium)|\/usr\/bin\/(?:google-chrome|chromium)/.test(readFileSync(path, 'utf8')) && /\bspawn\(|\bexecFile\(/.test(readFileSync(path, 'utf8')))
    .map((path) => relative(ROOT, path))
  assert.deepEqual(spawners, ['_environments_/chrome-browser/launch.mjs'])
})
