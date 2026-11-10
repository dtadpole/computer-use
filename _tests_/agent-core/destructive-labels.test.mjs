import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-146 (the CU-145 audit): destructive labels outside the old word lists.

const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (role, name) => policy.classify({ type: 'click', x: 5, y: 5, button: 'left' }, { url: 'app:ai.reflection.cu.fixture', target: { role, name } })

test('the missed destructive labels ask delete; revoke asks permission', () => {
  for (const [role, name] of [['AXMenuItem', 'Move to Trash'], ['AXMenuItem', 'Move to Bin'], ['AXMenuItem', 'Empty Bin'], ['AXButton', 'Clear History'],
    ['AXButton', 'Clear All'], ['AXButton', 'Reset all settings'], ['AXButton', 'Reset to Defaults'], ['AXButton', 'Uninstall'], ['AXButton', 'Wipe disk'], ['AXButton', 'Purge cache'],
    ['AXButton', 'Trash'], ['AXMenuItem', 'Bin'], ['AXButton', 'Deactivate account'], ['button', 'Close account'], ['AXMenuItem', 'Forget This Device'],
    ['AXButton', 'Factory Reset'], ['AXButton', 'Erase All Content and Settings']]) {
    assert.equal(click(role, name).class, 'delete', `${role} ${name}`)
  }
  assert.equal(click('AXButton', 'Revoke access').class, 'permission')
})

test('Trash or Bin as a sidebar row, Binder, Reset password and Clear search are not asked', () => {
  for (const [role, name] of [['AXRow', 'Trash'], ['AXCell', 'Bin'], ['AXStaticText', 'Trash'], ['link', 'Trash'], ['AXLink', 'Bin'], ['AXButton', 'Binder'],
    ['AXButton', 'Clear search'], ['link', 'Forgot password?'], ['link', 'Reset password']]) {
    assert.equal(click(role, name).decision, 'allow', `${role} ${name}`)
  }
})

test('CU-411 (cu-coordinator 11:13Z) re-judges a settings button Reset password: it asks credential (was free here); a Reset password link stays free', () => {
  assert.equal(click('AXButton', 'Reset password').class, 'credential')
})

test('the accepted over-ask, named: Clear all on a filter bar asks delete', () => {
  assert.equal(click('button', 'Clear all').class, 'delete')
})
