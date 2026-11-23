import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-717 (a narrowing under D-110; the #1364 reviewers' over-asks): Italian 'parola' (word) led into an Italian phrase and
// Korean 암호문 / 암호학 no longer name a password. Exactly those shapes go back to their class before CU-607; every other
// password-word name keeps credential.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const typeInto = (name) => {
  const v = policy.classify({ type: 'type', text: 'x1y2z3' }, { url: 'https://site.fixture.example/search', target: { tag: 'input', role: 'textbox', inputType: 'text', name } })
  return v.decision === 'allow' ? [] : (v.classes ?? [v.class])
}

test('CU-717: the freed shapes take no credential', () => {
  for (const name of ['Parola da cercare', 'Parola del giorno', 'Parola della settimana', 'Parola che inizia con', 'Parole degli utenti', 'Parola per cercare',
    '암호문', '암호문 입력', '암호학', '암호학 개론']) {
    assert.ok(!typeInto(name).includes('credential'), name)
  }
})

test('CU-717: every other password-word name keeps credential', () => {
  for (const name of ['Parola', "Parola d'ordine", "Parola d'accesso", 'Parola di passo', 'Parola persa', "Parola dell'anno", 'Parolanız', 'Parolanızı girin',
    'Yeni parola', 'Parola (tekrar)', '암호', 'Wi-Fi 암호', '암호 입력', '새 암호', '암호를 입력하세요', '암호문 비밀번호', 'Password', 'Passwort']) {
    assert.ok(typeInto(name).includes('credential'), name)
  }
  // The CU-607 cuts stand as they were: 'parola chiave' and 암호화 never name a password.
  for (const name of ['Parola chiave', 'Parole chiave', '암호화 설정']) assert.ok(!typeInto(name).includes('credential'), name)
})
