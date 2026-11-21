import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-678 (cu-developer-one's design 16:57Z, strict English parity): transferring ownership asks permission - 'Transfer <slot> ownership'
// in English and the locale twins; negation, past / status forms and the bare noun do not take permission. The es / pt / it purchase
// from the 'transfer' word stays (CU-609's rule-1), so the controls check permission only.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name) => { const r = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://app.example/settings', target: { tag: 'button', role: 'button', name } }); return r.decision === 'allow' ? [] : (r.classes ?? [r.class]) }

test('CU-678: transfer-ownership rows ask permission (English slot form and the locale twins)', () => {
  for (const name of ['Transfer repository ownership', 'Transfer team ownership', 'Transfer project ownership', 'Transfer ownership', 'Transfer ownership to Alex',
 'Transférer la propriété', 'Transférer la propriété du dépôt', 'Transférer la propriété à Alex', 'Transferir la propiedad', 'Transferir propiedad del repositorio', 'Transferir a propriedade', 'Transferir propriedade para Ana',
 'Trasferisci la proprietà', 'Trasferire la proprietà del repository', 'Eigentümerschaft übertragen', 'Inhaberschaft an Alex übertragen', 'Eigentümerschaft des Repositorys übertragen', 'Übertragen Sie die Eigentümerschaft',
 'Eigendom overdragen', 'Eigendom aan Alex overdragen', 'Draag het eigendom over', '所有権を譲渡', '所有権を移転する', 'リポジトリの所有権を譲渡してください', '소유권 이전', '소유권 양도하기', '저장소 소유권을 이전하세요',
 '转移所有权', '转让所有权', '转移仓库的所有权', '所有权转让给张三', 'Sahipliği devret', 'Depo sahipliğini devret', 'Sahipliği Ali\'ye devredin']) assert.ok(click(name).includes('permission'), name)
})

test('CU-678 controls: negation, past / status forms and bare nouns do not take permission', () => {
  for (const name of ["Don't transfer ownership", 'Ownership transferred', 'Owner', 'Ownership', 'Ne pas transférer la propriété', 'Propriété transférée', 'Propriété', 'No transferir la propiedad', 'Propiedad transferida',
 'Eigentümerschaft wurde übertragen', 'Eigentümerschaft nicht übertragen', 'Eigendom overgedragen', '所有権を譲渡しました', '所有権', '소유권이 이전되었습니다', '소유권',
 '所有权已转移', '所有权', 'Sahiplik devredildi', 'Sahiplik']) assert.ok(!click(name).includes('permission'), name)
})
