# Tech stack

This is one TypeScript application, served by a persistent local Node.js process.
The browser talks to local Next.js route handlers; the server talks to Home
Assistant. The app has no database, hosted backend, or AI service.

## Main pieces

| Area | Technology | Role |
| --- | --- | --- |
| Runtime and packages | Node.js and npm | Local server process; `package-lock.json` records resolved dependencies |
| Application | Next.js App Router and React | Page shell, interactive client UI, and Node route handlers |
| Language | TypeScript with strict checking | Shared domain types and server/client implementation |
| Styling | Global CSS and Tailwind CSS through PostCSS | Theme tokens, feature classes, responsive layouts, and utilities |
| UI primitives | Radix Dialog and Popover | Accessible interaction primitives |
| Visuals | Lucide React, Motion, locally bundled Inter Variable | Icons, animation, and typography |
| Time | `date-fns`, `date-fns-tz`, and `Intl` | Home-timezone range calculations and display |
| External data | Zod | Validate and sanitize Home Assistant payloads and connection input |
| Home Assistant transport | Native `fetch` and `ws` | REST history/metadata and live WebSocket subscriptions |
| Browser updates | HTTP queries and `@tanstack/react-query` | Visibility-aware polling, request sharing, cancellation, and in-memory caching |
| Quality tools | `node:test`, `node:assert/strict`, `tsx`, TypeScript, Prettier | Tests, type checking, and formatting |

Read [package.json](../package.json) for the supported Node version, dependency
ranges, and available scripts. Read the lockfile for exact resolved versions.
The framework's installed docs under `node_modules/next/dist/docs/` take priority
over remembered Next.js APIs. See [Run](../README.md#run) for setup and
[Verification](../README.md#verification) for checks. There is currently no
dedicated lint script or checked-in GitHub Actions workflow; do not describe
either as an existing quality gate.

## Runtime and data lifecycle

- The process shares one Home Assistant session across tabs. `src/server/shared-runtime.ts` also preserves it across compatible development reloads.
- The adapter loads current state, metadata, and recorder history and subscribes to live events. The engine derives semantic events and stories; the bounded observation store holds retained evidence in memory.
- Status and active timeline queries poll once a minute while visible. Completed past ranges are fresh for ten minutes without polling; connection setup and loading history temporarily poll every two seconds, then return to the minute cadence (or stop for completed past ranges). HTTP responses remain `no-store`; TanStack Query owns the transient in-memory cache. Connection session IDs isolate and clear old home data. The browser no longer opens the legacy SSE stream.
- Browser local storage holds theme and exclusion preferences. Credentials and home activity are not persisted there. Optional credentials in `.env.local` are server configuration; see [Security](../README.md#security).
- Disconnect clears the active session and retained observations. Restart loses in-memory history and reconnects from environment settings when configured; available history can be fetched again from Home Assistant.

The implementation assumes a long-lived Node process with a WebSocket connection,
timers, and shared in-memory state. Static export, Edge execution, ephemeral
serverless hosting, or multiple independent server instances would require a
runtime redesign. LAN or public hosting also changes the security model.

Use the [module map](architecture.md) to find ownership before changing these
pieces. Persistent storage, device control, cloud hosting, and AI interpretation
are product/architecture decisions, not incidental dependency additions.
