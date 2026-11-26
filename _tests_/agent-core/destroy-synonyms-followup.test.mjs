import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-711 (cu-researcher's D-112 follow-up to #851): destroy-sense verbs past #851's filed rows, by class - dissolve, disband,
// scuttle, abolish, jettison, ditch, decimate, nix, the phrasal kill off / write off / clean out / clear out / empty out / burn
// down, and 'strip ... bare' - over a data object (now also an organisation, a tenant and a replica set) ask delete.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const classesOf = (name) => {
  const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://console.example/project/1', target: { role: 'button', name } })
  return v.decision === 'allow' ? [] : (v.classes ?? [v.class])
}

test('CU-711: the filed rows ask delete', () => {
  for (const name of ['Dissolve the organization', 'Scuttle the replica set', 'Strip the server bare', 'Clean out the storage account', 'Kill off the old tenants', 'Write off the backups']) {
    assert.ok(classesOf(name).includes('delete'), name)
  }
})

test('CU-711: the class reaches its other verbs and phrasal forms over a data object', () => {
  for (const name of ['Disband the workspace', 'Abolish this account', 'Jettison the old snapshots', 'Ditch the database', 'Decimate the cluster', 'Nix the backup', 'Clear out the downloads', 'Empty out the archive', 'Burn down the environment', 'Dissolve the organisation']) {
    assert.ok(classesOf(name).includes('delete'), name)
  }
})

test('CU-711: near misses stay free - no data object, or a sense that destroys nothing', () => {
  for (const name of ['Clean out the cache', 'Write off the invoice', 'Ditch the ads', 'Strip formatting', 'Strip metadata', 'Dissolve transition', 'Kill off notifications', 'Burn down chart']) {
    assert.ok(!classesOf(name).includes('delete'), name)
  }
})
