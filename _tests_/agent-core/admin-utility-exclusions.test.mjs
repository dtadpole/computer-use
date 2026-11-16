import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createExclusions } from '../../_tools_/agent-core/exclusions.mjs'

// CU-577 (cu-researcher 07:53Z): utilities that administer the Mac's directory, network or other Macs are hard-excluded with Disk
// Utility (CU-264's os_security); ordinary apps stay approvable.
const { isExcludedApp } = createExclusions()

test('CU-577: directory, network and remote-admin utilities are os_security exclusions', () => {
  for (const id of ['com.apple.DirectoryUtility', 'com.apple.airport.airportutility', 'com.apple.RemoteDesktop', 'com.apple.ScreenSharing', 'com.apple.configurator.ui', 'com.apple.Ticket-Viewer', 'com.apple.DiskUtility']) {
    const r = isExcludedApp(id)
    assert.equal(r.excluded, true, id)
    assert.equal(r.kind, 'os_security', id)
  }
})

test('CU-577 negatives: ordinary apps stay approvable', () => {
  for (const id of ['com.apple.TextEdit', 'com.apple.Preview', 'com.apple.Notes', 'com.apple.Console']) assert.equal(isExcludedApp(id).excluded, false, id)
})
