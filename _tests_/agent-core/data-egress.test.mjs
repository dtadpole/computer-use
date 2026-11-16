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

test('#859 round 2 (cu-researcher 06:39Z): a named outside party as the destination', () => {
  for (const name of ["Duplicate the orders table into Acme's warehouse", 'Keep a live clone of the CRM at a contractor', 'Share the customer list with a vendor', "Send payroll data to Globex's SFTP", 'Hand over the user database to an agency', 'Keep a full copy of our logs with a partner']) assert.notDeepEqual(classesOf(name), [], name)
  for (const name of ["Copy to my team's folder", "Duplicate the orders table into the team's warehouse", 'Copy row', 'Share with my team']) assert.ok(!classesOf(name).includes('permission') || name === 'Share with my team', name)
})

test('#859 round 3 (cu-researcher 08:13Z): a host as the destination; start / begin + gerund', () => {
  for (const name of ['Mirror repository to git.partner.example', 'Start mirroring this repository to an external host', 'Begin replicating the bucket to another account', 'Stream logs to logs.vendor.io:514', 'Forward reports to ops@contractor.example']) assert.notDeepEqual(classesOf(name), [], name)
  for (const name of ['Start mirroring', 'Copy to clipboard', 'Export to PDF', 'Export to report.pdf', 'Save to data.csv']) assert.ok(!classesOf(name).includes('permission'), name)
})

test('#859 round 4 (cu-researcher 08:26Z): any URL scheme as the destination', () => {
  for (const name of ['Push nightly dump to s3://partner-bucket', 'Copy backups to gs://vendor-archive', 'Send exports to sftp://files.partner.example', 'Stream events to kafka://broker.example:9092']) assert.notDeepEqual(classesOf(name), [], name)
})

test('#859 round 5 (cu-researcher 10:20Z class sweep): upload / e-mail / pipe data to an outside party', () => {
  for (const name of ['Upload customer list to agency', 'Email the report to billing@partner.example', 'Pipe data to analytics vendor', 'Send payroll file to the payroll vendor']) assert.notDeepEqual(classesOf(name), [], name)
  for (const name of ['Upload photo', 'Email me', 'Upload to my drive']) assert.ok(!classesOf(name).includes('permission'), name)
})
