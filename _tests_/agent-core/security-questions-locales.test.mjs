import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-605: security questions / answers and the mother's maiden name in seven languages are sensitive_data, as in English.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const field = (name) => { const r = policy.classify({ type: 'type', text: 'x' }, { url: 'https://bank.example/recovery', target: { tag: 'input', role: 'textbox', name } }); return r.decision === 'allow' ? [] : (r.classes ?? [r.class]) }

test('CU-605: security questions, answers and maiden names are sensitive_data in seven languages', () => {
  for (const name of ['Sicherheitsfrage', 'Antwort auf die Sicherheitsfrage', 'Sicherheitsantwort', 'Mädchenname der Mutter', 'Réponse secrète', 'Question secrète', 'Réponse à la question de sécurité',
    'Nom de jeune fille de votre mère', 'Respuesta de seguridad', 'Pregunta de seguridad', 'Apellido de soltera de su madre', 'Resposta de segurança', 'Pergunta de segurança', 'Risposta di sicurezza',
    'Domanda di sicurezza', 'Güvenlik sorusu', 'Güvenlik sorusunun cevabı', 'Kızlık soyadı', 'Beveiligingsvraag', 'Geheime vraag']) assert.ok(field(name).includes('sensitive_data'), name)
})

test('CU-605 negatives: ordinary questions and names stay free', () => {
  for (const name of ['Ihre Frage an uns', 'Votre question', 'Pregunta frecuente', 'Domanda', 'Soru başlığı', 'Vraag stellen', 'Vorname', 'Nom', 'Apellido']) assert.ok(!field(name).includes('sensitive_data'), name)
})
