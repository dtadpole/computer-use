import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-633 (adding half; cu-developer-one's ruling): a determiner plus a trailing adverb keeps a cancel-subscription label's class,
// and a bare 'Cancel now' (or a locale twin) cancels the plan on a billing / subscription / membership page.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name, url = 'https://app.example/account/billing') => {
  const r = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { tag: 'button', role: 'button', name } })
  return r.decision === 'allow' ? [] : (r.classes ?? [r.class])
}

test('CU-633: cancel + determiner + subscription + trailing adverb asks delete, on any page', () => {
  for (const name of ['Cancel my subscription now', 'Cancel your subscription now', 'Cancel the subscription now', 'Cancel this subscription now',
    'Cancel our subscription now', 'Cancel my subscription immediately', 'Cancel my subscription', 'Kündige dein Abo jetzt', 'Annuler mon abonnement maintenant',
    'Cancelar mi suscripción ahora', 'Annulla il mio abbonamento ora']) {
    assert.deepEqual(click(name), ['delete'], name)
    assert.deepEqual(click(name, 'https://news.example/article/42'), ['delete'], `${name} (news page)`)
  }
})

test('CU-633: membership / plan with a determiner and an adverb keep purchase', () => {
  for (const name of ['Cancel my membership now', 'Cancel your plan now', 'Kündige jetzt deine Mitgliedschaft', 'Annulla ora il mio piano']) assert.ok(click(name).includes('purchase'), name)
})

test('CU-633: a bare Cancel now and its locale twins ask delete on a billing / subscription / membership page', () => {
  const twins = ['Cancel now', 'Jetzt kündigen', 'Annuler maintenant', 'Cancelar ahora', 'Annulla ora', 'Cancelar agora', 'Nu opzeggen', 'Şimdi iptal et', '立即取消']
  for (const url of ['https://app.example/account/billing', 'https://app.example/subscriptions', 'https://shop.example/membership/manage', 'https://billing.example.com/']) {
    for (const name of twins) assert.deepEqual(click(name, url), ['delete'], `${name} @ ${url}`)
  }
})

test('CU-633: elsewhere a bare Cancel now keeps main (purchase in English, free in the locales) - the narrowing half waits on rule-1', () => {
  for (const url of ['https://news.example/article/42', 'https://app.example/settings/profile', 'https://app.example/uploads', 'https://app.example/billingsupport']) {
    assert.deepEqual(click('Cancel now', url), ['purchase'], url)
    for (const name of ['Jetzt kündigen', 'Annuler maintenant', 'Nu opzeggen', '立即取消']) assert.deepEqual(click(name, url), [], `${name} @ ${url}`)
  }
})

test('CU-633 near misses keep their class on a billing page', () => {
  for (const name of ['Cancel', 'Cancel changes', 'Cancel anytime', 'Cancel upload now', 'Cancel download now', 'My subscription now', 'Annuler', 'Kündigen']) assert.deepEqual(click(name), [], name)
  for (const name of ['Cancel order now', 'Cancel my order now', 'Pay now', 'Buy now']) assert.deepEqual(click(name), ['purchase'], name)
})
