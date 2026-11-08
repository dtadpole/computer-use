/**
 * The model-independent inspector (design: untrusted-content.md). After each batch it scans the page's visible and
 * hidden text for text addressed to an AI agent, fake system prompts and credential requests off the allowed
 * origins. A hit becomes a `safety_check` consent request; unattended, the run ends `escalated` (R26, R34).
 * The patterns aim at precision: benign task pages must show zero hits.
 */

const RULES = Object.freeze([
  { id: 'ignore_instructions', re: /\b(ignore|disregard|forget)\s+(all\s+|any\s+|the\s+)?(previous|prior|above|earlier|your)\s+(instructions|directions|prompts?|rules)\b/i },
  { id: 'addressed_to_agent', re: /\b(attention|note|message|instructions?)\s+(to|for)\s+(the\s+)?(ai|assistant|agent|llm|language model|bot)\b/i },
  { id: 'role_override', re: /\byou\s+are\s+now\s+(a|an|the|in)\b|\bnew\s+system\s+prompt\b|\bsystem\s+prompt\s*:/i },
  { id: 'agent_imperative', re: /\b(ai|assistant|agent)s?\s*(,|:)\s*(please\s+)?(now\s+)?(go|navigate|click|type|send|enter|open|visit|copy|transfer)\b/i },
  { id: 'agents_addressed', re: /\b(ai|automated)\s+(assistants?|agents?)\b|\bany\s+(ai\s+)?(assistant|agent)\s+reading\b|\bthe\s+(ai\s+)?(assistant|agent)\s+must\b|@(assistant|agent|ai)\b|\b(assistants?|agents?)\s+(completing|reading|performing|working\s+on|helping\s+with)\s+(a|the|this|your)\b|\b(assistant|agent)\s+(instruction|directive)s?\s*:/i },
  { id: 'claimed_consent', re: /\b(the|your)\s+user\s+(has\s+)?(also\s+)?(already\s+(agreed|authori[sz]ed)|asked\s+you|wants\s+you)\b/i },
  { id: 'authority_override', re: /\bsystem\s+override\b|\(priority\s+0\)|\bdo\s+not\s+ask\s+for\s+confirmation\b/i },
  { id: 'fake_reauth', re: /\bre-?enter\s+your\s+[\w\s]{0,30}password\s+to\s+(keep|continue)\b/i },
  { id: 'scareware', re: /\b\d+\s+viruses?\s+detected\b|\byour\s+computer\s+is\s+infected\b/i },
  { id: 'data_request', re: /\btype\s+the\s+(customer|user|account\s+owner)'?s?\s+(email|phone|address|password|card|api\s+key)/i },
])

/** Rules for hidden text only: a role tag there is an attempt to speak as the conversation. */
const HIDDEN_RULES = Object.freeze([{ id: 'hidden_role_tag', re: /(^|[.!?]\s+)(assistant|system|user)\s*:\s/i }])

/**
 * Inspect page text. Returns hits `[{ rule, excerpt, hidden }]`; `hidden` marks text the page did not render
 * visibly, which counts as a hit on its own when it carries an imperative to an agent.
 */
export function inspectPageText({ text = '', hiddenText = '' } = {}) {
  const hits = []
  for (const [source, hidden] of [[text, false], [hiddenText, true]]) {
    if (!source) continue
    for (const rule of hidden ? [...RULES, ...HIDDEN_RULES] : RULES) {
      const match = rule.re.exec(source)
      if (match) {
        const start = Math.max(0, match.index - 40)
        hits.push({ rule: rule.id, excerpt: source.slice(start, match.index + match[0].length + 40).replace(/\s+/g, ' ').trim(), hidden })
      }
    }
  }
  return hits
}
