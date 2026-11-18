import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-627: leave-group and e-mail opt-out forms with possessive / demonstrative determiners ask submit as their twins do.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name) => { const r = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://app.example/settings', target: { tag: 'button', role: 'button', name } }); return r.decision === 'allow' ? [] : (r.classes ?? [r.class]) }

test('CU-627: leave-group with a possessive asks submit in seven languages', () => {
  for (const name of ['Quitter votre groupe', 'Quittez votre groupe', 'Quitter ton groupe', 'Ihre Gruppe verlassen', 'Verlassen Sie Ihre Gruppe', 'Salir de tu grupo', 'Salga de su grupo', 'Sair do seu grupo',
    'Esci dal tuo gruppo', 'Abbandona il tuo gruppo', 'Je groep verlaten', 'Verlaat uw groep', 'Grubunuzdan çıkın']) assert.ok(click(name).includes('submit'), name)
})

test('CU-627: e-mail opt-outs with a determiner ask submit; 我要退订 asks submit', () => {
  for (const name of ['Meld je af voor onze e-mails', 'Meld u af voor onze e-mails', 'Meld je af voor deze e-mails', 'Von unseren E-Mails abmelden', 'E-Mails abbestellen', 'Se désabonner des e-mails',
    'Darse de baja de nuestros correos', 'Descadastrar e-mails', 'Disiscriviti dalle e-mail', '我要退订']) assert.ok(click(name).includes('submit'), name)
})

test('CU-627 negatives: group pages and e-mail settings stay free', () => {
  for (const name of ['Votre groupe', 'Ihre Gruppe', 'Tu grupo', 'Je groep', 'E-mailvoorkeuren', 'E-Mail-Einstellungen', 'Paramètres e-mail']) assert.deepEqual(click(name), [], name)
})
