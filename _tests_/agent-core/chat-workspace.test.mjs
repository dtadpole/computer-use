import assert from 'node:assert/strict'
import { test } from 'node:test'

import { grammarClasses } from '../../_tools_/agent-core/phrase-grammar.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-454 (High): in a chat workspace, converting a channel to public, allowing or authorizing an app and kicking or banning a
// member ask permission; installing an app asks install. Desktop and web share the classifier. Grammar table rows. Click,
// Return and Space (D-106). Both sides (D-099).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const URL = 'https://chat.example/workspace'
const click = (name, desk = false) => {
  const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, desk ? { url: 'app:com.example.chat', target: { role: 'AXButton', name } } : { url: URL, target: { role: 'button', name } })
  return v.decision === 'allow' ? 'allow' : v.class
}
const enter = (name) => { const v = policy.classify({ type: 'keypress', keys: ['ENTER'] }, { url: URL, target: { tag: 'input', role: 'textbox', name: 'Channel name', defaultButtonRead: true, defaultButton: { role: 'button', name } } }); return v.decision === 'allow' ? 'allow' : v.class }
const space = (name) => { const v = policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url: URL, target: { tag: 'button', role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-454: public conversion, app grants and member removals ask permission; app installs ask install; web and desktop alike', () => {
  const rows = [['Convert to public channel', 'permission'], ['Make channel public', 'permission'], ['Allow app', 'permission'], ['Authorize app', 'permission'],
    ['Kick member', 'permission'], ['Ban member', 'permission'], ['Install app', 'install']]
  for (const [name, cls] of rows) {
    assert.equal(click(name), cls, name)
    assert.equal(click(name, true), cls, `desktop: ${name}`)
    assert.equal(enter(name), cls, `Return: ${name}`)
    assert.equal(space(name), cls, `Space: ${name}`)
  }
  // Named (older classes lead; each asks either way): 'Remove from channel' and 'Deactivate account' keep delete, 'Add app to
  // workspace' keeps permission (ruled install).
  for (const [name, cls] of [['Remove from channel', 'delete'], ['Deactivate account', 'delete'], ['Add app to workspace', 'permission']]) assert.equal(click(name), cls, `${name}: older class`)
  for (const [name, cls] of [['Convert this channel to public', 'permission'], ['Approve the integration', 'permission'], ['Install a bot', 'install']]) assert.deepEqual(grammarClasses(name), [cls], `table row: ${name}`)
})

test('CU-454 negatives: channels, members, the app directory and mention chips stay free; Leave channel keeps an older ask', () => {
  // '@channel' / '@here' insert a mention chip into the composer; the send that follows asks submit (named in the PR).
  for (const name of ['Channels', 'Members', 'Apps', '@channel', '@here', 'Install', 'Kick off meeting']) assert.equal(click(name), 'allow', name)
  // Named over-ask (older submit class rule; CU-429's family).
  assert.equal(click('Leave channel'), 'submit', 'older rule')
})
