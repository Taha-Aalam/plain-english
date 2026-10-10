import { expect, test } from 'claude-code/testing'

const NL = String.fromCharCode(10)

const LONG = 'The cache key is derived from the conversation prefix. ' +
  'It is recomputed whenever the prefix changes. ' +
  'This means a long conversation produces a new key on every turn, ' +
  'so the old entry is evicted and a fresh lookup is required each time. ' +
  'This is the intended behaviour and should not be treated as a leak.'

/** What the engine draws when the hook declines and returns next(e). */
const ENGINE_TREE = { type: 'Box', children: [] }

const draw = ($: any, text: string, over: Record<string, unknown> = {}) =>
  $.ui.render({
    component: 'AssistantMessage',
    surface: 'terminal',
    props: { text, isFirstOfReply: true, ...over } as any,
  })

/** Fill the atom through the seed command; the text becomes `original`. */
const prime = async ($: any) => {
  await $.command.run({ command: 'plain-seed', args: LONG } as any)
}

const stand = (on: any) => {
  on('command.register', () => ({ value: { command: 'plain-seed' } }))
  on('session.start', () => ({ cwd: 'C:/tmp' }))
  on('ui.render', () => ENGINE_TREE)
  on('command.run', () => ({ value: { command: 'plain-seed' } }))
}

test('a rewritten block is drawn as the plain body, the summary and the next steps',
  { options: { seed: true } }, async ($, on) => {
    stand(on)
    await $.session.start({ cwd: 'C:/tmp' } as any)
    await prime($)

    const tree = JSON.stringify(await draw($, LONG))
    expect(tree).toContain('PLAIN BODY')
    expect(tree).toContain('Summary')
    expect(tree).toContain('SUMMARY BODY')
    expect(tree).toContain('Next steps')
    expect(tree).toContain('NEXT ONE')
  })

test('an unrelated block is left to the engine',
  { options: { seed: true } }, async ($, on) => {
    stand(on)
    await $.session.start({ cwd: 'C:/tmp' } as any)
    await prime($)

    const out = await draw($, 'some older answer from a previous turn')
    expect(JSON.stringify(out)).toBe(JSON.stringify(ENGINE_TREE))
  })

test('a summary block is never rewritten',
  { options: { seed: true } }, async ($, on) => {
    stand(on)
    await $.session.start({ cwd: 'C:/tmp' } as any)
    await prime($)

    const out = await draw($, LONG, { isSummary: true })
    expect(JSON.stringify(out)).toBe(JSON.stringify(ENGINE_TREE))
  })

test('a rewritten body survives a surface that added context around it',
  { options: { seed: true } }, async ($, on) => {
    stand(on)
    await $.session.start({ cwd: 'C:/tmp' } as any)
    await prime($)

    const tree = JSON.stringify(await draw($, 'HIDDEN CONTEXT' + NL + LONG))
    expect(tree).toContain('PLAIN BODY')
  })

test('/plain-check with no rewritten answer says so', async ($, on) => {
  on('command.register', () => ({ value: { command: 'plain-check' } }))
  on('command.run', () => ({ value: { command: 'plain-check' } }))
  on('session.start', () => ({ cwd: 'C:/tmp' }))
  on('ui.render', () => ENGINE_TREE)

  await $.session.start({ cwd: 'C:/tmp' } as any)
  const out = await $.command.run({ command: 'plain-check', args: '' } as any)
  expect(JSON.stringify(out)).toContain('No rewritten answer')
})