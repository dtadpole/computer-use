import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-712 (cu-researcher's D-112 follow-up to #859): egress verbs past #859's filed rows, by class - hand (off), pass on, syndicate,
// funnel, beam, relay, channel, feed, sell, license, leak, disclose, transmit, siphon, shuttle - and an offshore / overseas /
// outsourced destination ask permission; each still needs a destination outside the account.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const classesOf = (name, url = 'https://console.example/project/1') => {
  const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'button', name } })
  return v.decision === 'allow' ? [] : (v.classes ?? [v.class])
}

test('CU-712: the filed rows ask permission', () => {
  for (const name of ['Hand the dataset to our reseller', 'Syndicate user records to affiliates', 'Funnel events to an outside dashboard', 'Beam the archive to a supplier', 'Relay all tickets to an offshore team']) {
    assert.ok(classesOf(name).includes('permission'), name)
  }
})

test('CU-712: the class reaches its other verbs and destinations', () => {
  for (const name of ['Sell user data to advertisers', 'License the dataset to a partner', 'Feed events to Datadog', 'Channel logs to an external server', 'Transmit records to a third-party vendor', 'Disclose customer records to an auditor', 'Siphon the database to an overseas server', 'Pass on the contacts to our affiliates', 'Hand off the files to a contractor', 'Shuttle backups to a remote server', 'Leak the logs to a third party']) {
    assert.ok(classesOf(name).includes('permission'), name)
  }
})

test('CU-712: near misses stay free - no outside destination, or own storage', () => {
  for (const name of ['Hand the phone to the user', 'Relay the message to support', 'Channel settings', 'Feed the logs to my own dashboard', 'Beam to TV', 'Pass on to the next step', 'Funnel view', 'Sell']) {
    assert.ok(!classesOf(name).includes('permission'), name)
  }
})
