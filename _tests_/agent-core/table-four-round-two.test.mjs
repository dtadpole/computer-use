import assert from 'node:assert/strict'
import { test } from 'node:test'

import { grammarClasses } from '../../_tools_/agent-core/phrase-grammar.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// #590 round 2 (cu-coordinator 23:34Z): the ten held-out escapes fold in with their own family's class (D-108); none collides
// with a ruled-free form.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://app.example/page', target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }

test('#590 round 2: the ten held-out escapes ask with their family class', () => {
  for (const [name, cls] of [['Get prequalified', 'submit'], ['Restore from seed phrase', 'credential'], ['Kick from channel', 'permission'], ['Add app to Slack', 'install'],
    ['Disable junk filter', 'permission'], ['Allow mail from all senders', 'permission'], ['Turn off phishing warnings', 'permission'],
    ['Turn on access for less secure apps', 'credential'], ['Summon car', 'physical'], ['Start Summon', 'physical']]) {
    assert.deepEqual(grammarClasses(name), [cls], name)
    assert.equal(click(name), cls, `hook: ${name}`)
  }
  for (const name of ['Add to list', 'Add app', 'Kick off meeting', 'Start', 'Allow all', 'Junk', 'Turn on junk filter']) assert.equal(click(name), 'allow', name)
})
