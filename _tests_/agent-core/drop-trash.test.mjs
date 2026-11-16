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

test("CU-385 r4 (cu-researcher 19:02Z): Outlook's localized Deleted Items folders", () => {
  for (const name of ['Elementi eliminati', 'Verwijderde items', 'Itens eliminados', 'Itens Excluídos', 'Usunięte elementy', 'Törölt elemek', 'Gelöschte Elemente', 'Éléments supprimés', 'Elementos eliminados', 'Silinmiş Öğeler', '削除済みアイテム']) assert.ok(drop(name).includes('delete'), name)
  for (const name of ['Elementi', 'Items', 'Gelöschte Szenen planen']) assert.ok(!drop(name).includes('delete'), name)
})

test('CU-385 r5 (cu-developer-two 19:09Z): the hyphenated junk folder', () => {
  for (const name of ['Junk-E-Mail', 'Junk-Mail']) assert.ok(drop(name).includes('delete'), name)
  assert.ok(!drop('Junk-food recipes').includes('delete'))
})

test('CU-385 r6 (cu-researcher 19:24Z): Spanish recycle bin / deleted / junk, and junk names ending in "and spam"', () => {
  for (const name of ['Papelera de reciclaje', 'Elementos borrados', 'Correo basura', 'Posta indesiderata e spam', 'Ongewenste e-mail en spam', 'Junk and spam']) assert.ok(drop(name).includes('delete'), name)
  for (const name of ['Kosz zakupów', 'Spam filter rules', 'Junkyard photos', 'Bulk upload', 'Deleted Items policy doc']) assert.ok(!drop(name).includes('delete'), name)
})
