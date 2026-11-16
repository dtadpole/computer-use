import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-573 (cu-researcher 05:05Z): a persistent data flow to a destination outside the account asks permission; own storage is for the ruling.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const classesOf = (name, url = 'https://console.example/project/1') => {
  const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'button', name } })
  return v.decision === 'allow' ? [] : (v.classes ?? [v.class])
}

test('CU-573: egress verbs to an external destination, and outgoing webhooks / drains, ask permission', () => {
  for (const name of ['Replicate bucket to another account', 'Mirror repository to', 'Add webhook URL', 'Enable webhook', 'Stream logs to Datadog', 'Export data to S3', 'Sync database to external server', 'Copy snapshot to another region',
    'Pipe events into Kafka', 'Ship audit logs to Splunk', 'Forward alerts to a third-party endpoint', 'Add log drain', 'Create export destination', 'Set up outgoing webhook', 'Clone repo to a different org']) {
    for (const url of ['https://console.example/project/1', 'https://git.example/org/repo/settings']) assert.notDeepEqual(classesOf(name, url), [], `${name} @ ${url}`)
  }
})

test('CU-573 negatives: own storage (for the ruling), reading and docs stay free', () => {
  for (const name of ['Back up to my Google Drive', 'Export to Dropbox', 'Copy to my computer', 'Export to an external drive', 'View webhooks', 'Webhooks', 'Webhook guide', 'Copy link', 'Export', 'Sync now']) assert.deepEqual(classesOf(name), [], name)
})
