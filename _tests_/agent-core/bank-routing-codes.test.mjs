import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-601: national bank routing codes and the 'of' account number ask like 'Routing number' / 'Account number'.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const field = (name) => { const r = policy.classify({ type: 'type', text: '1' }, { url: 'https://bank.example/transfer', target: { tag: 'input', role: 'textbox', name } }); return r.decision === 'allow' ? [] : (r.classes ?? [r.class]) }
const asks = (name) => field(name).length > 0

test('CU-601: national routing codes and the of-form account number ask', () => {
  for (const name of ['Bankleitzahl', 'BLZ', 'ABA number', 'ABA routing number', 'Clearing number', 'Clearingnummer', 'Transit number', 'Institution number', 'Code banque', 'Code guichet',
    'Clé RIB', 'RIB', 'ABI', 'CAB', 'Agência', 'Código de agencia', 'Number of your account', 'Number of the bank account']) assert.ok(asks(name), name)
})

test('CU-601 negatives: taxis, cabins, ribbons and counts stay free', () => {
  for (const name of ['Cab number', 'Cab type', 'Ribbon colour', 'Abilities', 'Number of accounts', 'Agency name', 'Transit line', 'Institution name']) assert.ok(!asks(name), name)
})
