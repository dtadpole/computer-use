import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-571 (cu-researcher 04:43Z): publishing / releasing CTAs by class ask submit like 'Deploy'; the nouns and neighbours stay free.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const classesOf = (name, url = 'https://ci.example/project/1') => {
  const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'button', name } })
  return v.decision === 'allow' ? [] : (v.classes ?? [v.class])
}

test('CU-571: going live, shipping to prod, merging to main, rolling out to everyone ask submit', () => {
  for (const name of ['Go live', 'Go live now', 'Push live', 'Make it live', 'Take live', 'Ship to prod', 'Ship to production', 'Go to production', 'Push to prod', 'Release to all users', 'Release to everyone',
    'Roll out to 100%', 'Roll out to all users', 'Rollout to production', 'Launch to production', 'Merge to main', 'Merge into main', 'Fast-forward main', 'Merge and deploy', 'Promote build', 'Promote release',
    'Cut a release', 'Cut release', 'Ship release', 'Push release', 'Roll out now', 'Blast to list', 'Blast to subscribers', 'Flip the flag', 'Enable for all users', 'Turn on for everyone', 'Deploy changes to production', 'Move build to stable', 'Publish to the store']) {
    for (const url of ['https://ci.example/project/1', 'https://app.example/settings', 'https://cms.example/site']) assert.ok(classesOf(name, url).includes('submit'), `${name} @ ${url}`)
  }
})

test('CU-571 negatives: the nouns and neighbours stay free', () => {
  for (const name of ['Go to live chat', 'Live preview', 'Production logs', 'Release notes', 'View release', 'Releases', 'Deployments', 'Merge cells', 'Ship to address', 'Shipping', 'Roll back', 'Draft release', 'Blast list', 'Go to main menu', 'Move to folder']) assert.ok(!classesOf(name).includes('submit'), name)
})

test('#854 round 2 (cu-researcher 04:56Z): the TARGET binds - any verb to a live target, channel promotion, traffic cut-over', () => {
  for (const name of ['Graduate build to production', 'Advance release to stable', 'Hand off to production', 'Bump to stable channel', 'Promote to stable channel', 'Move canary to GA', 'Open up to everyone', 'Expose to all users', 'Widen rollout to 100%',
    'Squash and merge into main', 'Land into master', 'Integrate into trunk', 'Shift all traffic to v2', 'Route 100% of traffic to green', 'Cut over', 'Cut over to new cluster', 'Flip DNS to the new server', 'Switch traffic to blue']) assert.ok(classesOf(name).includes('submit'), name)
  for (const name of ['Go to main', 'Apply to all', 'Copy to all', 'Show to everyone', 'Go back to production logs', 'Navigate to production', 'View traffic', 'Traffic report', 'Say hello to everyone']) assert.ok(!classesOf(name).includes('submit'), name)
})

test('#854 round 3 (cu-researcher 05:20Z): read last - older classes lead; fresh members ask', () => {
  assert.ok(!classesOf('Open the gates to everyone').includes('submit'), 'the physical gate keeps its older class')
  assert.notDeepEqual(classesOf('Open the gates to everyone'), [], 'and still asks')
  for (const name of ['Expose v2 to the public', 'Bump stable to 4.2', 'Enable for 100% of traffic', 'Graduate the canary', 'Make v3 the default for customers', 'Promote the release candidate', 'Tag version 2.1']) assert.ok(classesOf(name).includes('submit'), name)
  for (const name of ['Make my email public to everyone', 'Update audience to Public']) assert.ok(classesOf(name).includes('permission'), name)
})

test('#854 round 4 (cu-researcher 05:36Z): the audience / reach class - a quantifier and a release scope anywhere', () => {
  assert.notDeepEqual(classesOf('Promote this build so everyone gets it'), [], 'asks (an older promote row leads)')
  for (const name of ['Make the feature available to all customers', 'Expand the rollout to every region', 'Widen beta access to everyone', 'Launch globally', 'Release v4 worldwide', 'Turn the flag on for all users', 'Open up the canary to 100%',
    'Set the new version as default for all accounts', 'Point the stable channel at build 812 for everyone', 'Push the config change into production now']) assert.ok(classesOf(name).includes('submit'), name)
  for (const name of ['Reply to everyone', 'Say hello to everyone', 'Visible to everyone', 'Available for all users', 'View release notes for everyone', 'Open the gates to everyone', 'Production logs for all regions', 'Thanks everyone', 'Everyone']) assert.ok(!classesOf(name).includes('submit') || name === 'Reply to everyone', name)
})
