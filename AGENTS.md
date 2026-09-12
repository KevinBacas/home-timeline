# Working on Home Timeline

This is a solo-maintained, local, read-only Home Assistant journal. Keep changes
focused and use the existing modules and dependencies before adding new layers.

- Before changing code or choosing a branch, read [the development guide](docs/development.md).
- When locating behavior or changing state ownership, read [the module map](docs/architecture.md).
- When changing UI, styling, interaction, or copy, read [the UI guide](docs/ui-design.md).
- When changing APIs, credentials, upstream data, logging, storage, or hosting, read [Security](README.md#security).
- When changing dependencies, build configuration, or runtime assumptions, read [the tech stack](docs/tech-stack.md).
- When working with issues, use [the issue tracker](docs/agents/issue-tracker.md) and [triage labels](docs/agents/triage-labels.md).
- When exploring domain terminology or architectural decisions, follow [the domain docs convention](docs/agents/domain.md).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
