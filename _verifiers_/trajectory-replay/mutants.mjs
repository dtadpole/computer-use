/** Deliberately broken builds this verifier must fail on, applied to a /tmp copy by prove-failing.mjs. */

const TRAJECTORY = '_tools_/agent-core/trajectory.mjs'

export const MUTANTS = Object.freeze([
  {
    name: 'events-buffered',
    why: 'events are held in memory and written only when the run ends, so a killed run leaves none',
    mutations: [
      { file: TRAJECTORY, find: '  let header = null\n', replace: '  let header = null\n  const buffered = []\n' },
      { file: TRAJECTORY, find: "      appendFileSync(eventsPath, scrub(JSON.stringify(line)) + '\\n', { mode: 0o600 })\n      return line", replace: "      buffered.push(scrub(JSON.stringify(line)) + '\\n')\n      return line" },
      { file: TRAJECTORY, find: '    end(result) {\n', replace: "    end(result) {\n      if (buffered.length) appendFileSync(eventsPath, buffered.join(''), { mode: 0o600 })\n" },
    ],
  },
  {
    name: 'secret-resolved-in-place',
    why: "the placeholder's value is written into the model's own action and never registered for scrubbing, so the record keeps it",
    mutations: [
      { file: '_tools_/agent-core/loop.mjs', find: '    return {\n      ...action,\n      text: action.text.replace(SECRET, (_, name) => {', replace: '    return Object.assign(action, {\n      text: action.text.replace(SECRET, (_, name) => {' },
      { file: '_tools_/agent-core/loop.mjs', find: '        recorder.addSecret?.(value)\n        if (value.length >= 4) usedSecrets.add(value)\n        return value\n      }),\n    }\n  }', replace: '        return value\n      }),\n    })\n  }' },
    ],
  },
  {
    name: 'replay-drops-actions',
    why: 'the replay omits every action line',
    mutations: [{ file: '_tools_/agent-core/trajectory.mjs', find: "    if (event.kind === 'action' && event.completed !== undefined) {", replace: '    if (false) {' }],
  },
])
