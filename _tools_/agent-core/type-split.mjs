/**
 * CU-135 (cu-verifier, cu-researcher): on the desktop a typed tab moves focus mid-action, so a type is judged as its
 * segments - the text before the first tab on the current focus, then each tab as a Tab keypress and each later segment
 * against the focus the app settled on after it (the loop's settle read). A space or newline then presses whatever took
 * the focus only if that is a control, which is asked; across text inputs ('Fay 9\t42\tpaid\n' into grid cells) it is
 * typing. Each part is its own action - its own retry unit - so a retry never retypes a finished segment.
 */

/** Split each type holding a tab: `{ actions, origin }`, `origin[k]` the index of the action part k came from. */
export function splitTypesAtTabs(actions) {
  const out = []
  const origin = []
  actions.forEach((action, index) => {
    if (action?.type !== 'type' || typeof action.text !== 'string' || !action.text.includes('\t')) {
      out.push(action)
      origin.push(index)
      return
    }
    action.text.split('\t').forEach((segment, k) => {
      if (k > 0) { out.push({ type: 'keypress', keys: ['TAB'] }); origin.push(index) }
      if (segment !== '') { out.push({ ...action, text: segment }); origin.push(index) }
    })
  })
  return { actions: out, origin }
}

/**
 * One result per original action from its parts' results: the first part that did not complete speaks for the action
 * (a declined or failed segment, or a skipped one after it), else the first part's result as done.
 */
export function joinSplitResults(results, origin, original) {
  const out = []
  original.forEach((action, index) => {
    const parts = results.filter((_, k) => origin[k] === index)
    if (parts.length === 0) return
    const stopped = parts.find((result) => result.status !== 'done')
    out.push({ ...(stopped ?? parts[0]), index, type: action.type })
  })
  return out
}
