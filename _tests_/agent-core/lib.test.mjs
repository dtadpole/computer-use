import assert from 'node:assert/strict'
import { test } from 'node:test'

import * as appApprovals from '../../_tools_/agent-core/app-approvals.mjs'
import * as appPolicy from '../../_tools_/agent-core/app-policy.mjs'
import * as exclusions from '../../_tools_/agent-core/exclusions.mjs'
import * as lib from '../../_tools_/agent-core/lib.mjs'

// lib.mjs is the one face other components import (layout-and-ownership.md): the desktop policy pieces are on it.

test('lib.mjs exports the desktop policy pieces: createExclusions, EXCLUDED_APPS, createAppPolicy, createAppApprovals', () => {
  assert.equal(lib.createExclusions, exclusions.createExclusions)
  assert.equal(lib.EXCLUDED_APPS, exclusions.EXCLUDED_APPS)
  assert.equal(lib.createAppPolicy, appPolicy.createAppPolicy)
  assert.equal(lib.createAppApprovals, appApprovals.createAppApprovals)
  assert.ok(Object.isFrozen(lib.EXCLUDED_APPS) && lib.EXCLUDED_APPS.length > 0)
  assert.equal(lib.createExclusions().isExcludedApp('com.apple.Terminal').kind, 'terminal')
})

test('lib.mjs still exports the browser surface it had', () => {
  for (const name of ['createPolicy', 'createSitePolicy', 'createRecorder', 'createRunControl', 'runTask', 'startRun', 'createFakeEnvironment', 'createScriptedAdapter']) {
    assert.equal(typeof lib[name], 'function', name)
  }
})
