import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { PlainAnswer } from '../types'
import { check, matchesBlock, rewrite } from './plain'

const NL = String.fromCharCode(10)

/** Below this an answer is already plain enough and the call is not worth it. */
const MIN_CHARS = 400

/**
 * The one value this mod keeps. It must be declared HERE, in the hooks module,
 * not in a helper imported from it — the scan only reads this file.
 */
export const current = atom(
  { plugin: 'plain-english', key: 'current' } as const,
  null as PlainAnswer | null,
)

// The second parameter is where userConfig values arrive; `plain-seed` registers
// a test-only command behind one of them, so it cannot exist in a real session.
export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    await update($, current, () => null)
    await $.command.register({
      name: 'plain-check',
      description: 'Check the last answer against the plain-language rules.',
    })
    if (options.seed === true) {
      await $.command.register({ name: 'plain-seed', description: 'Internal.' })
    }
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    await update($, current, () => null)
    $.ui.status('working - rewriting the answer in plain language')
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    // Clear the line on every exit, before any early return.
    $.ui.status(undefined)
    // reason is 'answer' | 'aborted' | 'refusal' | 'error'; only the first has
    // something worth rewriting. isAborted is true only for 'aborted'.
    if (e.reason !== 'answer') return result
    if (e.agentId !== undefined) return result
    if (e.answer.trim().length < MIN_CHARS) return result

    // The closure is made here; the imported module only ever sees a function.
    const answer = await rewrite(e.answer, request => $.model.complete(request))
    if (answer === null) {
      $.ui.log('plain-english: no rewrite this turn', { to: 'debug' })
      return result
    }
    await update($, current, () => answer)
    $.ui.status(
      answer.nextSteps.length === 0
        ? 'plain - answer rewritten'
        : `plain - ${answer.nextSteps.length} next step(s) in the transcript`,
    )
    return result
  })

  on('command.run', { command: 'plain-check' }, async $ => {
    const answer = await read($, current)
    if (answer === null) return { text: 'No rewritten answer yet. Send a prompt first.' }
    const text = await check(answer.original, answer.plain, request => $.model.complete(request))
    return { text }
  })

  // The test seam: fills the atom with no model call at all, and only exists
  // when the `seed` option is on. See the README's development section.
  on('command.run', { command: 'plain-seed' }, async ($, e) => {
    await update($, current, () => ({
      original: e.args,
      plain: 'PLAIN BODY',
      summary: 'SUMMARY BODY',
      nextSteps: ['NEXT ONE'],
    }))
    return { text: 'seeded' }
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const answer = await read($, current)
    if (answer === null) return next(e)

    const props = e.props as {
      text: string
      isFirstOfReply: boolean
      isSummary?: true
      onScreen?: unknown
    }
    // isSummary is read-only and pinned: returning next(e) both preserves it and
    // declines, which is the only correct response to a summary block.
    if (props.isSummary === true) return next(e)
    if (!matchesBlock(answer, props.text)) return next(e)

    const { Box, Markdown, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        <Markdown text={answer.plain} />
        {answer.summary === '' ? null : (
          <Box flexDirection="column">
            <Text bold>Summary</Text>
            <Markdown text={answer.summary} />
          </Box>
        )}
        {answer.nextSteps.length === 0 ? null : (
          <Box flexDirection="column">
            <Text bold>Next steps</Text>
            <Markdown text={answer.nextSteps.map(s => `- ${s}`).join(NL)} />
          </Box>
        )}
      </Box>
    )
  })
}