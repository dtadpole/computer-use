import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-726 (cu-researcher's 16:05Z sweep): a typed-confirm danger zone in another language - 'Geben Sie LÖSCHEN ein, um zu
// bestätigen' and a bare 'Bestätigen' - acted unasked while its English twin asked delete. The typed-confirm reader now
// also knows the typing verbs, 'to confirm' phrases, typed tokens, destroy / transfer words and back-out buttons of de, fr,
// es, pt, it, nl, ru, ja, zh and ko - additions only; the English rows in typed-confirm.test.mjs are unchanged.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const URL = 'https://app.example/settings'
const zoned = (name, formEntries, zoneWords) => {
  const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { tag: 'button', role: 'button', name, formEntries, ...(zoneWords ? { zoneWords } : {}) } })
  return v.decision === 'allow' ? 'allow' : (v.classes ?? [v.class]).slice().sort().join('+')
}

test('CU-726: a typed-word prompt in each covered language asks delete, as its English twin does', () => {
  const rows = [
    ['Bestätigen', 'Geben Sie LÖSCHEN ein, um zu bestätigen'],
    ['Weiter', 'Zum Bestätigen LÖSCHEN eingeben'],
    ['Confirmer', 'Saisissez SUPPRIMER pour confirmer'],
    ['Confirmar', 'Escribe ELIMINAR para confirmar'],
    ['Confirmar', 'Digite EXCLUIR para confirmar'],
    ['Conferma', 'Digita ELIMINA per confermare'],
    ['Bevestigen', 'Typ VERWIJDEREN om te bevestigen'],
    ['Подтвердить', 'Введите УДАЛИТЬ для подтверждения'],
    ['確認', '確認のため「削除」と入力してください'],
    ['确认', '请输入“删除”以确认'],
    ['확인', "확인하려면 '삭제'를 입력하세요"],
  ]
  for (const [button, entry] of rows) assert.equal(zoned(button, [entry]), 'delete', `${button} | ${entry}`)
})

test('CU-726: the name shape and the split zone work in other languages too', () => {
  assert.equal(zoned('Weiter', ['Projektname'], ['Geben Sie den Namen des Projekts ein.', 'Das Projekt wird endgültig gelöscht.']), 'delete')
  assert.equal(zoned('Continuer', ['Nom du dépôt'], ['Pour confirmer, saisissez le nom du dépôt.', 'Ce dépôt sera supprimé définitivement.']), 'delete')
  assert.equal(zoned('Continuar', ['Nombre'], ['Escribe el nombre del espacio de trabajo.', 'Se eliminará de forma permanente.']), 'delete')
  assert.equal(zoned('Продолжить', ['Название'], ['Введите название проекта.', 'Проект будет удалён без возможности восстановления.']), 'delete')
  assert.equal(zoned('Weiter', ['E-Mail'], ['Geben Sie Ihre E-Mail-Adresse ein, um Ihr Konto zu löschen.']), 'delete', 'a purpose clause in the same sentence')
  assert.equal(zoned('続行', ['リポジトリ名'], ['続行するにはリポジトリ名を入力してください', 'リポジトリを削除します']), 'delete', 'a Japanese compound name noun (#1385 r2)')
  assert.equal(zoned('次へ', ['プロジェクト名'], ['プロジェクト名を入力してください', '新しいプロジェクトを作成します']), 'allow', 'the name shape alone, no act: free')
})

test('CU-726: a localized handover of ownership asks permission', () => {
  assert.equal(zoned('Bestätigen', ['Geben Sie den Namen der Organisation ein, um die Eigentümerschaft zu übertragen']), 'permission')
  assert.equal(zoned('Confirmer', ['Saisissez le nom du projet pour transférer la propriété']), 'permission')
  assert.equal(zoned('Подтвердить', ['Введите имя пользователя, чтобы передать права владельца']), 'permission')
})

test('CU-726: ordinary localized forms stay free', () => {
  assert.equal(zoned('Weiter', ['Geben Sie Ihre E-Mail-Adresse ein']), 'allow')
  assert.equal(zoned('Weiter', ['Geben Sie Ihre Telefonnummer ein'], ['Wir entfernen sie, wenn Sie es wünschen.']), 'allow')
  assert.equal(zoned('Continuer', ["Saisissez l'adresse e-mail d'utilisateur"], ['Les comptes inactifs sont supprimés après un an.']), 'allow', 'French elision is no quote')
  assert.equal(zoned('Siguiente', ['Escribe un mensaje']), 'allow')
  assert.equal(zoned('Далее', ['Введите номер телефона']), 'allow')
  assert.equal(zoned('Далее', ['Введите адрес удалённого сервера']), 'allow', "'удалённый' is also 'remote'")
  assert.equal(zoned('Weiter', ['Adresse des entfernten Servers eingeben']), 'allow', "'entfernt' as 'distant'")
  assert.equal(zoned('次へ', ['名前を入力してください']), 'allow')
  assert.equal(zoned('下一步', ['请输入您的邮箱']), 'allow')
  assert.equal(zoned('다음', ['이메일을 입력하세요']), 'allow')
  assert.equal(zoned('Weiter', ['IBAN EINGEBEN'], ['Alte Konten werden gelöscht.']), 'allow', 'an all-capitals label is styling, not a typed token')
})

test('CU-726: a localized back-out or copy button beside the prompt never confirms it', () => {
  for (const name of ['Abbrechen', 'Annuler', 'Cancelar', 'Annulla', 'Annuleren', 'Отмена', 'キャンセル', '取消', '취소', 'Zurück', 'Fermer', 'Nein']) {
    assert.equal(zoned(name, ['Geben Sie LÖSCHEN ein, um zu bestätigen']), 'allow', name)
  }
  assert.equal(zoned('Kopieren', ['Geben Sie LÖSCHEN ein, um zu bestätigen']), 'allow')
})
