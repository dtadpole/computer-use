/** Deliberately broken agent cores this verifier must fail on, applied to a /tmp copy by prove-failing.mjs. */

export const MUTANTS = Object.freeze([
  { name: 'titles-everywhere', why: 'a desktop record keeps the target\'s title whatever its app', mutations: [{ file: '_tools_/agent-core/loop.mjs', find: "    return inScope(target.origin) && !String(decision.rule ?? '').startsWith('excluded') ? { ...app, name: target.name ?? '' } : app", replace: "    return { ...app, name: target.name ?? '' }" }] },
  { name: 'secure-typed', why: 'typing into a secure field is not handed to the person', mutations: [{ file: '_tools_/agent-core/app-policy.mjs', find: '    if (isKeyAction(action) && (context.secureInput === true || target?.secure === true || target?.isPassword === true)) {', replace: '    if (false) {' }] },
  { name: 'onevent-unscrubbed', why: 'startRun hands onEvent the raw line, secret and all (the file stays scrubbed)', mutations: [
    { file: '_tools_/agent-core/trajectory.mjs', find: '      const line = scrubbedLine({ seq, t: now().toISOString(), step, kind, ...fields })', replace: '      const line = { seq, t: now().toISOString(), step, kind, ...fields }' },
    { file: '_tools_/agent-core/loop.mjs', find: "        const delivered = onEvent(scrubLine(written !== null && typeof written === 'object' ? written : { step, kind, ...fields }))", replace: "        const delivered = onEvent(written !== null && typeof written === 'object' ? written : { step, kind, ...fields })" },
  ] },
])
