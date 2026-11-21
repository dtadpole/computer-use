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
    'Empty Outbox', 'Empty the Outbox', 'Empty the whole Junk Email folder', 'Empty all of my drafts', 'Empty the folder', 'Empty this folder now', 'Clear site storage', 'Clear browser storage', 'Clear local site storage',
    'Empty the entire inbox', 'Empty the whole Junk folder', 'Empty Clutter folder', "Don't empty this folder", 'Do not empty Deleted Items', 'Don’t empty the Outbox',
    // CU-661 r2: quantified contents before in / from keep asking
    'Empty all items in Deleted Items', 'Empty everything in the Junk folder', 'Empty all messages in Inbox', 'Empty all in Drafts', 'Empty every item in the Outbox', 'Empty the contents of this folder', "Don't empty everything in Archive", 'Empty any items in Drafts', 'Empty the whole contents of Inbox', 'Empty the entire contents of the Junk folder', 'Empty each message in Sent Items',
    // r3: any words after the quantifier
    'Empty all old items in Deleted Items', 'Empty all unread messages in Inbox', 'Empty every single message in Drafts', 'Empty everything older than a week in Archive', 'Empty all the old messages in the Junk Email folder', 'Empty every single file in this folder',
    // a plural content noun first counts as a quantifier
    'Empty items from Deleted Items', 'Empty messages in Junk Email', 'Empty files in this folder', 'Empty attachments from Sent Items', 'Empty conversations in this folder', 'Empty threads in Archive', 'Empty notes in this folder', 'Empty documents from Archive', 'Empty photos in this folder',
    // CU-664: adjectives before the plural noun, and Spam as a folder
    'Empty old documents from this folder', 'Empty unread messages in Inbox', 'Empty all messages in Spam', 'Empty unread messages in Spam', 'Empty old read messages in the Junk Email folder', 'Empty large files in Archive']) assert.ok(click(name).includes('delete'), name)
})

test('CU-659 controls: status / past forms, carts, caches, open / view and bare nouns stay free', () => {
  for (const name of ['Folder emptied', 'Deleted Items emptied', 'Inbox is empty', 'This folder is empty', 'Empty cart', 'Clear cart', 'Empty cache', 'Clear cache', 'Open Deleted Items', 'View junk email',
    'Deleted Items', 'Junk Email', 'Inbox', 'Storage', 'Manage storage', 'Storage settings', 'Free up storage space', 'Storage cleared', 'Empty basket', 'Clear filters', 'New folder', 'Clear storage settings',
    // five slot words stay out, as in CU-644
    'Empty Chrome Android sync device backup folder',
    // follow-up: a preposition or verb in the slot names a place, not the object
    'Empty message in Drafts', 'Empty state for inbox', 'Empty items stay in Inbox', 'Empty subject line in Sent Items', 'Empty draft saved to Drafts', 'Empty results from Archive', 'Empty page is shown in folder', 'Empty copy of Inbox', 'Empty preview of Drafts', 'Empty old message in the Junk Email folder', 'Empty message in Spam', 'Old documents in this folder', 'Empty new folder in Archive', 'Mark as spam']) assert.deepEqual(click(name), [], name)
})
