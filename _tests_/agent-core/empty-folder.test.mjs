import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-659 (cu-developer-one's go, 20 Nov 17:13Z): emptying a mail / file folder asks delete as 'Empty trash'; 'Clear storage' as 'Clear app data'.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name) => { const r = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://mail.example/folders', target: { tag: 'button', role: 'button', name } }); return r.decision === 'allow' ? [] : (r.classes ?? [r.class]) }

test('CU-659: emptying a folder and clearing storage ask delete, as their twins', () => {
  for (const twin of ['Empty trash', 'Empty junk', 'Clear app data']) assert.ok(click(twin).includes('delete'), `twin ${twin}`)
  for (const name of ['Empty deleted items', 'Empty Deleted Items', 'Empty Deleted Items folder', 'Empty the Deleted Items folder', 'Empty junk email', 'Empty Junk E-mail', 'Empty the Junk Email folder',
    'Empty inbox', 'Empty your inbox', 'Empty my inbox', 'Empty drafts', 'Empty Sent Items', 'Empty sent mail', 'Empty archive', 'Empty folder', 'Empty this folder', 'Empty these folders', 'Empty all folders',
    'Empty selected folder', 'Empty Deleted Items now', 'Empty folder permanently', 'EMPTY FOLDER', 'Empty folder?', 'Clear storage', 'Clear app storage', 'Clear all storage', 'Clear local storage', 'Clear storage now',
    // r2: four slot words, Outbox, storage qualifiers
    'Empty Outbox', 'Empty the Outbox', 'Empty the whole Junk Email folder', 'Empty all of my drafts', 'Empty the folder', 'Empty this folder now', 'Clear site storage', 'Clear browser storage', 'Clear local site storage']) assert.ok(click(name).includes('delete'), name)
})

test('CU-659 controls: status / past forms, carts, caches, open / view and bare nouns stay free', () => {
  for (const name of ['Folder emptied', 'Deleted Items emptied', 'Inbox is empty', 'This folder is empty', 'Empty cart', 'Clear cart', 'Empty cache', 'Clear cache', 'Open Deleted Items', 'View junk email',
    'Deleted Items', 'Junk Email', 'Inbox', 'Storage', 'Manage storage', 'Storage settings', 'Free up storage space', 'Storage cleared', 'Empty basket', 'Clear filters', 'New folder', 'Clear storage settings']) assert.deepEqual(click(name), [], name)
})
