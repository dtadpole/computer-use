import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-692 (strict English parity; the English facts are on the issue): the approve verb asks submit in the locales as 'Approve' does -
// bare, with any object, 'all' / 'now', and negated; past / status forms and the approval nouns stay free.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name) => { const r = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://app.example/requests', target: { tag: 'button', role: 'button', name } }); return r.decision === 'allow' ? [] : (r.classes ?? [r.class]) }

test('CU-692: locale approve rows ask submit as English \'Approve\' (parity, negation included)', () => {
  for (const name of ['Approuver', 'Approuver la demande', 'Tout approuver', 'Ne pas approuver', 'Aprobar', 'Aprobar solicitud', 'Apruebe todo', 'No aprobar', 'Aprovar', 'Approva', 'Genehmigen', 'Antrag genehmigen',
    'Alle genehmigen', 'Genehmigen Sie den Antrag', 'Nicht genehmigen', 'Goedkeuren', 'Verzoek goedkeuren', 'Одобрить', 'Одобрите заявку', 'Утвердить', 'Не одобрять', '申請を承認する', '承認してください', '承認しない',
    '요청을 승인하세요', '승인하기', '批准申请', '不要批准', 'Approve', "Don't approve"]) assert.ok(click(name).includes('submit'), name)
})

test('CU-692 controls: past / status forms and the approval nouns stay free', () => {
  for (const name of ['Approuvé', 'Approbation', 'Tout approuvé', 'Aprobado', 'Aprobación', 'Genehmigt', 'Genehmigung', 'Goedgekeurd', 'Одобрено', 'Одобрение', '承認済み', '승인됨', '已批准', 'Approved', 'Approval']) assert.ok(!click(name).includes('submit'), name)
})

test('CU-692 go (09:15Z): bare ja 承認, ko 승인 and zh 批准 ask submit; de freigeben and zh 同意 stay out', () => {
  for (const name of ['承認', '승인', '批准', '申請を承認']) assert.ok(click(name).includes('submit'), name)
  for (const name of ['承認済み', '승인됨', '已批准', '승인 대기 중']) assert.ok(!click(name).includes('submit'), name)
})

test('CU-692 r2: zh 批准 bare or with a request noun asks; 批准人 / 批准时间 (nouns) and 批准了 / 批准中 / 批准过 (past / status) stay free', () => {
  for (const name of ['批准', '不要批准', '立即批准', '批准申请', '批准此请求', '批准所有变更', '批准合并请求']) assert.ok(click(name).includes('submit'), name)
  for (const name of ['批准人', '批准时间', '批准了', '批准中', '批准过', 'Approver', 'Approval date']) assert.ok(!click(name).includes('submit'), name)
})
