import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-143: Command-Backspace and Command-Delete reach the app's menu before the field editor - even plain, in a focused
// text field (live: 'Clear Line' fired, run 20261107T045926Z-480671) - so every such chord asks delete.

const policy = createPolicy({ sitePolicy: () => 'allow' })
const decide = (keys, target) => policy.classify({ type: 'keypress', keys }, { url: 'app:com.apple.finder', target })
const field = { role: 'AXTextField', name: 'Search' }
const list = { role: 'AXList', name: 'Trash' }

test('in a text input too, Command-Backspace and Command-Delete ask delete - plain or with Shift, Option or Control', () => {
  for (const keys of [['META', 'BACKSPACE'], ['META', 'DELETE'], ['META', 'SHIFT', 'BACKSPACE'], ['META', 'ALT', 'SHIFT', 'BACKSPACE'], ['META', 'ALT', 'BACKSPACE'], ['META', 'CTRL', 'DELETE']]) {
    const r = decide(keys, field)
    assert.deepEqual([r.decision, r.class], ['confirm', 'delete'], keys.join('+'))
  }
})

test('outside a text input every Command-Backspace chord asks delete, as before', () => {
  for (const keys of [['META', 'BACKSPACE'], ['META', 'SHIFT', 'BACKSPACE'], ['META', 'ALT', 'SHIFT', 'BACKSPACE'], ['META', 'DELETE']]) {
    assert.equal(decide(keys, list).class, 'delete', keys.join('+'))
  }
})
