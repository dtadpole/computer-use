import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-355: passport, birth date, tax, national and account number fields named in de, fr, es, ru, ja and ko ask.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const typeInto = (name) => { const r = policy.classify({ type: 'type', text: '4821' }, { url: 'https://forms.example/apply', target: { tag: 'input', role: 'textbox', name, editable: true } }); return r.decision === 'allow' ? 'allow' : r.class }

const NAMES = {
  de: ['Reisepassnummer', 'Geburtsdatum', 'Steuer-ID', 'Personalausweisnummer', 'Sozialversicherungsnummer', 'Kontonummer'],
  fr: ['Numéro de passeport', 'Date de naissance', 'Numéro fiscal', 'Numéro de sécurité sociale', 'Numéro de compte'],
  es: ['Número de pasaporte', 'Fecha de nacimiento', 'DNI', 'NIF', 'Número de cuenta'],
  ru: ['Номер паспорта', 'Дата рождения', 'ИНН', 'СНИЛС', 'Номер счёта'],
  ja: ['旅券番号', '生年月日', 'マイナンバー', '口座番号'],
  ko: ['여권번호', '생년월일', '주민등록번호', '계좌번호'],
}
for (const [locale, names] of Object.entries(NAMES)) {
  test(`CU-355 [${locale}]: personal-ID field names ask`, () => {
    for (const name of names) assert.equal(typeInto(name), 'sensitive_data', name)
  })
}

test('CU-355 negatives: first name, home town, city and name fields stay free', () => {
  for (const name of ['Vorname', 'Wohnort', 'Ciudad', 'Город', '名前', '이름', 'Prénom', 'Nombre']) assert.equal(typeInto(name), 'allow', name)
})
