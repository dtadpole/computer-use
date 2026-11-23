import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-663 (cu-developer-one's design, 20 Nov 23:11Z): the locale twins of CU-659 - emptying a folder or a localized Deleted Items /
// Junk folder asks delete as 'Empty folder' does, with every axis (slot, verb-final, adverb, negation, formality, CU-661's place /
// quantifier rule); 'Clear storage' twins ask as 'Clear data'; past / status forms, carts, open / new folder and bare names stay free.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name) => { const r = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://mail.example/folders', target: { tag: 'button', role: 'button', name } }); return r.decision === 'allow' ? [] : (r.classes ?? [r.class]) }

test('CU-663: locale empty-folder and clear-storage rows ask delete as their English twins (parity)', () => {
  for (const twin of ['Empty folder', 'Empty Deleted Items', "Don't empty this folder", 'Clear storage']) assert.ok(click(twin).includes('delete'), `twin ${twin}`)
  for (const name of ['Vider le dossier', 'Videz ce dossier', 'Vider tout le dossier maintenant', 'Ne pas vider le dossier', 'Ne videz pas le dossier', 'Vider les éléments supprimés', 'Vider le courrier indésirable', 'Vider tous les messages du dossier', 'Vider le contenu du dossier',
 'Vaciar carpeta', 'Vacía tu carpeta', 'Vaciar la carpeta ahora', 'No vaciar la carpeta', 'Vaciar elementos eliminados', 'Vaciar correo no deseado', 'Vaciar todo el contenido de la carpeta',
 'Esvaziar pasta', 'Esvazie a pasta', 'Limpar a pasta', 'Não esvaziar a pasta', 'Esvaziar itens excluídos', 'Esvaziar lixo eletrônico', 'Esvaziar todos os itens da pasta',
 'Svuota cartella', 'Svuota la cartella', 'Svuotate la cartella ora', 'Non svuotare la cartella', 'Svuota posta eliminata', 'Svuota posta indesiderata', 'Svuota tutti i messaggi nella cartella',
 'Ordner leeren', 'Den Ordner jetzt leeren', 'Ordner nicht leeren', 'Leeren Sie den Ordner', 'Gelöschte Elemente leeren', 'Junk-E-Mail leeren', 'Alle Elemente im Ordner leeren', 'Posteingangsordner leeren',
 'Map legen', 'Leeg de map', 'Maak de map leeg', 'De map nu legen', 'Verwijderde items legen', 'Ongewenste e-mail legen', 'Alle items in de map legen',
 'Очистить папку', 'Очистите папку', 'Очистить папку «Удалённые»', 'Очистить удалённые', 'Очистить нежелательную почту', 'Не очищать папку', 'Очистить все письма в папке', 'Папку очистить', 'ОЧИСТИТЬ ПАПКУ',
 'フォルダーを空にする', 'フォルダを空にしてください', '削除済みアイテムを空にする', '迷惑メールを空にする', 'フォルダーを今すぐ空にする',
 '폴더 비우기', '폴더를 비우세요', '폴더 비워 주세요', '지운 편지함 비우기', '정크 메일 비우기', '폴더 비우기를 실행', '폴더를 비우지 마세요',
 'Klasörü boşalt', 'Klasörü şimdi boşaltın', 'Silinmiş Öğeler klasörünü boşalt', 'Gereksiz E-posta klasörünü boşalt', 'Klasörü boşaltma', 'Tüm klasörü boşalt',
 'Vider le spam', 'Vaciar spam', 'Esvaziar spam', 'Svuota spam', 'Spam leeren', 'Spam legen', 'Limpar armazenamento', 'Limpar o armazenamento', 'Очистить хранилище', 'Depolamayı temizle']) assert.ok(click(name).includes('delete'), name)
})

test('CU-663 controls: past / status forms, carts, open / new folder, place words and bare names stay free', () => {
  for (const name of ['Dossier vidé', 'Le dossier est vide', 'Vider le panier', 'Ouvrir le dossier', 'Nouveau dossier', 'Dossier', 'Message vide dans le dossier', 'Vider le message dans le dossier',
 'Carpeta vaciada', 'La carpeta está vacía', 'Vaciar el carrito', 'Nueva carpeta', 'Vaciar mensaje en carpeta', 'Pasta vazia', 'Esvaziar o carrinho', 'Nova pasta', 'Cartella svuotata', 'Svuota il carrello', 'Nuova cartella',
 'Ordner ist leer', 'Ordner geleert', 'Warenkorb leeren', 'Neuer Ordner', 'Map is leeg', 'Map geleegd', 'Winkelwagen legen', 'Nieuwe map',
 'Папка очищена', 'Папка пуста', 'Очистить корзину покупок', 'Новая папка', 'Открыть папку', 'フォルダーは空です', 'フォルダーを空にしました', '新しいフォルダー', '폴더가 비어 있습니다', '폴더를 비웠습니다', '새 폴더',
 'Klasör boşaltıldı', 'Klasör boş', 'Sepeti boşalt', 'Yeni klasör', 'Armazenamento limpo', 'Хранилище очищено', 'Depolama temizlendi', 'Limpar cache', 'Folder']) assert.deepEqual(click(name), [], name)
})

test('CU-665: a plural content noun first keeps asking before the place word in each locale, as the English plural rule does', () => {
  for (const name of ['Vider les messages du dossier Spam', 'Vider les éléments du dossier', 'Vider les anciens messages du dossier', 'Vaciar los mensajes de la carpeta', 'Esvaziar as mensagens da pasta',
    'Svuota i messaggi della cartella', 'Die Nachrichten im Ordner leeren', 'Leere die Nachrichten im Ordner', 'De berichten in de map legen', 'Leeg de berichten in de map', 'Очистить сообщения в папке', 'Очистить файлы в папке']) assert.ok(click(name).includes('delete'), name)
  for (const name of ['Vider le message dans le dossier', 'Message vide dans le dossier', 'Vaciar mensaje en carpeta', 'Esvaziar a mensagem da pasta', 'Leere Nachricht im Ordner', 'Lege bericht in de map',
    'Пустое письмо в папке', 'Les messages du dossier']) assert.deepEqual(click(name), [], name)
})
