// CU-369 runtime guard: module hooks that stand in for the real D-005 registry entry and the real browser launch while the
// default-seat tests run in a child process. A call records its name in the file CU369_MARK names and throws, so the guard sees it
// and nothing real is taken. Loaded only by default-seat-guard.test.mjs through `node --import`.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const GUARDED = [
  { suffix: '/_tools_/verify-kit/browser-registry.mjs', names: ['registerBrowser'] },
  { suffix: '/_vendor_/browser-use/lib.mjs', names: ['openPage', 'openBrowser'] },
]

export async function load(url, context, nextLoad) {
  const plain = url.split('?')[0]
  const guard = GUARDED.find((g) => plain.endsWith(g.suffix))
  if (!guard || url.includes('cu369-real')) return nextLoad(url, context)
  const real = `${plain}?cu369-real`
  const text = readFileSync(fileURLToPath(plain), 'utf8')
  const wrapped = guard.names.filter((name) => new RegExp(`export[^\\n]*\\b${name}\\b`).test(text)).map((name) => `export function ${name}() {
  const mark = process.env.CU369_MARK
  if (mark) appendFileSync(mark, ${JSON.stringify(name)} + '\\n')
  throw new Error('CU-369 guard: the real ${name} was reached from a default-seat test')
}`)
  const source = `import { appendFileSync } from 'node:fs'\nexport * from ${JSON.stringify(real)}\n${wrapped.join('\n')}\n`
  return { format: 'module', source, shortCircuit: true }
}
