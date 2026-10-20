# Plain-English Claude Code

Rewrites Claude's answers in plain language, moves the detail into a summary, and adds next steps.

A [Claude Code plugin](https://docs.claude.com/en/docs/claude-code/plugins).

## Install

At the prompt of a Claude Code session, run:

```
/plugin install plain-english --marketplace Taha-Aalam/plain-english
```

Answer `y` to add the marketplace, then choose the user scope.

## Use

  1. Answers longer than a short reply are rewritten in plain language.
  2. The detail moves into a **Summary** block; **Next steps** lists what to do next.
  3. A status line shows what the mod is doing.
  4. `/plain-check` grades the last answer against the plain-language rules (on demand — it costs a model call).

## How it works

`.claude-plugin/plugin.json` declares the plugin and points at its hooks module.
`hooks/hooks.json` names `register.tsx`, which exports `register` — a set of hooks that run
alongside Claude Code's own. A hook that returns without calling `next` answers for itself;
one that returns `next(e)` lets the engine carry on.

Anything the mod keeps between events lives in `$.state`, and every key it uses is declared in
`types/index.d.ts` so `claude plugin validate` can check them.

## Limits worth knowing

- The rewrite is **display only**. The model still receives exactly what it said, so the session's own memory stays consistent.
- Answers under 400 characters are left alone — rewriting `Done.` is not worth a model call.
- The rewrite is drawn in the skins plugin's styling when skins is installed and on (`$.skins.markdown`); otherwise Claude Code's own Markdown draws it, so the reply keeps one look either way.
- The model-backed paths (the rewrite and `/plain-check`) cannot be exercised by the test suite, because `$.model` is absent from the test interface. Run `/plain-check` in a real session to confirm it works.
- Each rewrite costs one Haiku call, made after the turn has already been answered — you see the plain version a moment after the original.
- A hidden `/plain-seed` command exists only when the `seed` option is on. It is off by default and exists so the tests can fill the state without a model call.

## Development

```
claude plugin validate .
claude plugin test .
claude --plugin-dir .
```

The tests run through the plugin engine's own test harness: they load this module, stand in for the
events it hooks, and assert on what it drew and returned. That proves the module loads, that its
hooks fire, and that its trees and answers are shaped correctly. It is not the same as a live
session — anything that reaches the model, the network or the filesystem has to be tried in one.
