import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-569 (cu-researcher 03:42Z): the destroy verbs' synonyms and missing objects ask delete on a console page; benign idioms stay free.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const classesOf = (name) => {
  const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://console.example/project/1', target: { role: 'button', name } })
  return v.decision === 'allow' ? [] : (v.classes ?? [v.class])
}

test('CU-569: tear down / decommission / deprovision / shred / nuke / obliterate / scrub / zap x data objects ask delete', () => {
  for (const name of ['Tear down environment', 'Decommission server', 'Deprovision instance', 'Shred file', 'Nuke database', 'Obliterate repository', 'Scrub data', 'Zap cluster',
    'Reset everything', 'Terminate project', 'Drop bucket', 'Clear everything', 'Delete deployment', 'Tear down the stack', 'Clear bucket', 'Empty volume']) assert.ok(classesOf(name).includes('delete'), name)
  for (const name of ['Clear filters', 'Reset zoom', 'Scrub timeline', 'Tear down guide', 'Close project']) assert.deepEqual(classesOf(name), [], name)
})

test('#851 round 2 (cu-researcher 03:54Z): the destroy lexicon, not a list of examples', () => {
  const verbs = ['Expunge', 'Annihilate', 'Eradicate', 'Demolish', 'Dismantle', 'Scrap', 'Trash', 'Eliminate', 'Kill', 'Sunset', 'Deregister', 'Unprovision', 'Dispose of', 'Get rid of', 'Blow away', 'Wipe clean', 'Spin down', 'Incinerate', 'Torch']
  for (const v of verbs) for (const o of ['server', 'database', 'project', 'environment', 'bucket']) assert.ok(classesOf(`${v} ${o}`).includes('delete'), `${v} ${o}`)
  for (const name of ['Kill switch', 'Retire badge', 'Burn rate', 'Blast radius', 'Sunset view']) assert.deepEqual(classesOf(name), [], name)
  for (const o of ['project', 'environment', 'bucket']) assert.ok(classesOf(`Retire ${o}`).includes('delete'), `Retire ${o}`)
})

test('#851 round 3 (cu-researcher 04:13Z): a strong destroy synonym takes delete\'s whole object slot', () => {
  for (const v of ['Shred', 'Expunge', 'Eradicate', 'Obliterate', 'Nuke', 'Wipe out', 'Get rid of', 'Purge']) for (const o of ['emails', 'history', 'messages', 'photos', 'contacts', 'my files']) {
    const want = classesOf(`Delete ${o}`)
    if (want.length === 0) continue
    assert.ok(classesOf(`${v} ${o}`).includes('delete'), `${v} ${o}`)
  }
  for (const name of ['Kill switch', 'Burn rate', 'Scrub timeline', 'Blast radius']) assert.deepEqual(classesOf(name), [], name)
})

test('#851 (cu-researcher 10:19Z class sweep): sunset and format-storage', () => {
  for (const name of ['Sunset the API', 'Format disk', 'Format the SD card', 'Sunset legacy plan']) assert.notDeepEqual(classesOf(name), [], name)
  for (const name of ['Format text', 'Format cells', 'Sunset', 'Format', 'Sunset view', 'Sunset photos']) assert.ok(!classesOf(name).includes('delete'), name)
})

test('#851 round 5 (cu-researcher 10:43Z): destroy-sense verbs with a resource object; verb-as-noun labels free', () => {
  for (const name of ['Reformat the drive', 'End-of-life the product', 'Retire this repository', 'Reimage the laptop', 'Zero the volume', 'Flush the queue', 'Liquidate the workspace', 'Raze the cluster']) assert.notDeepEqual(classesOf(name), [], name)
  for (const name of ['Shred mode', 'Flush settings', 'Retire', 'Reformat']) assert.ok(!classesOf(name).includes('delete'), name)
})

test('#851 round 6 (cu-researcher 10:59Z): the destroy-sense verb needs a resource object', () => {
  for (const name of ['Raze level', 'Flush left', 'Zero padding', 'Reimage preview', 'Flush right']) assert.ok(!classesOf(name).includes('delete'), name)
})
