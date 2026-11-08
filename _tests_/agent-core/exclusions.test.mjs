import assert from 'node:assert/strict'
import { test } from 'node:test'

import { EXCLUDED_APPS, ExclusionConfigError, LIVE_VIEW_TITLE_MARKER, createExclusions } from '../../_tools_/agent-core/exclusions.mjs'

test('every table entry is excluded with its kind; prefixes cover their family; case does not matter', () => {
  const { isExcludedApp } = createExclusions()
  for (const { kind, ids } of EXCLUDED_APPS) {
    for (const pattern of ids) {
      const id = pattern.endsWith('.*') ? `${pattern.slice(0, -2)}.Example-App` : pattern
      assert.deepEqual([isExcludedApp(id).excluded, isExcludedApp(id).kind], [true, kind], id)
      assert.equal(isExcludedApp(id.toUpperCase()).excluded, true, `${id} upper case`)
    }
  }
  assert.equal(isExcludedApp('com.openai.chat').kind, 'agent')
  assert.equal(isExcludedApp('dev.warp.Warp-Stable').kind, 'terminal')
  assert.equal(isExcludedApp('com.1password.1password').kind, 'password_manager')
  assert.equal(isExcludedApp('com.reflection.cu-helper').kind, 'agent', 'the helper itself is never a target')
  assert.equal(isExcludedApp('com.apple.systempreferences').kind, 'os_security', 'System Settings whole (D-025)')
})

test('approvable apps pass; lookalikes of a prefix do not match; an unknown app fails closed', () => {
  const { isExcludedApp } = createExclusions()
  for (const id of ['ai.reflection.cu.fixture', 'com.apple.TextEdit', 'com.apple.finder', 'com.google.Chrome', 'com.openaiish.app', 'dev.warpdrive.app']) {
    assert.equal(isExcludedApp(id).excluded, false, id)
  }
  assert.deepEqual(isExcludedApp(null), { excluded: true, kind: 'unknown', rule: 'no bundle id' })
  assert.equal(isExcludedApp('').excluded, true)
})

test('E3, E2: a listed id excludes its children too; surrounding whitespace does not slip past; lookalikes still pass', () => {
  const { isExcludedApp } = createExclusions()
  assert.deepEqual([isExcludedApp('com.apple.Terminal.helper').excluded, isExcludedApp('com.apple.Terminal.helper').kind], [true, 'terminal'])
  assert.equal(isExcludedApp('COM.APPLE.TERMINAL.Helper.Sub').kind, 'terminal')
  assert.deepEqual(isExcludedApp('com.apple.Passwords.MenuBarExtra'), { excluded: true, kind: 'password_manager', rule: 'com.apple.Passwords' })
  for (const id of ['  com.apple.Terminal', 'com.apple.Terminal\n', '\tcom.1password.1password ']) assert.equal(isExcludedApp(id).excluded, true, JSON.stringify(id))
  for (const id of ['com.apple.TerminalX', 'com.apple.Terminal-helper', 'com.apple.installerx', 'com.nordsec.nordpassword']) assert.equal(isExcludedApp(id).excluded, false, id)
  const ex = createExclusions({ extra: ['ai.reflection.cu.ledger'] })
  assert.equal(ex.isExcludedApp('ai.reflection.cu.ledger.helper').kind, 'config', 'a config entry covers its children as well')
})

test('E6, E7, E8, E11: other agents and app shims, OS installers, more password managers, clipboard managers', () => {
  const { isExcludedApp } = createExclusions()
  const cases = {
    agent: ['com.anthropic.claudefordesktop', 'com.google.Chrome.app.abcdefghijklmnop', 'com.microsoft.edgemac.app.abcdefghijklmnop'],
    os_security: ['com.apple.coreservices.uiagent', 'com.apple.installer'],
    password_manager: ['com.dashlane.dashlanephonefinal', 'com.lastpass.lastpassmacdesktop', 'com.nordsec.nordpass'],
    clipboard_manager: ['org.p0deje.Maccy', 'com.clipy-app.Clipy', 'com.tapbots.Pastebot2Mac', 'com.tapbots.Pastebot3Mac'],
  }
  for (const [kind, ids] of Object.entries(cases)) for (const id of ids) assert.equal(isExcludedApp(id).kind, kind, id)
  for (const id of ['com.google.Chrome', 'com.microsoft.edgemac', 'com.google.Chrome.canary']) assert.equal(isExcludedApp(id).excluded, false, `${id}: the browser itself stays approvable`)
  // Every built-in entry keeps the grammar config entries must follow: an exact id or a 'prefix.*'.
  for (const { ids } of EXCLUDED_APPS) for (const id of ids) assert.match(id, /^[A-Za-z0-9][A-Za-z0-9.-]*(\.\*)?$/, id)
})

test('run config can only add entries, which are recorded; malformed entries are refused', () => {
  const ex = createExclusions({ extra: ['ai.reflection.cu.ledger', 'org.example.*'] })
  assert.deepEqual(ex.added, ['ai.reflection.cu.ledger', 'org.example.*'])
  assert.deepEqual([ex.isExcludedApp('ai.reflection.cu.ledger').excluded, ex.isExcludedApp('ai.reflection.cu.ledger').kind], [true, 'config'])
  assert.equal(ex.isExcludedApp('org.example.tool').excluded, true)
  assert.equal(ex.isExcludedApp('com.apple.Terminal').kind, 'terminal', 'built-in entries stay')
  for (const bad of ['', 'not a bundle', '*', 42]) assert.throws(() => createExclusions({ extra: [bad] }), ExclusionConfigError)
})

test('windows: our live view by title marker, our UI and DSH by fixed-deny loopback URL, excluded apps by bundle id', () => {
  const { isExcludedWindow } = createExclusions()
  assert.equal(isExcludedWindow({ bundleId: 'com.google.Chrome', title: `${LIVE_VIEW_TITLE_MARKER} run 20261102` }).kind, 'live_view')
  assert.equal(isExcludedWindow({ bundleId: 'com.google.Chrome', title: 'DSH', url: 'http://127.0.0.1:3080/' }).kind, 'own_ui')
  assert.equal(isExcludedWindow({ bundleId: 'com.google.Chrome', title: 'Gateway', url: 'http://localhost:8088/v1' }).kind, 'own_ui')
  assert.equal(isExcludedWindow({ bundleId: 'com.apple.Terminal', title: 'zsh' }).kind, 'terminal')
  assert.equal(isExcludedWindow({ bundleId: 'com.google.Chrome', title: 'Docs', url: 'https://example.com/' }).excluded, false)
  assert.equal(isExcludedWindow({ bundleId: 'ai.reflection.cu.fixture', title: 'CU Fixture' }).excluded, false)
})

test('launchers that run arbitrary apps and commands are excluded', () => {
  const { isExcludedApp } = createExclusions()
  for (const id of ['com.runningwithcrayons.Alfred', 'com.raycast.macos']) assert.equal(isExcludedApp(id).excluded, true, id)
})

