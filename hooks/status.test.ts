import { expect, test } from 'claude-code/testing'

test('a turn says what it is doing, then clears the line', async ($, on) => {
  const seen: (string | undefined)[] = []
  on('command.register', () => ({ value: { command: 'plain-check' } }))
  on('session.start', () => ({ cwd: 'C:/tmp' }))
  on('ui.render', () => ({ type: 'Box', children: [] }))
  on('turn.start', () => ({ turnId: 't1' }))
  on('turn.complete', () => ({ text: 'done' }))
  on('ui.status', ($, e) => { seen.push(e.text); return { value: e.text } })

  await $.session.start({ cwd: 'C:/tmp' } as any)
  await $.turn.start({ text: 'p', turnId: 't1' } as any)
  await $.turn.complete({ answer: 'short', reason: 'answer', turnId: 't1' } as any)

  expect(seen[0]).toContain('plain language')
  expect(seen[seen.length - 1]).toBe(undefined)
})