import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { IDE_APPS, isIdeApp } from '../../_tools_/agent-core/app-kinds.mjs'
import { createAppPolicy } from '../../_tools_/agent-core/app-policy.mjs'

/**
 * CU-279 (the owner works in Chinese): an IDE's integrated terminal runs what is typed. E5 refuses keys into a target
 * named for a terminal or a shell in English; a Chinese or Japanese build names the input '终端 1, node' or 'ターミナル 2,
 * node', which no English word catches. Two nets: in an IDE (a kind, by bundle id), an editable target named
 * '<word> <number>, <title>' is a terminal, whatever the language; and the terminal's word in other languages counts in any
 * app. The titles here are 'node', not a shell, so E5's zsh/bash words cannot pass the rows by accident (cu-researcher).
 */

const VSCODE = 'com.microsoft.VSCode'
const CURSOR = 'com.todesktop.230313mzl4w4u92'
const PYCHARM = 'com.jetbrains.pycharm'
const ZED = 'dev.zed.Zed'
const FIXTURE = 'ai.reflection.cu.fixture'
const APPS = [VSCODE, CURSOR, PYCHARM, ZED, FIXTURE]
const tmp = mkdtempSync(join(tmpdir(), 'cu-279-'))
after(() => rmSync(tmp, { recursive: true, force: true }))
const store = createAppApprovals({ path: join(tmp, 'a.json') })
for (const id of APPS) store.grantAlways(id, { by: 'api' })
const policy = createAppPolicy({ scope: APPS, approvals: store })
const field = (app, name, role = 'AXTextArea') => ({ origin: app, role, name, editable: true, fingerprint: `${app}:${name}`, defaultButtonRead: true })
const typing = (app, name, role) => policy.classify({ type: 'type', text: 'npm run build' }, { frontmostBundleId: app, target: field(app, name, role) })
const pressing = (app, name) => policy.classify({ type: 'keypress', keys: ['ENTER'] }, { frontmostBundleId: app, target: field(app, name) })
const rule = (v) => (v.decision === 'block' ? v.rule : v.decision)

test('CU-279: in an IDE, an input named <word> <number>, <title> is a terminal in any language - typing and Return are refused', () => {
  for (const app of [VSCODE, CURSOR, PYCHARM, ZED]) {
    for (const name of ['Terminal 1, node', '终端 1, node', '終端機 2, node', 'ターミナル 2, node', '터미널 1, node', 'Terminal 3, python3']) {
      assert.equal(rule(typing(app, name)), 'terminal_view', `${app} typing into '${name}'`)
      assert.equal(rule(pressing(app, name)), 'terminal_view', `${app} Return in '${name}'`)
    }
  }
})

test('CU-279: the editor and other IDE inputs stay free; outside an IDE the bare shape is a named limit', () => {
  for (const name of ['main.py', 'Untitled-1', 'Search', 'Find', 'Commit message', 'Output']) assert.equal(rule(typing(VSCODE, name)), 'allow', `VS Code '${name}'`)
  assert.equal(rule(typing(FIXTURE, 'Tab 1, notes')), 'allow', 'the shape in another app (named limit)')
  const button = { ...field(VSCODE, 'Tab 1, notes', 'AXButton'), editable: false }
  assert.equal(rule(policy.classify({ type: 'keypress', keys: ['ENTER'] }, { frontmostBundleId: VSCODE, target: button })), 'allow', 'the shape on a control that takes no text')
})

test('CU-279: the terminal word in other languages counts in any app (a second net beside E5\'s English words)', () => {
  for (const name of ['终端', '終端 2', 'ターミナル', '터미널', 'Konsole', 'Consola de depuración', 'Terminale']) assert.equal(rule(typing(FIXTURE, name)), 'terminal_view', `'${name}'`)
  for (const name of ['Consolation prize', 'Determinal', 'Notes']) assert.equal(rule(typing(FIXTURE, name)), 'allow', `'${name}' is no terminal`)
})

test('CU-279: IDEs are a kind with sources - the ids and families match as before (#119), Cursor only by its exact id', () => {
  for (const entry of IDE_APPS) assert.ok(entry.app && entry.ids.length > 0 && entry.source.length > 0, entry.app)
  for (const id of [VSCODE, CURSOR, PYCHARM, 'com.jetbrains.intellij', ZED, 'com.apple.dt.Xcode', 'com.sublimetext.4', 'com.vscodium']) assert.equal(isIdeApp(id), true, id)
  for (const id of ['com.todesktop.someotherapp', FIXTURE, 'com.microsoft.VSCodeX', '']) assert.equal(isIdeApp(id), false, `'${id}'`)
})
