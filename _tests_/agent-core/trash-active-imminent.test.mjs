import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createAppPolicy } from '../../_tools_/agent-core/app-policy.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-860 (under-ask): under an emptying button the trash cell asked only when the sentence's delete verb met a pending auxiliary,
// and the English imminent one is the passive 'about to be / get', so 'Empty' | 'Trash' | 'You are about to permanently delete the
// items in the Trash.' went free while 'You are going to permanently delete ...' asked. The marker table cu-researcher OK'd (r1,
// with amendments) reads the ACTIVE twin of each imminent auxiliary the passive cells read, with a covered delete verb:
//   A. en 'is / are (just / now / right) about to' + at most two words + delete / erase / remove / destroy / take out;
//   B. en 'is / are on the point / verge of' + at most two words + deleting / erasing / removing / destroying / taking out;
//   C. fr 'est / sont / êtes / es / sommes sur le point de / d'' + an infinitive the fr active future reads;
//   D. es 'está / están / estás / estamos a punto de / por' + an es infinitive, with -lo(s) / -la(s);
//   E. it 'sta / stai / stanno / stiamo / state per', 'è / sei / sono / siamo / siete sul punto di' + an it infinitive, with -lo / -la / -li / -le;
//   F. pt 'está / estão / estás / estamos prestes a / a ponto de / para / por' + the pt periphrastic infinitives, with -lo(s) / -la(s) ('tirar' stays out);
//   G. tr 'silmek / kaldırmak / yok etmek / imha etmek üzere' + -siniz / -sin / -yiz / -dir / -ler, with 'üzere değil-' and 'üzereydi-'.
// The fold (table delta cu-researcher OK'd 09:10Z 28 Nov): G also reads the bare third person 'V-mek üzere' when it closes its clause (end,
// punctuation, a comma included, a coordinator or the question particle, as TR_FINITE) - a verb after it is the purpose reading and stays
// free; F also reads 'por', which (as es D's 'por', the policy owner's change) takes no gap and asks only with an object after the verb.
// A negation in the four words before the auxiliary frees it as it frees the 'will' twin. Each row is pressed on both routes.
const FIXTURE = 'ai.reflection.cu.fixture'
const tmp = mkdtempSync(join(tmpdir(), 'cu-860-'))
after(() => rmSync(tmp, { recursive: true, force: true }))
const store = createAppApprovals({ path: join(tmp, 'a.json') })
store.grantAlways(FIXTURE, { by: 'api' })
const desktop = createAppPolicy({ scope: [FIXTURE], approvals: store })
const web = createPolicy({ sitePolicy: () => 'allow' })
const click = { type: 'click', x: 1, y: 1, button: 'left' }
const classes = (v) => (v.decision === 'allow' ? [] : (v.classes ?? [v.class]))
const onWeb = (name, dialogName, description) => web.classify(click, { url: 'https://app.example/files', target: { role: 'button', name, dialogName, ...(description ? { dialogDescription: description } : {}) } })
const onDesktop = (name, dialogName, description) => desktop.classify(click, { frontmostBundleId: FIXTURE, target: { origin: FIXTURE, role: 'AXButton', name, fingerprint: name, defaultButtonRead: true, dialogName, ...(description ? { dialogDescription: description } : {}) } })
const asks = (rows) => { for (const [n, t, d] of rows) { assert.ok(classes(onWeb(n, t, d)).includes('delete'), `web ${n} | ${t} | ${d ?? ''}`); assert.ok(classes(onDesktop(n, t, d)).includes('delete'), `desktop ${n} | ${t} | ${d ?? ''}`) } }
const free = (rows) => { for (const [n, t, d] of rows) { assert.ok(!classes(onWeb(n, t, d)).includes('delete'), `web ${n} | ${t} | ${d ?? ''}`); assert.ok(!classes(onDesktop(n, t, d)).includes('delete'), `desktop ${n} | ${t} | ${d ?? ''}`) } }
const same = (pairs) => {
  for (const [n, t, a, b] of pairs) {
    assert.equal(classes(onWeb(n, t, a)).includes('delete'), classes(onWeb(n, t, b)).includes('delete'), `web ${a} / ${b}`)
    assert.equal(classes(onDesktop(n, t, a)).includes('delete'), classes(onDesktop(n, t, b)).includes('delete'), `desktop ${a} / ${b}`)
  }
}

test('CU-860: the filed row, verbatim, asks delete on both routes, beside its \'going to\' twin', () => {
  asks([
    ['Empty', 'Trash', 'You are about to permanently delete the items in the Trash.'],
    ['Empty', 'Trash', 'You are going to permanently delete the items in the Trash.'],
  ])
})

test('CU-860: en A / B - each active imminent row asks, beside its twin that asks on main', () => {
  asks([
    // A: 'is / are (just / now / right) about to' + an infinitive, both apostrophes, at most two words between
    ['Empty', 'Trash', 'You are just about to erase all items in the Trash.'],
    ['Empty', 'Trash', 'You will erase all items in the Trash.'],
    ['Empty', 'Trash', 'You’re about to delete everything in the Trash.'],
    ['Empty', 'Trash', 'You’ll delete everything in the Trash.'],
    ['Empty', 'Trash', 'The app is about to remove all files from the bin.'],
    ['Empty', 'Trash', 'The app will remove all files from the bin.'],
    ['Empty', 'Trash', 'We are right about to destroy the items in the Trash.'],
    ['Empty', 'Trash', 'We will destroy the items in the Trash.'],
    ['Empty', 'Trash', 'You are now about to take out every item in the Trash.'],
    ['Empty', 'Trash', 'You will take out every item in the Trash.'],
    ['Empty', 'Trash', 'You are about to permanently, irreversibly erase the items in the Trash.'],
    ['Empty', 'Trash', 'You will permanently, irreversibly erase the items in the Trash.'],
    // CU-818: the title names the trash and the sentence its items
    ['Empty', 'Trash', 'You are about to delete these items permanently.'],
    ['Empty', 'Trash', 'You will delete these items permanently.'],
    // B: 'is / are (just) on the point / verge of' + a gerund
    ['Empty', 'Trash', 'You are on the point of permanently deleting the items in the Trash.'],
    ['Empty', 'Trash', 'The app is on the verge of erasing everything in the bin.'],
    ['Empty', 'Trash', 'The app will erase everything in the bin.'],
    ['Empty', 'Trash', "They're on the verge of removing all files from the Trash."],
    ['Empty', 'Trash', "They'll remove all files from the Trash."],
    ['Empty', 'Trash', 'You are just on the point of destroying the items in the Trash.'],
    ['Empty', 'Trash', 'You are on the verge of taking out every item in the Trash.'],
  ])
})

test('CU-860: fr C - each active imminent row asks, beside its active future that asks on main', () => {
  asks([
    ['Vider', 'Corbeille', 'Vous êtes sur le point de supprimer définitivement les éléments de la corbeille.'],
    ['Vider', 'Corbeille', 'Le système supprimera définitivement les éléments de la corbeille.'],
    ['Vider', 'Corbeille', 'Le système est sur le point d’effacer tous les fichiers de la corbeille.'],
    ['Vider', 'Corbeille', 'Le système effacera tous les fichiers de la corbeille.'],
    ['Vider', 'Corbeille', 'Tu es sur le point d\'éliminer tous les éléments de la corbeille.'],
    ['Vider', 'Corbeille', 'Le système éliminera tous les éléments de la corbeille.'],
    ['Vider', 'Corbeille', 'Nous sommes sur le point de détruire les fichiers de la corbeille.'],
    ['Vider', 'Corbeille', 'Le système détruira les fichiers de la corbeille.'],
  ])
})

test('CU-860: es D - each active imminent row asks, beside its active future that asks on main', () => {
  asks([
    ['Vaciar', 'Papelera', 'Estás a punto de eliminar definitivamente los elementos de la papelera.'],
    ['Vaciar', 'Papelera', 'El sistema eliminará definitivamente los elementos de la papelera.'],
    // the enclitic
    ['Vaciar', 'Papelera', 'El sistema está a punto de borrarlos de la papelera.'],
    ['Vaciar', 'Papelera', 'El sistema los borrará de la papelera.'],
    // 'por', which the passive cell reads ('están por ser eliminados')
    ['Vaciar', 'Papelera', 'Las aplicaciones están por suprimir todos los archivos de la papelera.'],
    ['Vaciar', 'Papelera', 'Las aplicaciones suprimirán todos los archivos de la papelera.'],
    ['Vaciar', 'Papelera', 'Estamos a punto de destruir los archivos de la papelera.'],
    ['Vaciar', 'Papelera', 'El sistema destruirá los archivos de la papelera.'],
  ])
})

test('CU-860: it E - each active imminent row asks, beside its active future that asks on main', () => {
  asks([
    ['Svuota', 'Cestino', 'Il sistema sta per eliminare tutti i file del cestino.'],
    ['Svuota', 'Cestino', 'Il sistema eliminerà tutti i file del cestino.'],
    ['Svuota', 'Cestino', 'Stai per cancellare definitivamente gli elementi del cestino.'],
    ['Svuota', 'Cestino', 'Il sistema cancellerà definitivamente gli elementi del cestino.'],
    // the enclitic after 'sono sul punto di'; 'è' after no letter (CU-825)
    ['Svuota', 'Cestino', 'Le app sono sul punto di rimuoverli dal cestino.'],
    ['Svuota', 'Cestino', 'Le app li rimuoveranno dal cestino.'],
    ['Svuota', 'Cestino', 'Il sistema è sul punto di distruggere tutti i file del cestino.'],
    ['Svuota', 'Cestino', 'Il sistema distruggerà tutti i file del cestino.'],
  ])
})

test('CU-860: pt F - each active imminent row asks, beside its periphrastic future that asks on main', () => {
  asks([
    ['Esvaziar', 'Lixeira', 'Você está prestes a excluir permanentemente os itens da lixeira.'],
    ['Esvaziar', 'Lixeira', 'Você vai excluir permanentemente os itens da lixeira.'],
    // the hyphenated enclitic after 'a ponto de'
    ['Esvaziar', 'Lixeira', 'O sistema está a ponto de apagá-los da lixeira.'],
    ['Esvaziar', 'Lixeira', 'O sistema vai apagá-los da lixeira.'],
    // 'para', which the passive cell reads ('estão para ser excluídos')
    ['Esvaziar', 'Lixeira', 'Os aplicativos estão para remover todos os arquivos da lixeira.'],
    ['Esvaziar', 'Lixeira', 'Os aplicativos vão remover todos os arquivos da lixeira.'],
    ['Esvaziar', 'Lixeira', 'Estamos prestes a deletar os arquivos da lixeira.'],
    ['Esvaziar', 'Lixeira', 'O sistema vai deletar os arquivos da lixeira.'],
  ])
})

test('CU-860: tr G - each active imminent row asks, beside its passive imminent twin that asks on main', () => {
  asks([
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeleri kalıcı olarak silmek üzeresiniz."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeler kalıcı olarak silinmek üzere."],
    ['Boşalt', 'Çöp Sepeti', "Sistem Çöp Sepeti'ndeki tüm dosyaları kaldırmak üzeredir."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki tüm dosyalar kaldırılmak üzeredir."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeleri yok etmek üzereyiz."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeler yok edilmek üzere."],
    ['Boşalt', 'Çöp Sepeti', "Uygulamalar Çöp Sepeti'ndeki öğeleri imha etmek üzereler."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeler imha edilmek üzereler."],
  ])
})

test('CU-860: en - the negated, past, first-person, other-auxiliary, restore and non-trash shapes stay free', () => {
  free([
    ['Empty', 'Trash', 'You are not about to delete the items in the Trash.'],
    ['Empty', 'Trash', "You aren't about to delete the items in the Trash."],
    ['Empty', 'Trash', 'You were about to delete the items in the Trash.'],
    ['Empty', 'Trash', 'The app was on the verge of deleting the items in the Trash.'],
    ['Empty', 'Trash', "I'm about to delete the items in the Trash."],
    ['Empty', 'Trash', 'I am about to delete the items in the Trash.'],
    ['Empty', 'Trash', "You're gonna delete the items in the Trash."],
    ['Empty', 'Trash', 'The app is set to delete the items in the Trash.'],
    ['Empty', 'Trash', 'You are about to restore the items in the Trash.'],
    ['Empty', 'Trash', 'You are about to restore the deleted items in the Trash.'],
    ['Empty', 'Notes', 'You are about to delete all notes.'],
  ])
})

test('CU-860: fr / es / it / pt / tr - the negated, past, first-person, other-auxiliary, restore and non-trash shapes stay free', () => {
  free([
    ['Vider', 'Corbeille', 'Vous n\'êtes pas sur le point de supprimer les éléments de la corbeille.'],
    ['Vider', 'Corbeille', 'Vous étiez sur le point de supprimer les éléments de la corbeille.'],
    ['Vider', 'Corbeille', 'Je suis sur le point de supprimer les éléments de la corbeille.'],
    ['Vider', 'Corbeille', 'Le système est en passe de supprimer les éléments de la corbeille.'],
    ['Vaciar', 'Papelera', 'El sistema no está a punto de eliminar los archivos de la papelera.'],
    ['Vaciar', 'Papelera', 'El sistema estaba a punto de eliminar los archivos de la papelera.'],
    ['Vaciar', 'Papelera', 'Estoy a punto de eliminar los archivos de la papelera.'],
    ['Svuota', 'Cestino', 'Stavi per eliminare tutti i file del cestino.'],
    ['Svuota', 'Cestino', 'Sto per eliminare tutti i file del cestino.'],
    ['Svuota', 'Cestino', 'Il sistema sta per ripristinare tutti i file del cestino.'],
    ['Svuota', 'Note', 'Il sistema sta per eliminare tutte le note.'],
    ['Esvaziar', 'Lixeira', 'Estou prestes a excluir os arquivos da lixeira.'],
    ['Esvaziar', 'Lixeira', 'O sistema está em vias de excluir os arquivos da lixeira.'],
    ['Esvaziar', 'Lixeira', 'O sistema está quase a excluir os arquivos da lixeira.'],
    // pt 'tirar' stays out: taking an item out of the trash restores it
    ['Esvaziar', 'Lixeira', 'Você está prestes a tirar os arquivos da lixeira.'],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeleri silmek üzere değilsiniz."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeleri silmek üzereydiniz."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeleri yok etmek üzereydiniz."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeleri silmek üzereyim."],
  ])
})

// The borders of the sibling cells are not moved: EN_ABOUT_TO (the passive) and the MODAL_* statements are unchanged, so the passive
// 'is about to be' over no trash and the active 'This is about to erase ...' over no trash stay free under the emptying button, and
// the passive under a generic 'OK' was CU-861's MODAL_FUTURE border - CU-861 moves it: it now asks as its going-to twin does.
test('CU-860: the passive \'is about to be\' and the MODAL_LEAD sentence stay free', () => {
  asks([
    ['OK', 'Notes', 'The note is about to be deleted.'],
    ['OK', 'Notes', 'The note is going to be deleted.'],
  ])
  free([
    ['Empty', 'Notes', 'The note is about to be deleted.'],
    ['Empty', 'Trash', 'The items are about to be purged.'],
    ['Empty', 'Trash', 'This is about to erase the volume.'],
    ['Empty', 'Disk Utility', 'This is about to erase the volume.'],
  ])
})

test('CU-860: a negation before the active imminent auxiliary frees it as it frees the future twin, on both routes', () => {
  free([
    ['Empty', 'Trash', 'No app is about to delete the items in the Trash.'],
    ['Empty', 'Trash', 'No app will delete the items in the Trash.'],
    ['Empty', 'Trash', 'No app is on the verge of erasing the items in the Trash.'],
    ['Svuota', 'Cestino', 'Il sistema non sta per eliminare tutti i file del cestino.'],
    ['Esvaziar', 'Lixeira', 'O sistema não está prestes a excluir os arquivos da lixeira.'],
    // "n'est" is no auxiliary ('ne ... aucun'), as 'ne supprimera aucun' is free
    ['Vider', 'Corbeille', 'Le système n\'est sur le point de supprimer aucun élément de la corbeille.'],
    ['Vider', 'Corbeille', 'Le système ne supprimera aucun élément de la corbeille.'],
  ])
  same([
    ['Empty', 'Trash', 'No app is on the verge of erasing the items in the Trash.', 'No app will erase the items in the Trash.'],
    ['Vider', 'Corbeille', 'Le système n\'est sur le point de supprimer aucun élément de la corbeille.', 'Le système ne supprimera aucun élément de la corbeille.'],
    ['Svuota', 'Cestino', 'Il sistema non sta per eliminare tutti i file del cestino.', 'Il sistema non eliminerà tutti i file del cestino.'],
    ['Esvaziar', 'Lixeira', 'O sistema não está prestes a excluir os arquivos da lixeira.', 'O sistema não vai excluir os arquivos da lixeira.'],
  ])
})

// The fold: the rows of the table delta cu-researcher OK'd (09:10Z 28 Nov), each ask row beside its twin that asks on main.
test('CU-860 fold: tr G - the bare third person closing its clause asks, beside its bare passive twin that asks on main', () => {
  asks([
    ['Boşalt', 'Çöp Sepeti', "Sistem Çöp Sepeti'ndeki tüm öğeleri kalıcı olarak silmek üzere."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeler kalıcı olarak silinmek üzere."],
    ['Boşalt', 'Çöp Sepeti', "Uygulama Çöp Sepeti'ndeki dosyaları kaldırmak üzere; lütfen bekleyin."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki dosyalar kaldırılmak üzere; lütfen bekleyin."],
    // a conjunction closes the clause
    ['Boşalt', 'Çöp Sepeti', "Sistem Çöp Sepeti'ndeki öğeleri yok etmek üzere ve bu işlem geri alınamaz."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeler yok edilmek üzere ve bu işlem geri alınamaz."],
    ['Boşalt', 'Çöp Sepeti', "Finder Çöp Sepeti'ndeki her şeyi imha etmek üzere!"],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki her şey imha edilmek üzere!"],
    // a comma closes it too (Q1 of the delta)
    ['Boşalt', 'Çöp Sepeti', "Sistem Çöp Sepeti'ndeki öğeleri silmek üzere, lütfen bekleyin."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeler silinmek üzere, lütfen bekleyin."],
  ])
  // Known rows, recorded by the policy owner (09:20Z 28 Nov): they ask while their en twin is free - rare, accepted with the comma (Q1)
  // and the coordinator that close the clause.
  asks([
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeleri kalıcı olarak silmek üzere, sistem bir işlem başlattı."],
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeleri silmek üzere veya geri yüklemek üzere bir seçenek belirleyin."],
  ])
})

test('CU-860 fold: pt F - \'por\' asks, beside its periphrastic future that asks on main', () => {
  asks([
    ['Esvaziar', 'Lixeira', 'O sistema está por apagar os arquivos da lixeira.'],
    ['Esvaziar', 'Lixeira', 'O sistema vai apagar os arquivos da lixeira.'],
    ['Esvaziar', 'Lixeira', 'Os aplicativos estão por excluí-los da lixeira.'],
    ['Esvaziar', 'Lixeira', 'Os aplicativos vão excluí-los da lixeira.'],
    ['Esvaziar', 'Lixeira', 'Você está por deletar permanentemente os itens da lixeira.'],
    ['Esvaziar', 'Lixeira', 'Você vai deletar permanentemente os itens da lixeira.'],
    ['Esvaziar', 'Lixeira', 'Estamos por remover todos os arquivos da lixeira.'],
    ['Esvaziar', 'Lixeira', 'O sistema vai remover todos os arquivos da lixeira.'],
  ])
})

test('CU-860 fold: the tr purpose, negated, past and -ken shapes, the pt negated, past, first-person, restore and non-trash shapes and es / pt \'por\' without an object stay free', () => {
  free([
    // a verb after 'üzere': the purpose reading
    ['Boşalt', 'Çöp Sepeti', "Çöp Sepeti'ndeki öğeleri silmek üzere Boşalt'a tıklayın."],
    ['Boşalt', 'Çöp Sepeti', "Öğeleri kalıcı olarak kaldırmak üzere Çöp Sepeti'ni açın."],
    ['Boşalt', 'Çöp Sepeti', "Bu araç Çöp Sepeti'ndeki öğeleri silmek üzere tasarlandı."],
    ['Boşalt', 'Çöp Sepeti', "Sistem Çöp Sepeti'ndeki öğeleri silmek üzere değil."],
    ['Boşalt', 'Çöp Sepeti', "Sistem Çöp Sepeti'ndeki öğeleri silmek üzereydi."],
    ['Boşalt', 'Çöp Sepeti', "Sistem Çöp Sepeti'ndeki öğeleri silmek üzereyken işlemi iptal ettiniz."],
    ['Esvaziar', 'Lixeira', 'O sistema não está por apagar os arquivos da lixeira.'],
    ['Esvaziar', 'Lixeira', 'O sistema estava por apagar os arquivos da lixeira.'],
    ['Esvaziar', 'Lixeira', 'Estou por apagar os arquivos da lixeira.'],
    // 'tirar' stays out: taking an item out of the trash restores it
    ['Esvaziar', 'Lixeira', 'Você está por tirar os arquivos da lixeira.'],
    ['Esvaziar', 'Notas', 'O sistema está por apagar todas as notas.'],
    // 'estar por' + an infinitive with the item as subject is 'yet to be V-ed', and a GAP would let a prepositional 'por' through
    // (the policy owner's change): 'por' asks only with an object after the verb, here none
    ['Esvaziar', 'Lixeira', 'Os arquivos da lixeira estão por apagar.'],
    ['Esvaziar', 'Lixeira', 'Os ficheiros do Lixo estão por eliminar.'],
    ['Esvaziar', 'Lixeira', 'Está por sua conta apagar os arquivos da lixeira.'],
    ['Esvaziar', 'Lixeira', 'O assistente está por perto para apagar os arquivos da lixeira.'],
    ['Esvaziar', 'Lixeira', 'Os arquivos da lixeira ficam por apagar.'],
    ['Vaciar', 'Papelera', 'Los archivos de la papelera están por eliminar.'],
  ])
  same([
    ['Esvaziar', 'Lixeira', 'O sistema não está por apagar os arquivos da lixeira.', 'O sistema não vai apagar os arquivos da lixeira.'],
  ])
})

// Re-merge after #1605 (CU-881; the policy owner's note): the window before the auxiliary is read by trashNegated().
test('CU-860 re-merge: pt \'no\' + a possessive before the auxiliary is no negation; the en determiner \'No\' + a listed noun stays one', () => {
  asks([
    ['Esvaziar', 'Lixeira', 'O sistema no seu Mac está prestes a apagar os arquivos da lixeira.'],
    ['Esvaziar', 'Lixeira', 'O sistema no seu Mac vai apagar os arquivos da lixeira.'],
    ['Esvaziar', 'Lixeira', 'O aplicativo no seu computador está por excluí-los da lixeira.'],
  ])
  free([
    ['Empty', 'Trash', 'No Mac is about to delete the items in the Trash.'],
    ['Empty', 'Trash', 'No Mac will delete the items in the Trash.'],
    ['Esvaziar', 'Lixeira', 'O sistema não está prestes a apagar os arquivos da lixeira.'],
  ])
})
