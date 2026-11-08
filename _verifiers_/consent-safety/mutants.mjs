/** Deliberately broken builds this verifier must fail on, applied to a /tmp copy by prove-failing.mjs. */

export const MUTANTS = Object.freeze([
  {
    name: 'policy-blind',
    why: 'the policy never recognises a consequential word, so nothing is asked before paying, deleting or sharing',
    mutations: [{ file: '_tools_/agent-core/policy.mjs', find: '  return words.some((word) =>', replace: '  return false && words.some((word) =>' }],
  },
  {
    name: 'decline-acts',
    why: 'the action runs even when the person declines',
    mutations: [{ file: '_tools_/agent-core/loop.mjs', find: '        let answer = await askConsent(step, request)\n        if (answer.approved) {', replace: '        let answer = await askConsent(step, request)\n        answer = { ...answer, approved: true }\n        if (answer.approved) {' }],
  },
  {
    name: 'site-filter-open',
    why: 'any origin the allow list does not name is allowed instead of blocked',
    mutations: [{ file: '_tools_/agent-core/sites.mjs', find: "    return { block: 'not_allowed' }\n  }\n  sitePolicy.isFixedDenied = fixed", replace: "    return 'allow'\n  }\n  sitePolicy.isFixedDenied = fixed" }],
  },
])
