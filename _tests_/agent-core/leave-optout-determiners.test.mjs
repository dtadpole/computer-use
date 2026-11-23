import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-627: leave-group and e-mail opt-out forms with possessive / demonstrative determiners ask submit as their twins do.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name) => { const r = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://app.example/settings', target: { tag: 'button', role: 'button', name } }); return r.decision === 'allow' ? [] : (r.classes ?? [r.class]) }

test('CU-627: leave-group with a possessive asks submit in seven languages', () => {
  for (const name of ['Quitter votre groupe', 'Quittez votre groupe', 'Quitter ton groupe', 'Ihre Gruppe verlassen', 'Verlassen Sie Ihre Gruppe', 'Salir de tu grupo', 'Salga de su grupo', 'Sair do seu grupo',
    'Esci dal tuo gruppo', 'Abbandona il tuo gruppo', 'Je groep verlaten', 'Verlaat uw groep', 'Grubunuzdan çıkın',
    'Quitter notre groupe', 'Quitte ton groupe', 'Verlaat onze groep', 'Onze groep verlaten', 'Sal de tu grupo', 'Salir de nuestro grupo', 'Abandonar tu grupo', 'Abandone su grupo', 'Sai do teu grupo', 'Deixe o seu grupo',
    'Esci da questo gruppo', 'Lascia il nostro gruppo', 'Verlasse unsere Gruppe', 'Unsere Gruppe verlassen',
    'Salir de mi grupo', 'Salir de nuestro grupo', 'Esci dal mio gruppo', 'Sair do meu grupo', 'Sair do nosso grupo',
    'Salir de vuestro grupo', 'Salid del grupo', 'Abandonad vuestro grupo', 'Sair do vosso grupo', 'Esci dal vostro gruppo', 'Verlasst eure Gruppe', 'Eure Gruppe verlassen', 'Jullie groep verlaten', 'Quitter leur groupe',
    'Uscite dal vostro gruppo', 'Abbandonate il vostro gruppo', 'Esca dal suo gruppo', 'Saiam do vosso grupo', 'Deixem o grupo', 'Salgan de su grupo', 'Abandonen el grupo', 'Quittons le groupe']) assert.ok(click(name).includes('submit'), name)
})

test('CU-627: e-mail opt-outs with a determiner ask submit; 我要退订 asks submit', () => {
  for (const name of ['Meld je af voor onze e-mails', 'Meld u af voor onze e-mails', 'Meld je af voor deze e-mails', 'Von unseren E-Mails abmelden', 'E-Mails abbestellen', 'Se désabonner des e-mails',
    'Darse de baja de nuestros correos', 'Descadastrar e-mails', 'Disiscriviti dalle e-mail', '我要退订',
    'Melde dich von unseren E-Mails ab', 'Melden Sie sich vom Newsletter ab', '我想退订', '我想立即退订']) assert.ok(click(name).includes('submit'), name)
})

test('CU-627 negatives: group pages and e-mail settings stay free', () => {
  for (const name of ['Votre groupe', 'Ihre Gruppe', 'Tu grupo', 'Je groep', 'E-mailvoorkeuren', 'E-Mail-Einstellungen', 'Paramètres e-mail', 'Notre groupe', 'Unsere Gruppe', 'Melde dich an', '我想查看']) assert.deepEqual(click(name), [], name)
})
