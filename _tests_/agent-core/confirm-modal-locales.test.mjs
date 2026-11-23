import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-729 (cu-researcher's sweep): a localized confirm modal's affirmative button is judged by the modal's title, as English 'OK' /
// 'Yes' is (CU-507); the same buttons in a harmless dialog, and outside any dialog, stay free.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const press = (name, extra = {}, url = 'https://notes.example/app') => {
  const v = policy.classify({ type: 'click', x: 5, y: 5, button: 'left' }, { url, target: { tag: 'button', role: 'button', name, ...extra } })
  return v.decision === 'allow' ? [] : (v.classes ?? [v.class])
}
const desk = (name, dialogName) => {
  const v = policy.classify({ type: 'click', x: 5, y: 5, button: 'left' }, { url: 'desktop://com.apple.Notes', frontmostBundleId: 'com.apple.Notes', target: { role: 'AXButton', name, dialogName, inWebArea: false } })
  return v.decision === 'allow' ? [] : (v.classes ?? [v.class])
}

const DELETE = [
  ['Ja', 'Diese Notiz löschen?'], ['Löschen bestätigen', 'Möchten Sie diese Notiz wirklich löschen?'], ['Oui', 'Supprimer cette note ?'], ['Confirmer', 'Voulez-vous vraiment supprimer cette note ?'],
  ['Sí', '¿Eliminar esta nota?'], ['Aceptar', '¿Desea eliminar esta nota?'], ['Sì', 'Elimina questa nota?'], ['Sim', 'Excluir esta nota?'], ['Ja', 'Deze notitie verwijderen?'],
  ['Да', 'Удалить эту заметку?'], ['はい', 'このメモを削除しますか？'], ['确定', '确定要删除这条笔记吗？'], ['확인', '이 메모를 삭제하시겠습니까?'], ['OK', 'Diese Notiz löschen?'], ['Ja, fortfahren', 'Diese Notiz löschen?'],
]

test('CU-729: a localized affirmative in a delete dialog asks, on the web and on the desktop', () => {
  for (const [name, dialogName] of DELETE) {
    assert.ok(press(name, { dialogName }).length > 0, `${name} / ${dialogName}`)
    assert.ok(desk(name, dialogName).length > 0, `desktop ${name} / ${dialogName}`)
  }
})

test("CU-729 (cu-researcher's sweep 2): the button's own language decides - a localized affirmative under an English title asks, and a desktop alert's 'Fortfahren' / '계속' too", () => {
  assert.ok(press('Ja', { dialogName: 'Delete this repository?' }).length > 0, 'Ja / English title')
  assert.ok(press('はい', { dialogName: 'Delete this repository?' }).length > 0, 'はい / English title')
  assert.ok(desk('Fortfahren', 'Alle Objekte im Papierkorb endgültig löschen?').length > 0, 'Fortfahren / empty the trash')
  assert.ok(desk('계속', '휴지통의 항목을 영구적으로 삭제하시겠습니까?').length > 0, '계속 / empty the trash')
})

test('CU-729: a localized payment confirm and an ownership transfer ask too', () => {
  assert.ok(press('Ja', { dialogName: 'Jetzt bezahlen?' }).length > 0, 'de payment')
  assert.ok(press('Confirmer', { dialogName: 'Payer maintenant ?' }).length > 0, 'fr payment')
  assert.ok(press('はい', { dialogName: '今すぐ購入しますか？' }).length > 0, 'ja purchase')
})

test('CU-729 near collisions: the same buttons in a harmless dialog, and outside any dialog, stay free', () => {
  for (const [name, dialogName] of [['Ja', 'Änderungen anzeigen?'], ['Oui', 'Afficher les détails ?'], ['はい', '詳細を表示しますか？'], ['确定', '显示详细信息吗？'], ['확인', '자세히 보기'], ['Да', 'Совет дня']]) {
    assert.deepEqual(press(name, { dialogName }), [], `${name} / ${dialogName}`)
  }
  for (const name of ['Ja', 'Oui', 'Sí', 'はい', '确定', '확인', 'Да', 'Weiter']) assert.deepEqual(press(name), [], `${name} outside a dialog`)
})
