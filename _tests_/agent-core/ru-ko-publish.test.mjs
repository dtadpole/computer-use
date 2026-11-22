import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-693 (strict English parity; the English facts are on the issue): the ru / ko publish verb asks submit as 'Publish' / 'Post' do -
// bare, with an object, 'now', negated; past / status forms, the nouns and the un- / re- forms stay free.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name) => { const r = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://app.example/editor', target: { tag: 'button', role: 'button', name } }); return r.decision === 'allow' ? [] : (r.classes ?? [r.class]) }

test('CU-693: ru / ko publish rows ask submit as English \'Publish\' (parity, negation included)', () => {
  for (const name of ['Опубликовать', 'Опубликовать пост', 'Опубликуйте статью', 'Сейчас опубликовать', 'Не публиковать', '게시', '게시하기', '게시하세요', '글을 게시하기', '지금 게시', '발행', '발행하기', '게시하지 마세요', 'Publish', 'Post', "Don't publish"]) assert.ok(click(name).includes('submit'), name)
})

test('CU-693 controls: past / status forms, nouns and un-publish forms stay free', () => {
  for (const name of ['Опубликовано', 'Публикация', 'Снять с публикации', 'Опубликован', '게시됨', '게시되었습니다', '게시 취소', '게시물', '게시판', '발행됨', 'Published', 'Unpublish']) assert.ok(!click(name).includes('submit'), name)
})

test('CU-693 r2: a bare object noun before ko 게시 / 발행 asks, as CU-692\'s ko approve line', () => {
  for (const name of ['글 게시', '공지 발행', '글 게시하기']) assert.ok(click(name).includes('submit'), name)
  for (const name of ['게시 취소', '글이 게시되었습니다', '게시판']) assert.ok(!click(name).includes('submit'), name)
})
