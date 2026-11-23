import assert from 'node:assert/strict'
import { before, describe, test } from 'node:test'

import { buildFixtureApp } from '../../_tools_/desktop-fixture/build.mjs'
import { launchFixture } from '../../_tools_/desktop-fixture/client.mjs'

// 'attach-upload' (CU-377's live row), offscreen, opened in CU Ledger's role: a message window with a drop zone named
// 'Drop files here to attach' and an 'Upload' button. Each records counts only - never a file's name. The cross-app drag
// itself (CU Fixture's file browser -> this zone) is the live row; run these only under the desktop-run lock (CU-305).

let executable
before(() => {
  executable = buildFixtureApp().executable
})

describe('attach-upload (CU-377)', () => {
  test('a named drop zone and an Upload button; Upload records how many are attached, no names', async () => {
    const ledger = await launchFixture(executable, { offscreen: true, role: 'ledger' })
    try {
      await ledger.open('attach-upload', { title: 'New message' })
      const targets = await ledger.targets()
      assert.ok(targets['attach-zone'] && targets.upload, 'targets for the zone and the button')
      assert.ok(targets.upload.y > targets['attach-zone'].y, 'Upload sits under the zone')
      const audit = await ledger.axAudit()
      assert.equal(audit['attach-zone'].role, 'AXGroup')
      assert.equal(audit['attach-zone'].name, 'Drop files here to attach')
      assert.equal(audit.upload.name, 'Upload')
      await ledger.act({ press: 'upload' })
      const events = (await ledger.state()).events.filter((e) => e.type === 'uploaded')
      assert.deepEqual(events.map((e) => e.count), [0])
    } finally {
      await ledger.close()
    }
  })
})
