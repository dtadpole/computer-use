import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-608: bank-transfer confirmations in five languages ask purchase, as English 'Confirm transfer' does.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name) => { const r = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://bank.example/transfer', target: { tag: 'button', role: 'button', name } }); return r.decision === 'allow' ? [] : (r.classes ?? [r.class]) }

test('CU-608: transfer confirmations ask purchase in German, French, Spanish, Dutch and Turkish', () => {
  for (const name of ['Jetzt überweisen', 'Überweisung bestätigen', 'Überweisung ausführen', 'Effectuer le virement', 'Confirmer le virement', 'Faire un virement', "Envoyer de l'argent",
    'Realizar transferencia', 'Confirmar transferencia', 'Confirmar la transferencia', 'Enviar dinero', 'Overboeking bevestigen', 'Bevestig de overboeking', 'Transferi onayla', 'Havaleyi onaylayın']) assert.ok(click(name).includes('purchase'), name)
})

test('CU-608 negatives: transfer history tabs and details stay free', () => {
  for (const name of ['Überweisungen', 'Überweisungsdetails', 'Virements', 'Historique des virements', 'Transferencias', 'Mis transferencias', 'Overboekingen']) assert.deepEqual(click(name), [], name)
})
