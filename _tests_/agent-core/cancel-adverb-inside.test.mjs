import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-629: one adverb inside a cancel / end subscription-family label keeps the English twin's class.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name) => { const r = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://app.example/account/subscription', target: { tag: 'button', role: 'button', name } }); return r.decision === 'allow' ? [] : (r.classes ?? [r.class]) }

test('CU-629: cancel subscription with one adverb inside asks delete', () => {
  for (const name of ['Abonnement direct opzeggen', 'Abonnement nu opzeggen', 'Abo jetzt kündigen', 'Abonnement sofort kündigen', 'Kündigen Sie jetzt Ihr Abo', "Annuler maintenant l'abonnement",
    'Cancelar ahora la suscripción', 'Cancelar agora a assinatura', "Annulla subito l'abbonamento", 'Aboneliği hemen iptal et']) assert.ok(click(name).includes('delete'), name)
})

test('CU-629: end subscription / any membership verb with one adverb inside asks purchase', () => {
  for (const name of ['Mitgliedschaft sofort beenden', 'Abo jetzt beenden', 'Lidmaatschap direct opzeggen', 'Abonnement nu stopzetten', 'Üyeliği hemen iptal et', 'Cancelar ahora la membresía', 'End subscription now', 'Terminate subscription now', 'Stop my subscription now']) assert.ok(click(name).includes('purchase'), name)
})

test('CU-629 negatives: an adverb alone or with a page noun stays free', () => {
  for (const name of ['Jetzt', 'Abo jetzt ansehen', 'Abonnement nu bekijken', 'Plan ahora', 'Mi suscripción ahora', 'Annulla subito']) assert.deepEqual(click(name), [], name)
})

test('CU-629: the 退订 modifier family keeps each twin class (cu-developer-one 19:10Z)', () => {
  for (const name of ['立即退订', '马上退订', '现在退订', '一键退订', '确认退订', '立即退订邮件', '一键退订短信']) assert.ok(click(name).includes('submit'), name)
  for (const name of ['立即退订会员', '一键退订套餐', '确认退订服务']) assert.ok(click(name).includes('purchase'), name)
  for (const name of ['退订须知', '退订政策', '立即查看']) assert.ok(!click(name).includes('submit'), name)
})
