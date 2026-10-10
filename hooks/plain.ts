import type { PlainAnswer } from '../types'

const NL = String.fromCharCode(10)

/** A model alias, a prompt, and nothing else. What the caller passes as `complete`. */
export type CompleteRequest = {
  model: string
  prompt: string
  system?: string
  timeoutMs?: number
}

/**
 * The union `$.model.complete` resolves to. A provider that declines resolves;
 * it does not throw, so every caller narrows on `isAnswered`.
 */
export type CompleteResult =
  | { isAnswered: true; text: string; usage?: unknown }
  | { isAnswered: false; reason: string; usage?: unknown }

export type Complete = (request: CompleteRequest) => Promise<CompleteResult>

const PLAIN_RULES = [
  'Rewrite the answer below for someone who does not know this codebase.',
  '',
  'Rules:',
  '- Use short sentences and everyday words. No jargon without a plain gloss.',
  '- Keep every fact. Simplify the wording, never the content.',
  '- Do not add anything the answer does not say.',
].join(NL)

const SHAPE = [
  'Reply in exactly this shape, with these three words on their own lines:',
  'PLAIN:',
  '<the whole answer, rewritten>',
  'SUMMARY:',
  '<the detail moved out of the body, as bullet lines, or the word NONE>',
  'NEXT:',
  '<what to do next, one per line as "- " bullets, or the word NONE>',
].join(NL)

/** Section markers are spelled as bare words because that is what a small model copies. */
const plainPrompt = (answer: string): string =>
  [PLAIN_RULES, '', SHAPE, '', 'Answer to rewrite:', answer].join(NL)

const checkPrompt = (original: string, plain: string): string =>
  [
    'Check whether the rewrite below follows the rules. Be strict.',
    '',
    'Rules:',
    '- No jargon left unexplained.',
    '- No fact from the original dropped.',
    '- Nothing added that the original did not say.',
    '- The summary holds the detail, the body stays short.',
    '',
    'Reply with JSON only: {"ok": true|false, "problems": ["..."]}',
    '',
    'Original:',
    original,
    '',
    'Rewrite:',
    plain,
  ].join(NL)

const section = (text: string, name: string, next: string[]): string => {
  const start = text.indexOf(name)
  if (start === -1) return ''
  const from = start + name.length
  const stop = next
    .map(marker => text.indexOf(marker, from))
    .filter(at => at !== -1)
    .sort((a, b) => a - b)[0]
  return text.slice(from, stop === undefined ? text.length : stop).trim()
}

/** The three sections, or null when there is no `PLAIN:` at all. */
const parsePlain = (text: string): Omit<PlainAnswer, 'original'> | null => {
  if (typeof text !== 'string' || text.trim() === '') return null
  const plain = section(text, 'PLAIN:', ['SUMMARY:', 'NEXT:'])
  if (plain === '') return null
  const summary = section(text, 'SUMMARY:', ['NEXT:'])
  const nextSteps = section(text, 'NEXT:', [])
    .split(NL)
    .map(line => line.replace(/^\s*[-*]\s*/, '').trim())
    .filter(line => line !== '' && line.toUpperCase() !== 'NONE')
  return {
    plain,
    summary: summary.toUpperCase() === 'NONE' ? '' : summary,
    nextSteps,
  }
}

/**
 * Ask Haiku for the rewrite. `complete` is injected so this is testable: the
 * engine's `$.model` is absent from the test `$`, and `$` cannot cross an
 * import boundary anyway.
 */
export const rewrite = async (
  answer: string,
  complete: Complete,
): Promise<PlainAnswer | null> => {
  const completion = await complete({
    model: 'haiku',
    prompt: plainPrompt(answer),
    system: 'You rewrite text in plain language. You answer in the exact shape asked.',
    timeoutMs: 20_000,
  })
  if (!completion.isAnswered) return null
  const parsed = parsePlain(completion.text)
  return parsed === null ? null : { original: answer, ...parsed }
}

/**
 * Whether a block being drawn is the one this mod rewrote. There is no per-block
 * id in the render props, so the text is the identity — and a surface may hand
 * over a block with hidden context added or removed, hence both directions.
 */
export const matchesBlock = (answer: PlainAnswer, drawn: string): boolean => {
  const a = drawn.trim()
  const b = answer.original.trim()
  if (a === '' || b === '') return false
  return a.includes(b) || b.includes(a)
}

/** Grade a rewrite. Returns the text the command should show. */
export const check = async (
  original: string,
  plain: string,
  complete: Complete,
): Promise<string> => {
  const completion = await complete({
    model: 'haiku',
    prompt: checkPrompt(original, plain),
    system: 'You grade text against rules. You answer with JSON only.',
    timeoutMs: 20_000,
  })
  if (!completion.isAnswered) return `The checker could not run: ${completion.reason}`

  let verdict: { ok?: unknown; problems?: unknown }
  try {
    verdict = JSON.parse(completion.text)
  } catch {
    return `The checker did not answer with JSON:\n${completion.text}`
  }
  const problems = Array.isArray(verdict.problems)
    ? verdict.problems.map(String).filter(p => p !== '')
    : []
  if (verdict.ok === true && problems.length === 0) return 'Plain-language check passed.'
  return ['Plain-language check found:', ...problems.map(p => `- ${p}`)].join(NL)
}