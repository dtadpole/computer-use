import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-404: a paid boost buys reach - purchase (with submit where it also posts); lists and settings of boosts stay free.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const verdict = (name) => policy.classify({ type: 'click', x: 5, y: 5, button: 'left' }, { url: 'https://social.example/post/1', target: { tag: 'button', role: 'button', name } })

test('CU-404: boosting or promoting a post asks purchase', () => {
  for (const name of ['Boost post', 'Boost this post', 'Promote post', 'Promote this post', 'Promote tweet', 'Boost listing', 'Promote page', 'Boost now',
    'Promote this Tweet', 'Sponsor this post', 'Sponsor post', 'Advertise this post', 'Boost your reel', 'Promote my page', 'Boost event']) {
    const r = verdict(name)
    assert.equal(r.decision, 'confirm', name)
    assert.ok((r.classes ?? [r.class]).includes('purchase'), `${name}: ${JSON.stringify(r.classes ?? r.class)}`)
  }
})

test('CU-404 negatives: boost lists, insights and settings stay free', () => {
  for (const name of ['Boosted posts', 'Boost insights', 'Promotion settings', 'Promotions', 'Ad center', 'Insights', 'Sponsored posts', 'Advertise with us', 'Sponsor details']) assert.equal(verdict(name).decision, 'allow', name)
})
