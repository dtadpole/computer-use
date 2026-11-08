import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createExclusions } from '../../_tools_/agent-core/exclusions.mjs'

// CU-292 (cu-researcher): seven notable apps of kinds the owner's guide promises are never acted in, with their public ids.
const { isExcludedApp } = createExclusions()
const kindOf = (id) => isExcludedApp(id).kind

test('CU-292: launchers, password managers, a clipboard manager and another AI app are excluded by kind', () => {
  const expected = {
    'com.apple.Spotlight': 'terminal', 'at.obdev.LaunchBar': 'terminal',
    'in.sinew.Enpass-Desktop.App': 'password_manager', 'in.sinew.Enpass-Desktop': 'password_manager',
    'me.proton.pass.electron': 'password_manager', 'com.keepersecurity.passwordmanager': 'password_manager',
    'com.wiheads.paste': 'clipboard_manager', 'com.wiheads.paste-direct': 'clipboard_manager',
    'ai.perplexity.macv3': 'agent', 'ai.perplexity.mac': 'agent',
  }
  for (const [id, kind] of Object.entries(expected)) {
    assert.equal(isExcludedApp(id).excluded, true, id)
    assert.equal(kindOf(id), kind, id)
  }
})

test('CU-292 negatives: neighbours by prefix stay approvable (Little Snitch shares LaunchBar\'s maker; Proton Mail is not Proton Pass; Console stays)', () => {
  for (const id of ['at.obdev.littlesnitch', 'ch.protonmail.desktop', 'me.proton.mail', 'com.apple.Console', 'com.apple.finder', 'ai.reflection.cu.fixture']) {
    assert.equal(isExcludedApp(id).excluded, false, id)
  }
})
