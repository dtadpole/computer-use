import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createAppPolicy } from '../../_tools_/agent-core/app-policy.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-293 (cu-developer-one; cu-coordinator: Urgent - the owner works in Chinese): every name class in Simplified and
// Traditional Chinese, on the desktop and the web. Language-free rules (secure fields, key equivalents, extensions,
// excluded apps by id) never depended on names.
const FIXTURE = 'ai.reflection.cu.fixture'
const STORE = 'com.apple.AppStore'
const tmp = mkdtempSync(join(tmpdir(), 'cu-293-'))
after(() => rmSync(tmp, { recursive: true, force: true }))
const store = createAppApprovals({ path: join(tmp, 'a.json') })
for (const id of [FIXTURE, STORE]) store.grantAlways(id, { by: 'api' })
const desktop = createAppPolicy({ scope: [FIXTURE, STORE], approvals: store })
const web = createPolicy({ sitePolicy: () => 'allow' })
const click = { type: 'click', x: 1, y: 1, button: 'left' }
const control = (name, role = 'AXButton', app = FIXTURE) => ({ origin: app, role, name, fingerprint: name, defaultButtonRead: true })
const onDesktop = (name, role, app = FIXTURE) => desktop.classify(click, { frontmostBundleId: app, target: control(name, role, app) })
const onWeb = (name) => web.classify(click, { url: 'https://shop.example/', target: { role: 'button', name } })
const judged = (v) => (v.decision === 'allow' ? 'allow' : v.decision === 'handoff' || v.decision === 'block' ? v.decision : v.class)

test('CU-293: Chinese send, delete, purchase and permission labels ask their class - desktop and web, both scripts', () => {
  for (const [name, cls] of [
    ['发送', 'submit'], ['傳送', 'submit'], ['提交', 'submit'], ['加入会议', 'submit'], ['加入會議', 'submit'], ['视频通话', 'submit'], ['合并', 'submit'],
    ['删除', 'delete'], ['刪除', 'delete'], ['移到废纸篓', 'delete'], ['清空垃圾桶', 'delete'], ['不保存', 'delete'], ['替换', 'delete'],
    ['购买', 'purchase'], ['立即购买', 'purchase'], ['購買', 'purchase'], ['付款', 'purchase'], ['结账', 'purchase'], ['訂閱', 'purchase'], ['免费试用', 'purchase'],
    // cu-researcher's Apple-guide labels (zh-cn / zh-tw from the same page ids).
    ['丟到垃圾桶', 'delete'], ['清倒废纸篓', 'delete'], ['不存储', 'delete'], ['不儲存', 'delete'],
    // cu-researcher on #145: Never Save is a standing choice (permission), Reply asks as English Reply does.
    ['永不保存', 'permission'], ['永不儲存', 'permission'], ['回复', 'submit'], ['回覆', 'submit'],
    ['始终允许', 'permission'], ['總是允許', 'permission'], ['不再询问', 'permission'], ['记住我的选择', 'permission'], ['保存密码', 'permission'], ['分享', 'permission'],
  ]) {
    assert.equal(judged(onDesktop(name)), cls, `desktop ${name}`)
    assert.equal(judged(onWeb(name)), cls, `web ${name}`)
  }
})

test('CU-293: ordinary Chinese labels stay free', () => {
  for (const name of ['取消', '完成', '搜索', '设置', '下一步', '返回', '好', '查看', '详情', '记住我', '转发', '合并单元格']) {
    assert.equal(judged(onDesktop(name)), 'allow', `desktop ${name}`)
    assert.equal(judged(onWeb(name)), 'allow', `web ${name}`)
  }
})

test('CU-293: Chinese field names - a password field is handed off on the desktop, D-061 names ask when typed, plain names stay free', () => {
  const type = { type: 'type', text: 'abc123' }
  for (const name of ['密码', '密碼', '支付密码']) {
    assert.equal(desktop.classify(type, { frontmostBundleId: FIXTURE, target: { ...control(name, 'AXTextField'), editable: true } }).decision, 'handoff', name)
  }
  for (const name of ['身份证号', '身分證字號', '银行卡号', '手机号', '出生日期', '验证码', '纳税人识别号', '银行账号']) {
    assert.equal(web.classify(type, { url: 'https://x.example/', target: { role: 'textbox', name, editable: true } }).decision, 'confirm', name)
  }
  for (const name of ['用户名', '昵称', '城市', '备注']) {
    assert.equal(web.classify(type, { url: 'https://x.example/', target: { role: 'textbox', name, editable: true } }).decision, 'allow', name)
  }
  assert.equal(onDesktop('修改密码').decision, 'handoff', 'a password change is the person\'s, as in English')
})

test('CU-293: desktop titles - Writing Tools, the App Store and a runner in Chinese', () => {
  assert.equal(onDesktop('校对', 'AXMenuItem').rule, 'writing_tools')
  assert.equal(desktop.classify(click, { frontmostBundleId: FIXTURE, target: { ...control('改写', 'AXMenuItem'), menuPath: ['编辑', '写作工具', '改写'] } }).rule, 'writing_tools', 'under a 写作工具 parent')
  assert.equal(judged(onDesktop('获取', 'AXButton', STORE)), 'install')
  assert.equal(judged(onDesktop('更新内容', 'AXButton', STORE)), 'allow', 'What\'s New is no update')
  assert.equal(desktop.classify(click, { frontmostBundleId: FIXTURE, target: { ...control('终端', 'AXMenuItem'), menuPath: ['文件', '打开方式', '终端'] } }).decision, 'block', 'Open With > 终端')
})

test('CU-293 on cu-researcher\'s review: Chinese Reply follows CU-157 - free when every entry reads empty, as English Reply', () => {
  for (const name of ['回复', '回覆', 'Reply']) {
    assert.equal(web.classify(click, { url: 'https://mail.example/', target: { role: 'button', name, textEntered: false } }).decision, 'allow', name)
  }
})
