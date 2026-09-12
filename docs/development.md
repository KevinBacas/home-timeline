# Development guide

Home Timeline is a solo project. Prefer a small, working change that is easy to
review and undo. Add process when it solves a recurring problem.

## Branching model

- `main` is the current, runnable version. There is no `develop` branch or release-branch ceremony.
- Use a short-lived branch for a feature, bug fix, refactor, or experiment. Agents default to `codex/<short-description>`; honor a branch name supplied by the user.
- Small documentation or other low-risk edits can go directly on `main`.
- Start new work from an up-to-date `main` when practical. If the user has already selected a working branch, continue there.
- Keep one coherent change per branch. Prefer a squash merge for a branch with exploratory commits; a fast-forward is fine when its commits are already useful independently.
- A PR is optional for reviewing the diff and checks. Work requests belong in GitHub Issues, following the [issue tracker convention](agents/issue-tracker.md).
- Delete a topic branch after its work is merged. Use a normal revert commit to undo a change on shared `main`; preserve published history.

These conventions describe the workflow; they do not configure branch protection
or authorize an agent to push, merge, publish, or delete unrelated work.

## Before editing

1. Inspect the current branch, working-tree changes, and relevant existing tests. Preserve work already in progress.
2. Read the [module map](architecture.md) and the module that owns the behavior. For Next.js changes, read the relevant installed guide under `node_modules/next/dist/docs/`, as required by [AGENTS.md](../AGENTS.md).
3. Define an observable result: the input or user action, the expected behavior, and how to verify it. Resolve routine implementation choices from nearby code.

## Code practices

- Keep TypeScript strict. Use existing domain types from `src/lib/types.ts`; narrow unknown external data through validation instead of casting it into a trusted type. Prefer explicit variants for meaningful states over combinations of unrelated booleans.
- Follow the [state ownership rules](architecture.md#state-ownership). Extend the owning module before creating a new service, context provider, or shared utility. Extract a module when it owns a distinct responsibility, not just to shorten a file.
- Keep interpretation deterministic in `src/lib/engine.ts` and visibility/search rules in `src/lib/query.ts`. Render their results in React. Use the same rules for demo and connected data where applicable.
- Keep Node and credential-bearing code behind `src/server/runtime.ts` and its `server-only` boundary. Browser components consume local API responses. Route handlers own request parsing and delegate behavior to the runtime.
- Import modules directly; use `import type` for type-only imports. Follow nearby naming and formatting. Comment on non-obvious reasons or invariants, rather than translating the code into English.
- Keep effects responsible for setup and cleanup: timers, subscriptions, and async responses must stop affecting state after teardown or a connection/query change. Preserve the existing generation checks and feed arbitration when changing asynchronous flows.
- Reuse the home-timezone helpers in `src/lib/time.ts` and `src/components/timeline/format.ts`. Calendar days must remain correct across daylight-saving changes and browsers in another timezone.
- Preserve stable event IDs, live-over-history precedence, bounded caches, and pagination context. A new filter or story rule must work beyond the first visible page.
- Keep errors useful to the reader and sanitized at the server boundary. Represent missing or partial history explicitly; do not turn an upstream failure into a successful empty history.
- Add a dependency only for a concrete need the current stack cannot reasonably handle. Update `package.json` and `package-lock.json` together and explain the tradeoff. Keep unrelated upgrades and broad formatting out of feature changes.

## Verification and completion

For behavior changes, add or adjust a test at the owning boundary. Test observable
results with realistic fake inputs: an interpretation result, rejected request,
reconnection, or stale-response race. Use the existing `node:test` and
`node:assert/strict` style. Simple copy, styling, and documentation edits do not
need tests that merely repeat their implementation.

Run the [verification commands](../README.md#verification) for code changes. A
focused test can shorten the feedback loop while editing:

```bash
node --import tsx --test tests/timeline-feed.test.ts
```

Format only touched source/test files with the installed Prettier, for example:

```bash
npx --no-install prettier --write src/client/timeline-feed.ts
```

For UI changes, also use the [browser checklist](ui-design.md#browser-checklist).
Use the disposable Home Assistant fixture described in the README for connection
checks. If `.env.local` already manages a real connection, use a separate local
checkout without those settings for fixture testing; preserve the user's file.

A change is done when the intended behavior is verified, relevant docs match it,
and the final diff contains only intended changes. Report what changed, which
checks actually ran, and any remaining limitation. For documentation-only changes,
verify links, commands, and claims against the repository; a build is unnecessary.

## Keeping this lightweight

Keep setup and security in the README, implementation ownership in the module
map, and task-specific conventions in their linked guides. Update the existing
source of truth instead of repeating the same rule in several documents.
Record a lasting architectural tradeoff using the [domain docs convention](agents/domain.md)
when one is resolved; routine implementation choices do not need an ADR.
