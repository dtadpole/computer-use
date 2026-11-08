#!/usr/bin/env node
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { main } from '../../_tools_/computer-use-mcp/server.mjs'
import { fakeDesktop, WORLD } from './desktop-fake.mjs'

/**
 * The MCP server's own `main` (server.mjs: its arguments, stdio JSON-RPC, signals and exit), run as a process with one
 * seam the shipped command line cannot set: desktop runs reach the fake helper, each through a fresh one over stdio,
 * with the desktop-run lock in a private directory removed at exit. So a desktop run goes end to end through a real
 * server process - tools, run manager, agent core's startRun, the macos-desktop driver - without CUHelper.app or the
 * team's lock. Takes server.mjs's arguments; the fake's world may come from CU_TEST_FAKE_WORLD (JSON), and the first
 * capture's wait for an app window from CU_TEST_APP_WINDOW_WAIT_MS.
 */

const world = process.env.CU_TEST_FAKE_WORLD ? JSON.parse(process.env.CU_TEST_FAKE_WORLD) : WORLD
const scratch = mkdtempSync(join(tmpdir(), 'cu-mcp-lock-'))
const desktop = fakeDesktop({ lockDir: join(scratch, 'run-lock'), world })
process.once('exit', () => {
  for (const child of desktop.helpers) child.kill()
  rmSync(scratch, { recursive: true, force: true })
})
// CU-110: a shorter first-capture wait (CU-100's 5 s) for a test whose fake shows no app window, from
// CU_TEST_APP_WINDOW_WAIT_MS (whole milliseconds); unset, the driver's own wait.
const waitMs = process.env.CU_TEST_APP_WINDOW_WAIT_MS ? Number(process.env.CU_TEST_APP_WINDOW_WAIT_MS) : null
const environmentOptions = waitMs === null ? desktop.environmentOptions : () => ({ ...desktop.environmentOptions(), appWindowWaitMs: waitMs, appWindowPollMs: 20 })
main(process.argv.slice(2), { managerOptions: { environmentOptions } })
