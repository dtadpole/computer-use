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

test('CU-385 r7 (cu-researcher 19:42Z): deleted messages per language, junk names in either order', () => {
  for (const name of ['Verwijderde berichten', 'Gelöschte Nachrichten', 'Messages supprimés', 'Mensajes eliminados', 'Messaggi eliminati', 'Mensagens excluídas', 'Spam e posta indesiderata', 'Spam and junk']) assert.ok(drop(name).includes('delete'), name)
  for (const name of ['Spam and phishing reports', 'Berichten']) assert.ok(!drop(name).includes('delete'), name)
})

test('CU-385 r8 (cu-developer-two 19:54Z, cu-researcher 19:56Z): the folder word per language, and the messages noun for every Deleted Items language', () => {
  for (const name of ['Spam-Ordner', 'Junk-Ordner', 'Spam map', 'Silinmiş iletiler', 'Usunięte wiadomości', 'Törölt üzenetek', 'Odstraněné zprávy', 'Slettede meldinger', 'Poistetut viestit', '削除済みメッセージ', '已删除消息']) assert.ok(drop(name).includes('delete'), name)
  for (const name of ['Ordner', 'Spam-Ordner Regeln', 'Wiadomości']) assert.ok(!drop(name).includes('delete'), name)
})

test('CU-385 r9 (cu-researcher 20:12Z): folder word first, closed compounds, bare deleted per language', () => {
  for (const name of ['Cartella spam', 'Pasta de spam', 'Folder spam', 'Spammap', 'Spamordner', 'Eliminati', 'Gelöscht', 'Verwijderd']) assert.ok(drop(name).includes('delete'), name)
  for (const name of ['Cartella progetti', 'Folder of photos', 'Mappe', 'Eliminati dal torneo']) assert.ok(!drop(name).includes('delete'), name)
})

test('CU-385 follow-up: Russian trash / junk names (after the homoglyph fold) and the bare Spanish Borrados', () => {
  for (const name of ['Удаленные', 'Удалённые', 'Корзина', 'Спам', 'Нежелательная почта', 'Удаленные письма', 'Корзина (4)', 'Borrados']) assert.ok(drop(name).includes('delete'), name)
  for (const name of ['Входящие', 'Удаленные сцены фильма', 'Корзина покупок']) assert.ok(!drop(name).includes('delete'), name)
})

test("CU-385 follow-up r2 (cu-developer-two 20:53Z): Outlook's Russian Deleted Items", () => {
  for (const name of ['Удаленные элементы', 'Удалённые элементы', 'Удаленные элементы (2)']) assert.ok(drop(name).includes('delete'), name)
  assert.ok(!drop('Элементы').includes('delete'))
})

const dropPerm = (name) => { const v = policy.classify({ type: 'drag', from: [10, 10], to: [200, 200] }, { url: 'https://drive.fixture.example/my-drive', target: { role: 'row', name: 'Quarterly report' }, dropTarget: { role: 'treeitem', name } }); return v.decision === 'allow' ? [] : (v.classes ?? [v.class]) }
test('CU-385 (cu-verifier 21:42Z): a web drop onto a shared or public space asks permission', () => {
  for (const name of ['Shared with me', 'Public', 'Shared', 'Shared drives', 'Shared with everyone', 'Team Drive', 'Public folder', 'Shared (3)']) assert.ok(dropPerm(name).includes('permission'), name)
  for (const name of ['My Drive', 'Projects', 'Public speaking notes', 'Shared expenses 2026']) assert.ok(!dropPerm(name).includes('permission'), name)
})

test('CU-385 r2 (cu-developer-two 21:54Z): SharePoint-style shared libraries', () => {
  for (const name of ['Shared Documents', 'Shared Files', 'Shared Items', 'Shared Library']) assert.ok(dropPerm(name).includes('permission'), name)
  assert.ok(!dropPerm('Documents').includes('permission'))
})

test("CU-385 r3 (cu-researcher 22:02Z): an owner's shared space ending the name", () => {
  for (const name of ['Company Shared', 'Team shared folder', 'Marketing Shared Drive', 'Acme Corp shared']) assert.ok(dropPerm(name).includes('permission'), name)
  for (const name of ['Not shared', 'Never shared', 'Shared expenses 2026', 'Files I have shared with the whole wide team']) assert.ok(!dropPerm(name).includes('permission'), name)
})

test('CU-385 r4 (cu-researcher 22:10Z, cu-verifier 22:09Z): an owner\'s public folder; negated names stay free', () => {
  for (const name of ['Team Public folder', 'Company Public', 'Sales public drive']) assert.ok(dropPerm(name).includes('permission'), name)
  for (const name of ['Files not shared', 'Drafts never shared', 'Not public', 'Public speaking notes']) assert.ok(!dropPerm(name).includes('permission'), name)
})
