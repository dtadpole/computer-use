import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createExclusions } from '../../_tools_/agent-core/exclusions.mjs'

// CU-394 (Medium): a remote desktop, screen share or VM viewer shows another computer as one opaque canvas - excluded as
// 'remote_surface', like CU-252's terminals; no approval lifts it.
const { isExcludedApp } = createExclusions()

test('CU-394: remote-desktop, screen-sharing and VM viewers are excluded as remote_surface', () => {
  for (const id of ['com.apple.ScreenSharing', 'com.microsoft.rdc.macos', 'com.teamviewer.TeamViewer', 'com.philandro.anydesk', 'com.parallels.desktop.console', 'com.vmware.fusion', 'com.utmapp.UTM', 'org.virtualbox.app.VirtualBoxVM', 'com.p5sys.jump.mac.viewer', 'com.realvnc.vncviewer']) {
    const verdict = isExcludedApp(id)
    assert.equal(verdict.excluded, true, id)
    assert.equal(verdict.kind, 'remote_surface', id)
  }
})

test('CU-394 negatives: ordinary apps stay in scope', () => {
  for (const id of ['com.apple.finder', 'com.microsoft.Word', 'com.apple.Safari', 'ai.reflection.cu.fixture']) assert.equal(isExcludedApp(id).excluded, false, id)
})
