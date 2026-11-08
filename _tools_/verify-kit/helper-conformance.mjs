/**
 * Protocol conformance checks for a desktop helper (desktop-extension 0.2), runnable against any helper the
 * helper-client can start: cu-developer-two's fake helper and the Swift helper before the owner's grant. Each check
 * throws an AssertionError on a breach. Pre-grant, nothing here sends input to any app or captures one.
 */

import assert from 'node:assert/strict'

import { CODES, helloFields } from './helper-client.mjs'

/**
 * The design's hard exclusions (app-policy.md 0.3), a trailing dot meaning a prefix: the spec the helper's table is
 * judged against, never the helper's own table.
 */
export const DESIGN_EXCLUSIONS = Object.freeze(['com.apple.Terminal', 'com.googlecode.iterm2', 'dev.warp.', 'com.mitchellh.ghostty', 'net.kovidgoyal.kitty', 'org.alacritty', 'co.zeit.hyper', 'com.github.wez.wezterm', 'com.apple.ScriptEditor2', 'com.apple.Automator', 'com.apple.shortcuts', 'com.reflection.cu-helper', 'com.openai.', 'com.1password.', 'com.agilebits.', 'com.bitwarden.desktop', 'org.keepassxc.keepassxc', 'com.apple.Passwords', 'com.apple.keychainaccess', 'com.apple.systempreferences', 'com.apple.SecurityAgent', 'com.apple.LocalAuthentication.UIAgent', 'com.apple.loginwindow', 'com.apple.UserNotificationCenter',
  // CU-264: whole-Mac tools (app-policy.md's OS security row).
  'com.apple.DiskUtility', 'com.apple.bootcampassistant', 'com.apple.MigrateAssistant', 'com.apple.backup.launcher', 'com.apple.TimeMachine', 'com.apple.ActivityMonitor',
  // CU-292: launchers, password managers, a clipboard manager and another AI app (app-policy.md's rows).
  'com.apple.Spotlight', 'at.obdev.LaunchBar', 'in.sinew.', 'me.proton.pass', 'com.keepersecurity.', 'com.wiheads.', 'ai.perplexity.'])
/** One concrete bundle id per entry (prefix entries get a realistic id), so every kind is asked about. */
export const EXCLUDED_SAMPLE = Object.freeze(DESIGN_EXCLUSIONS.map((entry) => ({ 'dev.warp.': 'dev.warp.Warp-Stable', 'com.openai.': 'com.openai.chat', 'com.1password.': 'com.1password.1password', 'com.agilebits.': 'com.agilebits.onepassword7', 'in.sinew.': 'in.sinew.Enpass-Desktop.App', 'com.keepersecurity.': 'com.keepersecurity.passwordmanager', 'com.wiheads.': 'com.wiheads.paste', 'ai.perplexity.': 'ai.perplexity.macv3' })[entry] ?? entry))
export const FIXTURE_ID = 'ai.reflection.cu.fixture'

const refused = (reply, code, what) => {
  assert.equal(reply.ok, false, `${what}: answered ok`)
  assert.equal(reply.code, code, `${what}: code ${reply.code}, expected ${code}`)
  assert.ok(CODES.includes(reply.code), `${what}: ${reply.code} is not a protocol code`)
}

/** A valid low-level step and input request (input-plan.mjs, Protocol.swift): only the grant or the pause may refuse it. */
const MOVE = Object.freeze({ events: [{ kind: 'move', x: 10, y: 10, flags: 0 }], mode: 'global', bundleId: FIXTURE_ID })
const MAX_SIZE = Object.freeze({ width: 1024, height: 640 })

/**
 * `{ name, milestone, run(helper, { exits }) }`; `exits()` resolves when the helper process has gone. `milestone` is
 * where the design puts the behaviour (M8: the local-input pause), so an M7 acceptance can run the M7 checks alone.
 */
export const CONFORMANCE = Object.freeze([
  {
    milestone: 'M7',
    name: 'the opening hello names protocol 1, the helper version, each grant and the displays',
    run: async (helper) => {
      const hello = helloFields(helper.hello)
      assert.equal(hello.protocol, 1)
      assert.equal(typeof hello.helperVersion, 'string')
      // The final names (desktop-extension 0.3.1), each from a preflight only.
      for (const grant of ['screen', 'accessibility', 'postEvents', 'listenEvents']) assert.equal(typeof hello.grants?.[grant], 'boolean', `grant ${grant}`)
      assert.ok(Array.isArray(hello.displays), 'displays')
    },
  },
  {
    milestone: 'M7',
    name: 'the hello carries back the token the launcher gave',
    run: async (helper) => {
      if (helper.token === undefined) return // stdio double without a token
      assert.equal(helloFields(helper.hello).token, helper.token)
    },
  },
  {
    milestone: 'M7',
    name: 'an unknown request is refused by name',
    run: async (helper) => refused(await helper.request('teleport', {}), 'unknown_request', 'teleport'),
  },
  {
    milestone: 'M7',
    name: 'a known request with an unknown field is refused by name',
    run: async (helper) => refused(await helper.request('scope', { bundleIds: [FIXTURE_ID], everything: true }), 'unknown_field', 'scope with everything'),
  },
  {
    milestone: 'M7',
    name: 'nothing is captured before a scope is set',
    run: async (helper) => {
      const reply = await helper.request('capture', { maxSize: MAX_SIZE })
      // Without the screen grant, not_granted refuses it as well; with the grant, only no_scope may.
      const allowed = helloFields(helper.hello).grants?.screen === true ? ['no_scope'] : ['no_scope', 'not_granted']
      assert.equal(reply.ok, false, 'capture before scope: answered ok')
      assert.ok(allowed.includes(reply.code), `capture before scope: code ${reply.code}, expected ${allowed.join(' or ')}`)
    },
  },
  {
    milestone: 'M7',
    name: 'a scope naming an excluded app is refused, each by bundle id',
    run: async (helper) => {
      const accepted = []
      for (const bundleId of EXCLUDED_SAMPLE) {
        const reply = await helper.request('scope', { bundleIds: [FIXTURE_ID, bundleId] })
        if (reply.ok !== false || reply.code !== 'excluded') accepted.push(`${bundleId} (${reply.ok ? 'ok' : reply.code})`)
      }
      assert.deepEqual(accepted, [], `not refused as excluded: ${accepted.join(', ')}`)
    },
  },
  {
    milestone: 'M7',
    name: 'before the grant, input is refused as not_granted and nothing is posted',
    run: async (helper) => {
      if (helloFields(helper.hello).grants?.accessibility === true) return // granted: judged by the fixture's input log instead
      const scoped = await helper.request('scope', { bundleIds: [FIXTURE_ID] })
      assert.equal(scoped.ok, true, `scope ${scoped.code ?? ''}`)
      refused(await helper.request('input', MOVE), 'not_granted', 'input before the grant')
    },
  },
  {
    milestone: 'M8',
    name: 'a local-input report pauses: localInput arrives, then input is refused as local_input or not_granted',
    run: async (helper) => {
      await helper.request('scope', { bundleIds: [FIXTURE_ID] })
      const armed = await helper.request('pauseOnLocalInput', { on: true })
      assert.equal(armed.ok, true, `pauseOnLocalInput ${armed.code ?? ''}`)
      // via 'idle' needs no grant (the HID idle counter); 'tap' and 'untagged' need listen and post access by design.
      const simulated = await helper.request('simulateLocalInput', { kind: 'key', via: 'idle' })
      assert.equal(simulated.ok, true, `simulateLocalInput ${simulated.code ?? ''}`)
      const event = await helper.waitForEvent((e) => e.event === 'localInput')
      assert.ok(event, 'no localInput event')
      assert.equal(event.kind, 'key')
      // `at` is an ISO 8601 timestamp (both helpers and the driver), and it is now.
      assert.equal(typeof event.at, 'string', `at is ${typeof event.at}`)
      assert.ok(Math.abs(Date.parse(event.at) - Date.now()) < 60_000, `at ${event.at} is not now`)
      const after = await helper.request('input', MOVE)
      assert.equal(after.ok, false, 'input was accepted after local input')
      assert.ok(['local_input', 'not_granted'].includes(after.code), `code ${after.code}`)
    },
  },
  {
    milestone: 'M7',
    name: 'bye drops the scope and the helper exits',
    run: async (helper, { exits }) => {
      helper.request('bye', {}).catch(() => {})
      assert.equal(await exits(3000), true, 'the helper kept running after bye')
    },
  },
])
