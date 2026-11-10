import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-404 (Medium): reposts, endorsements and reports publish or send for the owner (submit); going public exposes the
// account (permission); promoting or boosting a post is paid (purchase). Both sides (D-099).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://social.example/home', target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-404: repost/retweet/reblog/endorse and reports ask submit; go public asks permission; promote and boost ask purchase', () => {
  for (const name of ['Repost', 'Retweet', 'Reblog', 'Boost', 'Endorse', 'Report user', 'Report post']) assert.equal(click(name), 'submit', name)
  for (const name of ['Go public', 'Make profile public', 'Promote to admin', 'Promote to moderator']) assert.equal(click(name), 'permission', name)
  for (const name of ['Promote', 'Promote post', 'Boost post']) assert.equal(click(name), 'purchase', name)
})

test('CU-404 negatives: Like, Upvote, Comment, Quote, Block user and Pin to profile stay free', () => {
  for (const name of ['Like', 'Upvote', 'Comment', 'Quote', 'Block user', 'Pin to profile', 'Undo repost', 'Remove repost', 'Boosted']) assert.equal(click(name), 'allow', name)
})
