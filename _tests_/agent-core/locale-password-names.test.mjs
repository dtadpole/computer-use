import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPolicy, namesPasswordField } from '../../_tools_/agent-core/policy.mjs'

// CU-607 (cu-coordinator 03:21Z, go: credential): a password-named field is credential in every covered language, whatever
// its input type - a shown password (a plain text input after a show-password toggle) asks credential as 'Password' does,
// never sensitive_data, so a sensitive_data pre-approval never covers it.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const typeInto = (name, inputType = 'text') => {
  const v = policy.classify({ type: 'type', text: 'x1y2z3' }, { url: 'https://login.fixture.example/signin', target: { tag: 'input', role: 'textbox', inputType, name } })
  return v.decision === 'allow' ? [] : (v.classes ?? [v.class])
}

test('CU-607: the locale password names ask credential on a plain text input, as English Password does', () => {
  assert.ok(typeInto('Password').includes('credential'), 'English twin')
  for (const name of ['Passwort', 'Ihr Passwort', 'Anmeldepasswort', 'Kennwort', 'Mot de passe', 'Nouveau mot de passe', 'Contraseña', 'Contrasena',
    'Senha', 'Nova senha', 'Wachtwoord', 'Nieuw wachtwoord', 'Şifre', 'Şifreniz', 'Parola', 'Parolanızı girin', 'Пароль', 'Новый пароль',
    'パスワード', '비밀번호']) {
    assert.ok(typeInto(name).includes('credential'), name)
  }
})

test('CU-607: the desktop reads the same names as a password field (the key hand-off), hints aside', () => {
  const entry = (name) => ({ tag: 'input', role: 'textbox', inputType: 'text', name })
  for (const name of ['Passwort', 'Mot de passe', 'Contraseña', 'Senha', 'Wachtwoord', 'Şifre', 'Пароль', 'パスワード', '비밀번호']) assert.equal(namesPasswordField(entry(name)), true, name)
  assert.equal(namesPasswordField(entry('Password hint')), false)
})

test('CU-607 controls: Italian parola chiave and the other sign-in fields take credential only as their English twins do', () => {
  assert.ok(!typeInto('Parola chiave').includes('credential'), 'Parola chiave')
  assert.ok(!typeInto('Parole chiave').includes('credential'), 'Parole chiave')
  for (const [en, name] of [['Keyword', 'Parola chiave'], ['Username', 'Benutzername'], ['Username', 'Nom d\u2019utilisateur'], ['Email', 'Correo electrónico'], ['Search', 'Rechercher'], ['Search', 'Suche']]) {
    assert.equal(typeInto(name).includes('credential'), typeInto(en).includes('credential'), `${name} vs ${en}`)
  }
})
