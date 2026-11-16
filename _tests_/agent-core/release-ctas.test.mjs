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
