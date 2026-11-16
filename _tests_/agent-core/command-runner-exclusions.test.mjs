import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createExclusions } from '../../_tools_/agent-core/exclusions.mjs'

// CU-575 (cu-researcher 06:06Z): apps that run commands are hard-excluded like Terminal, Automator and Shortcuts - SSH clients, terminal
// emulators and script / macro automation; ordinary apps stay approvable.
const { isExcludedApp } = createExclusions()

test('CU-575: SSH clients, terminal emulators and command / script automation are excluded as terminals', () => {
  for (const id of ['com.termius-dmg.mac', 'com.stairways.keyboardmaestro.editor', 'com.stairways.keyboardmaestro.engine', 'org.hammerspoon.Hammerspoon', 'com.vandyke.SecureCRT', 'com.lemonmojo.RoyalTSX.App', 'org.tabby',
    'dev.commandline.waveterm', 'com.raphaelamorim.rio', 'com.hegenberg.BetterTouchTool', 'com.latenightsw.ScriptDebugger8', 'com.peterborgapps.LingonX9', 'com.krill.CodeRunner', 'com.apple.Terminal']) {
    const r = isExcludedApp(id)
    assert.equal(r.excluded, true, id)
    assert.equal(r.kind, 'terminal', id)
  }
})

test('CU-575 negatives: ordinary apps stay approvable', () => {
  for (const id of ['com.apple.TextEdit', 'com.apple.Notes', 'com.microsoft.VSCode', 'com.apple.Safari', 'com.tabbyml.app']) assert.equal(isExcludedApp(id).excluded, false, id)
})
