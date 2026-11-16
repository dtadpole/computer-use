import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createExclusions } from '../../_tools_/agent-core/exclusions.mjs'

// CU-394: remote-desktop and VM clients are excluded as 'remote_control'; other apps of the same makers stay approvable.
const { isExcludedApp } = createExclusions()

test('CU-394: remote-desktop and VM clients are excluded by kind', () => {
  for (const id of ['com.apple.ScreenSharing', 'com.apple.RemoteDesktop', 'com.teamviewer.TeamViewer', 'com.teamviewer.TeamViewerQS', 'com.philandro.anydesk',
    'com.microsoft.rdc.macos', 'com.microsoft.remotehelp', 'com.parallels.desktop.console', 'com.2X.Client.Mac', 'com.vmware.fusion', 'com.vmware.horizon',
    'com.omnissa.horizon.client.mac', 'com.utmapp.UTM', 'org.virtualbox.app.VirtualBox', 'com.p5sys.jump.mac.viewer', 'com.p5sys.jump.mac.viewer.web',
    'com.realvnc.vncviewer', 'com.realvnc.rvncconnect', 'tv.parsec.www', 'com.citrix.receiver.nomas', 'com.splashtop.stb.macosx', 'com.splashtop.stp.macosx',
    'com.lemonmojo.RoyalTSX.App', 'com.edovia.screens.5', 'com.google.chromeremotedesktop.me2me-host',
    'com.carriez.rustdesk', 'com.citrix.receiver.icaviewer.mac', 'com.devolutions.remotedesktopmanager', 'com.nomachine.nxdock']) {
    assert.equal(isExcludedApp(id).excluded, true, id)
    assert.equal(isExcludedApp(id).kind, 'remote_control', id)
  }
})

test('CU-394 negatives: other apps of those makers, and ordinary apps, stay approvable', () => {
  for (const id of ['com.microsoft.Word', 'com.microsoft.Outlook', 'com.parallels.tool.SystemMonitor', 'com.citrix.Files', 'com.vmware.workspace.one', 'com.splashtop.vault.safari',
    'com.google.Chrome', 'com.apple.finder', 'com.apple.Safari', 'com.apple.Notes']) assert.equal(isExcludedApp(id).excluded, false, id)
})
