import { expect, test } from 'claude-code/testing'

import { check, matchesBlock, rewrite } from './plain'

const NL = String.fromCharCode(10)

const REPLY = [
  'PLAIN:',
  'The cache key comes from the start of the conversation.',
  'SUMMARY:',
  '- key = f(prefix)',
  '- TTL 60s',
  'NEXT:',
  '- add a test for the TTL',
].join(NL)

const answered = (text: string) => async () => ({ isAnswered: true, text, usage: {} } as any)

test('the rewrite keeps the original and takes plain, summary and next steps', async () => {
  const out = await rewrite('ORIGINAL ANSWER', answered(REPLY))
  expect(out).not.toBe(null)
  expect(out!.original).toBe('ORIGINAL ANSWER')
  expect(out!.plain).toContain('cache key')
  expect(out!.summary).toContain('TTL 60s')
  expect(out!.nextSteps).toEqual(['add a test for the TTL'])
})

test('a provider that declines yields null, never undefined text', async () => {
  const down = async () => ({ isAnswered: false, reason: 'api-error', usage: {} } as any)
  expect(await rewrite('ORIGINAL', down)).toBe(null)
})

test('a reply that ignores the shape yields null rather than a blank transcript', async () => {
  expect(await rewrite('ORIGINAL', answered('just prose'))).toBe(null)
  expect(await rewrite('ORIGINAL', answered(''))).toBe(null)
})

test('NONE in a section means that section is empty', async () => {
  const out = await rewrite('ORIGINAL', answered(
    ['PLAIN:', 'Short and clear.', 'SUMMARY:', 'NONE', 'NEXT:', 'NONE'].join(NL)))
  expect(out!.summary).toBe('')
  expect(out!.nextSteps).toEqual([])
})

test('a block is recognised by its text, tolerating what a surface hides', async () => {
  const a = (await rewrite('ORIGINAL ANSWER', answered(REPLY)))!
  expect(matchesBlock(a, 'ORIGINAL ANSWER')).toBe(true)
  // The terminal strips hidden <context> blocks before the text reaches a hook.
  expect(matchesBlock(a, 'PREAMBLE CONTEXT' + NL + 'ORIGINAL ANSWER')).toBe(true)
  expect(matchesBlock(a, 'a different older answer')).toBe(false)
  expect(matchesBlock(a, 'Done.')).toBe(false)
})

test('the checker reads a verdict and reports the problems', async () => {
  const bad = answered('{"ok": false, "problems": ["dropped the TTL"]}')
  expect(await check('ORIGINAL', 'REWRITE', bad)).toContain('TTL')
  const good = answered('{"ok": true, "problems": []}')
  expect(await check('ORIGINAL', 'REWRITE', good)).toContain('passed')
})

test('a checker that answers with prose does not throw', async () => {
  expect(await check('ORIGINAL', 'REWRITE', answered('I could not decide.'))).toContain('JSON')
})