import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-594: the Ukrainian trash / deleted / junk folders as drop targets ask delete, as their Russian twins do.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const drop = (name) => { const r = policy.classify({ type: 'drag', from: [10, 10], to: [200, 200] }, { url: 'https://cloud.example/files', target: { role: 'row', name: 'Звіт.pdf' }, dropTarget: { role: 'treeitem', name } }); return r.decision === 'allow' ? 'allow' : (r.classes ?? [r.class]).includes('delete') ? 'delete' : r.class }

test('CU-594: Ukrainian trash, deleted, recently deleted and junk folders ask delete as drop targets', () => {
  for (const name of ['Кошик', 'КОШИК', 'Видалені', 'Видалені елементи', 'Видалені повідомлення', 'Нещодавно видалені', 'Небажана пошта', 'Спам-папка', 'Кошик (3)', 'Недавно удаленные',
    'Смітник', 'Вилучені', 'Вилучені елементи', 'Небажані']) assert.equal(drop(name), 'delete', name)
})

test('CU-594 negatives: ordinary Ukrainian folders and longer names stay free', () => {
  for (const name of ['Документи', 'Завантаження', 'Кошик покупок', 'Налаштування спаму', 'Видалені рядки звіту', 'Робочий стіл', 'Смітники міста', 'Небажані налаштування']) assert.equal(drop(name), 'allow', name)
})
