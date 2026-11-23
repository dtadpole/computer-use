import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPolicy, namesPasswordField } from '../../_tools_/agent-core/policy.mjs'

// CU-716 (CU-607's near forms, cu-coordinator 08:00Z): a password word that is inflected (the Russian singular cases) or
// continued inside a compound (German, Dutch) names a password field as its English twin does, so typing into it asks
// credential whatever its input type. Plurals stay as English 'Passwords' does: free of credential.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const typeInto = (name, inputType = 'text') => {
  const v = policy.classify({ type: 'type', text: 'x1y2z3' }, { url: 'https://login.fixture.example/signin', target: { tag: 'input', role: 'textbox', inputType, name } })
  return v.decision === 'allow' ? [] : (v.classes ?? [v.class])
}

test('CU-716: an inflected or continued password word asks credential as its English twin does', () => {
  for (const [en, name] of [['Password confirmation', 'Подтверждение пароля'], ['Repeat password', 'Повтор пароля'], ['Sign in with password', 'Войти с паролем'],
    ['About the password', 'О пароле'], ['Password confirmation', 'Passwortbestätigung'], ['Password confirmation', 'Kennwortbestätigung'],
    ['Repeat password', 'Passwortwiederholung'], ['Password field', 'Kennwortfeld'], ['Change of password', 'Änderung des Passworts'],
    ['Change of password', 'Änderung des Kennwortes'], ['Password confirmation', 'Wachtwoordbevestiging'], ['Password management', 'Wachtwoordenbeheer'],
    ['Login password confirmation', 'Anmeldepasswortbestätigung']]) {
    assert.ok(typeInto(en).includes('credential'), `English twin ${en}`)
    assert.ok(typeInto(name).includes('credential'), name)
  }
})

test('CU-716 controls: plurals and look-alike words take credential only as their English twins do', () => {
  assert.ok(!typeInto('Passwords').includes('credential'), 'English plural twin')
  for (const name of ['Пароли', 'Паролей', 'Паролями', 'Passwörter', 'Kennwörter', 'Passworte', 'Passworten', 'Wachtwoorden', 'Stichwort']) {
    assert.ok(!typeInto(name).includes('credential'), name)
  }
})

test('CU-716 (the #1364 reviewers\' near forms): the Russian adjective, the old German spelling and the PIN in other words ask credential as their English twins do', () => {
  for (const [en, name] of [['Passphrase', 'Парольная фраза'], ['Passphrase', 'Введите парольную фразу'], ['Password policies', 'Парольные политики'],
    ['Password', 'Paßwort'], ['Forgot password?', 'Paßwort vergessen?'], ['Password confirmation', 'Paßwortbestätigung'], ['Login password', 'Anmeldepaßwort'],
    ['PIN', 'Geheimzahl'], ['Your PIN', 'Ihre Geheimzahl'], ['PIN', '暗証番号'], ['PIN', '暗証番号を入力'], ['PIN code', 'ПИН-код'], ['PIN', 'ПИН'], ['PIN', 'Пин'],
    ['PIN code', 'Pincode'], ['PIN code', 'Uw pincode']]) {
    assert.ok(typeInto(en).includes('credential'), `English twin ${en}`)
    assert.ok(typeInto(name).includes('credential'), name)
  }
  for (const [en, name] of [['Number', 'Zahl'], ['Secret', 'Geheimnis'], ['Number', '番号'], ['Code', 'Код'], ['Ping', 'Пинг'], ['Pinboard', 'Pinnwand'], ['Pinned', 'Angepinnt']]) {
    assert.equal(typeInto(name).includes('credential'), typeInto(en).includes('credential'), `${name} vs ${en}`)
  }
})

test('CU-716: a homoglyph-mixed name reads as the plain one, and the desktop hand-off reads the new forms', () => {
  assert.ok(typeInto('Подтверждение пaроля').includes('credential'), 'a Latin a inside the Russian word')
  assert.ok(typeInto('Pаsswortbestätigung').includes('credential'), 'a Cyrillic a inside the German compound')
  const entry = (name) => ({ tag: 'input', role: 'textbox', inputType: 'text', name })
  for (const name of ['Подтверждение пароля', 'Passwortbestätigung', 'Wachtwoordbevestiging']) assert.equal(namesPasswordField(entry(name)), true, name)
  assert.equal(namesPasswordField(entry('Passwörter')), false, 'a plural is no password field')
})
