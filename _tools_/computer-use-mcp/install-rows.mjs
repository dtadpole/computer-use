#!/usr/bin/env node
/**
 * The owner's install rows (responsibilities 2.1.0, item 3), generated in one place so the text the coordinator sends
 * is exactly the text the proofs test in isolated homes (`dsh-proof.mjs --install`, `heddle-proof.mjs --install`).
 * `node install-rows.mjs` prints the whole owner text (rows, use, limits) for the owner's clone at ~/computer-use
 * (github.com/dtadpole/computer-use, the code at its root since D-039; CU-5).
 */
import { DEFAULT_PATHS, localConfig, localPath } from '../agent-core/local-config.mjs'

/**
 * The owner's machine, from the local config (agent-core/local-config.mjs: `paths.nodeBin`, `paths.project`,
 * `paths.keyFile`, or CU_NODE_BIN, CU_PROJECT, CU_KEY_FILE), else the node running this and the home-relative
 * defaults (DEFAULT_PATHS: `~/computer-use`, the gateway key file). Read per call, so importing this file reads nothing.
 */
export function ownerDefaults(config = localConfig()) {
  return Object.freeze({
    node: localPath('nodeBin', process.execPath, config),
    project: localPath('project', DEFAULT_PATHS.project, config),
    keyFile: localPath('keyFile', DEFAULT_PATHS.keyFile, config),
    seat: 'cu-owner',
  })
}
export const TOOL_NAMES = Object.freeze(['computer_use_start', 'computer_use_status', 'computer_use_respond', 'computer_use_control'])

const args = (o) => `['${o.project}/_tools_/computer-use-mcp/server.mjs', '--seat', '${o.seat}', '--key-file', '${o.keyFile}']`

/** The DSH row for `$DSH_HOME/cordis.patch.yml` (all profiles) or a profile's patch: one MCP server named `cu`. */
export function dshRow(options = {}) {
  const o = { ...ownerDefaults(), ...options }
  return `- insert:
    - id: mcp-computer-use
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: cu
        transport: stdio
        command: ${o.node}
        args: ${args(o)}
`
}

/** The heddle plugin row, appended to `$HEDDLE_HOME/profiles/<profile>/heddle.patch.yml`. */
export function heddleRow(options = {}) {
  const o = { ...ownerDefaults(), ...options }
  return `- insert:
    - id: computer-use
      name: ${o.project}/_tools_/heddle-plugin/computer-use.mjs
      inject: [tools, approvals]
      config:
        serverArgs: ['--seat', '${o.seat}', '--key-file', '${o.keyFile}']
`
}

/** The second heddle edit: add the four names to the tools row's flow-style `allow: [ ... ]` list. */
export function addToolsToAllow(patchText) {
  const at = patchText.search(/allow:\s*\[/)
  if (at < 0) throw new Error('no flow-style allow list in the tools row')
  const open = patchText.indexOf('[', at)
  return `${patchText.slice(0, open + 1)}\n            ${TOOL_NAMES.join(', ')},${patchText.slice(open + 1)}`
}

/** The whole text the coordinator sends the owner: where each row goes, how to use it, and its limits. */
export function ownerText(options = {}) {
  const o = { ...ownerDefaults(), ...options }
  return `Computer use for DSH and heddle. Both run from your clone ~/computer-use (github.com/dtadpole/computer-use): please run \`git -C ~/computer-use pull\` first.

1. DSH: append this to ~/.dsh/cordis.patch.yml, which every profile reads. If the file already has an \`- insert:\` list, add the entry to that list. DSH reloads the file live. The session's tools are then mcp__cu__computer_use_start, _status, _respond and _control.
${dshRow(o)}
2. heddle: edit $HEDDLE_HOME/profiles/default/heddle.patch.yml, the profile heddle creates from its template:
   (a) add ${TOOL_NAMES.join(', ')} to the tools row's \`allow: [ ... ]\` list;
   (b) append:
${heddleRow(o)}
Using it: ask the session to do a browser task. It calls computer_use_start (task, start_url) and then polls computer_use_status. For a task on this Mac it passes environment 'macos-desktop' and apps (bundle ids it proposes, never approvals): you approve each app yourself the first time it is used, through the control link below. The result carries the final screenshot and the trajectory: the run directory under ~/.computer-use/runs and a replay URL. computer_use_start also returns a live-view URL that can only watch.
To pause, take over, hand back, stop or answer a consent request, run this yourself, in your own terminal:
   node ${o.project}/_tools_/agent-core/cli.mjs control-link <run-id>
Then open the URL it prints. Never paste that URL or its token into a session; consent is never given through the session's tools.
Limits:
- Runs use seat ${o.seat} and count toward the team's two-browser cap (D-014), so a run is refused while two team browsers are running.
- One run at a time. A desktop run also holds the Mac's desktop-run lock, so no other desktop run starts until it ends; it needs CUHelper installed and granted.
- In heddle, the screenshot is not kept in the transcript.
- The control link sits in a mode-600 file under ~/.computer-use/control while a run is live, so any process running as you, including a session's own shell, could read it. control-link refuses to run without a terminal, but that refusal raises the bar; it is not a wall.
`
}

if (process.argv[1] && process.argv[1].endsWith('install-rows.mjs')) process.stdout.write(ownerText())
