import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-385: a drag onto a trash or junk folder named in its own words asks delete.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const drop = (name) => { const v = policy.classify({ type: 'drag', from: [10, 10], to: [200, 200] }, { url: 'https://outlook.fixture.example/mail', target: { role: 'row', name: 'Quarterly report' }, dropTarget: { role: 'treeitem', name } }); return v.decision === 'allow' ? [] : (v.classes ?? [v.class]) }

test('CU-385: trash and junk folders by their own names ask delete', () => {
  for (const name of ['Deleted Items', 'Papierkorb', 'Corbeille', '垃圾箱', 'ゴミ箱', 'Junk Email', 'Spam', 'Recycle Bin']) assert.ok(drop(name).includes('delete'), name)
})

test('CU-385: ordinary folders stay free of delete', () => {
  for (const name of ['Inbox', 'Archive', 'Drafts', 'Sent Items', 'Projects']) assert.ok(!drop(name).includes('delete'), name)
})

test('CU-385 r2 (cu-developer-two 18:40Z): more trash / junk names, whole names only', () => {
  for (const name of ['Kosz', 'Çöp Kutusu', 'Recently Deleted', 'Bulk Mail', 'Correo no deseado', 'Unerwünscht', 'Junk (12)']) assert.ok(drop(name).includes('delete'), name)
  for (const name of ['Spam Filter Settings', 'Deleted scenes', 'Junk drawer ideas']) assert.ok(!drop(name).includes('delete'), name)
})

test('CU-385 r3 (cu-developer-two 18:56Z): a folder word or an account suffix after the name', () => {
  for (const name of ['Deleted Items - Work', 'Spam folder', 'Junk Email - personal@example.test', 'Trash (3)']) assert.ok(drop(name).includes('delete'), name)
  for (const name of ['Spam Filter Settings', 'Deleted scenes', 'Junk drawer ideas', 'Inbox - Work']) assert.ok(!drop(name).includes('delete'), name)
})
