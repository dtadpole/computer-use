import assert from 'node:assert/strict'
import { test } from 'node:test'

import { DESKTOP_TASKS } from '../../_tools_/desktop-fixture/tasks.mjs'
import { checkStart, TOOLS } from '../../_tools_/computer-use-mcp/tools.mjs'
import { desktopPrompt, desktopRefusal, parseProofArgs, privateCuHome, sessionEnv } from '../../_tools_/computer-use-mcp/desktop-proof.mjs'

/**
 * heddle-proof.mjs's desktop mode is the shared one in computer-use-mcp/desktop-proof.mjs. The copied owner approvals,
 * the refusal and the helper link are tested there. This file checks what differs in heddle: the plugin's bare tool
 * names and heddle's environment.
 */
const FIXTURE = 'ai.reflection.cu.fixture'
const MODEL = 'claude-gateway/claude-sonnet-5-5'

test('heddle command lines: browser by default; --env macos-desktop --announced yes [--install yes] is a desktop proof', () => {
  assert.deepEqual([parseProofArgs([]).desktop, parseProofArgs([]).task], [false, 'visitor-badge'])
  const desktop = parseProofArgs(['--env', 'macos-desktop', '--announced', 'yes', '--install', 'yes', '--task', 'menu-final'])
  assert.deepEqual([desktop.desktop, desktop.announced, desktop.install, desktop.task], [true, true, true, 'menu-final'])
  assert.match(desktopRefusal(parseProofArgs(['--env', 'macos-desktop', '--install', 'yes'])), /--announced yes/)
})

test('the heddle desktop prompt names the plugin\'s own tools, bare, and start arguments the plugin passes on verbatim and the server accepts', () => {
  const task = DESKTOP_TASKS['badge-form'].prompt({ name: 'Jonas Lind' })
  const prompt = desktopPrompt({ toolPrefix: '', task, apps: [FIXTURE], model: MODEL })
  assert.doesNotMatch(prompt, /mcp__/)
  const named = [...prompt.matchAll(/Call (\w+)/g)].map((match) => match[1])
  assert.deepEqual(named, ['computer_use_start', 'computer_use_status'])
  for (const name of named) assert.ok(TOOLS.some((tool) => tool.name === name), `${name} is a tool the plugin registers`)
  const args = JSON.parse(/exactly these arguments: (\{.*\})$/m.exec(prompt)[1])
  assert.deepEqual(args, { environment: 'macos-desktop', apps: [FIXTURE], task, model: MODEL, max_steps: 20, max_minutes: 6, max_cost_usd: 1 })
  assert.equal(checkStart(args).environment, 'macos-desktop')
  assert.doesNotMatch(prompt.replace(task, '<TASK>'), /approv|consent|always|grant|permission|allow|start_url/i)
})

test('heddle\'s session environment: its own fields plus CU_HOME, which the plugin\'s server inherits; no loader variable', () => {
  const home = privateCuHome('/tmp/cu-developer-two-m9/heddle')
  const fields = { HOME: '/tmp/cu-developer-two-m9/heddle/user', HEDDLE_HOME: '/tmp/cu-developer-two-m9/heddle/heddle-home', PATH: '/usr/bin:/bin', HEDDLE_CONCLAVE_API_KEY: 'k', CU_HEDDLE_TRACE: '/tmp/t.jsonl' }
  const env = sessionEnv({ ...fields, NODE_OPTIONS: '--require x', NODE_PATH: '/x', DYLD_INSERT_LIBRARIES: '/x.dylib' }, { cuHome: home })
  assert.deepEqual(env, { ...fields, CU_HOME: '/tmp/cu-developer-two-m9/heddle/user/.computer-use' })
  assert.equal(home.startsWith(fields.HOME), true, 'inside the isolated HOME: agent core\'s default there, so --install yes lands in it too')
})
