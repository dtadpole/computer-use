import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { NO_NOTIFICATION_ARGS } from '../../_environments_/chrome-browser/no-notifications.mjs'
import { openGuardedPage } from '../../_tools_/verify-kit/guarded-page.mjs'

// CU-808 (cu-developer-one's #1477 review): the verify kit's check browser and the live-view probe open Chrome through
// openGuardedPage - the profile seeded with notifications blocked before Chrome reads it, the notification switches passed.
const fakeBrowser = () => {
  const page = { pageId: 1, send: async () => ({}), navigate: async () => {}, evaluate: async () => 42, waitForExpression: async () => true, screenshot: async () => Buffer.from('') }
  return { page: () => page, close: async () => 'closed' }
}

test('CU-808: openGuardedPage seeds the profile, then opens Chrome headless with the notification switches', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cu-808-guarded-'))
  try {
    let opened
    const handle = await openGuardedPage({ profile: dir, width: 800, height: 600 }, {
      open: async (options) => {
        opened = { options, seededFirst: existsSync(`${dir}/Default/Preferences`) }
        return fakeBrowser()
      },
    })
    assert.equal(opened.seededFirst, true, 'seeded before Chrome starts')
    assert.equal(JSON.parse(readFileSync(`${dir}/Default/Preferences`, 'utf8')).profile.default_content_setting_values.notifications, 2)
    assert.equal(opened.options.headless, true)
    assert.equal(opened.options.profile, dir)
    assert.deepEqual(opened.options.args, [...NO_NOTIFICATION_ARGS])
    assert.ok(opened.options.args.includes('--disable-notifications'))
    assert.equal(opened.options.args.filter((arg) => arg.startsWith('--disable-features=')).length, 1)
    assert.equal(await handle.evaluate('6 * 7'), 42)
    assert.equal(await handle.close(), 'closed')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('CU-808: openGuardedPage refuses to start without a profile it can seed, and never opens Chrome', async () => {
  let opened = false
  await assert.rejects(openGuardedPage({}, { open: async () => { opened = true; return fakeBrowser() } }), TypeError)
  assert.equal(opened, false)
  const seedFails = openGuardedPage({ profile: '/tmp/x' }, { seed: () => { throw new Error('disk full') }, open: async () => { opened = true; return fakeBrowser() } })
  await assert.rejects(seedFails, /disk full/)
  assert.equal(opened, false)
})
