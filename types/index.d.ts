/** What the mod computed for one finished answer. */
export type PlainAnswer = {
  /** The answer as the model wrote it, kept so the render hook can recognise it. */
  original: string
  /** The whole answer in plain language. */
  plain: string
  /** The detail moved out of the body, as markdown. */
  summary: string
  /** What to do next, one per line. */
  nextSteps: string[]
}

declare module 'claude-code' {
  interface PluginState {
    'plain-english': {
      current: PlainAnswer | null
    }
  }
}
