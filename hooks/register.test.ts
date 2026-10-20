import { expect, test } from 'claude-code/testing'

const NL = String.fromCharCode(10)

const LONG = 'The cache key is derived from the conversation prefix. ' +
  'It is recomputed whenever the prefix changes. ' +
  'This means a long conversation produces a new key on every turn, ' +
  'so the old entry is evicted and a fresh lookup is required each time. ' +
  'This is the intended behaviour and should not be treated as a leak.'

/** What the engine draws when the hook declines and returns next(e). */
const ENGINE_TREE = { type: 'Box', children: [] }

/**
 * True when the hook handed the block to the engine unchanged. The engine
 * stamps the tree a stand-in returned with the plugin that drew it, so the
 * comparison is by shape, not by string.
 */
const isEngineTree = (out: unknown): boolean => {
  const tree = out as { type?: string; children?: unknown[] }
  return tree.type === 'Box' && Array.isArray(tree.children) && tree.children.length === 0
}

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
    expect(isEngineTree(out)).toBe(true)
  })

test('a summary block is never rewritten',
  { options: { seed: true } }, async ($, on) => {
    stand(on)
    await $.session.start({ cwd: 'C:/tmp' } as any)
    await prime($)

    const out = await draw($, LONG, { isSummary: true })
    expect(isEngineTree(out)).toBe(true)
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

// The bug this fixes: the rewrite was drawn with the engine's own Markdown, so a
// reply the skin had drawn changed back to Claude Code's styling a few seconds
// after it landed, when the rewrite replaced it. skins' drawing is used when it
// answers one.
test('a rewrite is drawn by the skin when skins answers',
  { options: { seed: true } }, async ($, on) => {
    const asked: { surface: string; text: string; columns: number }[] = []
    stand(on)
    // skins, as another mod adds it: `$.skins.markdown` answering a drawing.
    on('engine.create', async ($: any, e: any, next: any) => ({
      ...(await next(e)),
      skins: {
        markdown: async (args: { surface: string; text: string; columns: number }) => {
          asked.push({ surface: args.surface, text: args.text, columns: args.columns })
          return { type: 'Text', children: [args.text] }
        },
      },
    }))
    await $.session.start({ cwd: 'C:/tmp' } as any)
    await prime($)

    const tree = JSON.stringify(await draw($, LONG))
    // skins was asked for the body, and its answer is what is drawn.
    expect(asked.map(a => a.text)).toContain('PLAIN BODY')
    expect(tree).toContain('PLAIN BODY')
    expect(tree).not.toContain('"type":"Markdown"')
  })

// With skins off — or not installed at all — the engine's Markdown is the floor.
test('a rewrite falls back to the engine Markdown when skins declines',
  { options: { seed: true } }, async ($, on) => {
    stand(on)
    // skins is loaded but the skin is off: it answers no drawing of its own.
    on('engine.create', async ($: any, e: any, next: any) => ({
      ...(await next(e)),
      skins: { markdown: async () => undefined },
    }))
    await $.session.start({ cwd: 'C:/tmp' } as any)
    await prime($)

    const tree = JSON.stringify(await draw($, LONG))
    expect(tree).toContain('PLAIN BODY')
    expect(tree).toContain('"type":"Markdown"')
  })

test('a rewrite falls back when skins is not installed',
  { options: { seed: true } }, async ($, on) => {
    stand(on)
    // No `skins.markdown` hook at all: the call itself throws, as it does when
    // the noun has no provider.
    await $.session.start({ cwd: 'C:/tmp' } as any)
    await prime($)

    const tree = JSON.stringify(await draw($, LONG))
    expect(tree).toContain('PLAIN BODY')
    expect(tree).toContain('"type":"Markdown"')
  })