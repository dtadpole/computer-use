/**
 * D-057's closing answer line - '<label>: value', markdown emphasis or backticks around the label allowed, any case
 * (final-answer-lines.md, CU-123). One pattern for agent core (outcomeOf lets a single trailing ANSWER line follow the
 * OUTCOME line) and the judge (it reads the last such line), so both recognise exactly the same lines.
 */
export function answerLinePattern(label = 'ANSWER') {
  return new RegExp(`^\\s*[*_\`]*${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[*_\`]*\\s*:\\s*(.*?)\\s*$`, 'i')
}
