import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-698 (strict English parity; the English facts are on the issue): changing the account email or phone asks credential in the locales
// as 'Change email' / 'Update phone number' do, negation included; add / verify, past / status and the bare nouns stay free.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name) => { const r = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://app.example/account', target: { tag: 'button', role: 'button', name } }); return r.decision === 'allow' ? [] : (r.classes ?? [r.class]) }

test('CU-698: locale change-email / phone rows ask credential as English (parity, negation included)', () => {
  for (const name of ['Modifier l’adresse e-mail', 'Changer votre e-mail', 'Modifier le numéro de téléphone', 'Mettre à jour le téléphone', 'Ne pas modifier l’adresse e-mail', 'Cambiar correo electrónico', 'Actualizar el número de teléfono', 'Editar correo', 'Alterar e-mail', 'Atualizar número de telefone',
 'Modifica l’e-mail', 'Cambia il numero di telefono', 'E-Mail-Adresse ändern', 'Telefonnummer ändern', 'Ändern Sie Ihre E-Mail-Adresse', 'E-mailadres wijzigen', 'Telefoonnummer wijzigen', 'Изменить адрес электронной почты', 'Сменить номер телефона', 'Обновить почту', 'Не изменять номер телефона',
 'メールアドレスを変更', '電話番号を変更する', 'メールアドレスを更新してください', '이메일 변경', '전화번호 변경하기', '복구 이메일 변경', '更改邮箱', '修改手机号', '更新电话号码', 'E-posta adresini değiştir', 'Telefon numarasını güncelle', 'Change email', "Don't change email"]) assert.ok(click(name).includes('credential'), name)
})

test('CU-698 controls: add / verify, past / status and bare nouns take no credential', () => {
  for (const name of ['Ajouter une adresse e-mail', 'Vérifier l’e-mail', 'Adresse e-mail modifiée', 'Agregar correo', 'Correo electrónico', 'E-Mail-Adresse hinzufügen', 'E-Mail-Adresse geändert', 'Добавить номер телефона', 'Номер телефона изменён', 'メールアドレスを追加', 'メールアドレス', '이메일 추가', '이메일이 변경되었습니다', '添加邮箱', '邮箱', '更改用户名', 'Modifier le nom', 'Add email', 'Email changed']) assert.ok(!click(name).includes('credential'), name)
})

test('CU-698: the mobile nouns ask only with the number / phone noun, so switch-to-mobile-version labels stay free (found by the corpus reclass)', () => {
  for (const name of ['Cambiar el número de móvil', 'Cambiar teléfono móvil', 'Modifier le numéro de portable', 'Alterar número de celular', 'Cambia il numero di cellulare']) assert.ok(click(name).includes('credential'), name)
  for (const name of ['Cambiar a la versión móvil', 'Passer à la version mobile', 'Changer de version mobile', 'Alterar para versão celular', 'Cambia a versione mobile']) assert.ok(!click(name).includes('credential'), name)
})

test('CU-698 r2: zh 立即 and 邮箱地址, the nl verb-first imperative, a ja / ko qualifier noun and Turkish capitals ask credential', () => {
  for (const name of ['立即更改邮箱', '修改邮箱地址', '修改郵箱地址', 'Wijzig e-mailadres', 'Wijzig uw telefoonnummer', '登録メールアドレスを変更', '連絡先メールアドレスを変更する', '연락처 이메일 변경', '회사 전화번호 변경하기',
    'E-POSTA ADRESİNİ DEĞİŞTİR']) assert.ok(click(name).includes('credential'), name)
  for (const name of ['邮箱地址', '登録メールアドレス', 'Wijzig', '연락처 이메일']) assert.ok(!click(name).includes('credential'), name)
})
