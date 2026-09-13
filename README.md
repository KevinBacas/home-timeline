# Home Timeline

A local, read-only activity journal for Home Assistant. An editorial timeline, live moments, deterministic stories, and progressively disclosed technical evidence.

## Project guides

- [Development](docs/development.md): simple branching, code practices, and completion checks.
- [UI design](docs/ui-design.md): visual direction, interaction, accessibility, and browser checks.
- [Tech stack](docs/tech-stack.md): dependencies, runtime assumptions, and data lifecycle.
- [Architecture](docs/architecture.md): module ownership and state boundaries.
- [Security](#security): current protections and rules for sensitive changes.
- [Agent entry point](AGENTS.md): task-specific guidance for coding agents.

## Run

Requires Node.js 20.19+ and npm.

```bash
npm install
npm run dev
```

Open **http://127.0.0.1:3000**. The first launch is a labeled demo home, with simulated motion every 45 seconds while the page is visible. “New moment” inserts an event immediately on desktop.

For a production build:

```bash
npm run build
npm start
```

Both commands serve the app on **127.0.0.1 only**. Tablet/mobile layouts are implemented, but remote/LAN access is intentionally not enabled.

## Connect your home

Choose **Connect your home**, enter the Home Assistant URL, and paste a long-lived access token created in Home Assistant → your profile → Security. No custom integration is required. Your server must be able to reach that URL.

The token remains in local server memory until disconnect or restart. The browser clears the password field after submission and never stores the token. Demo events are replaced when connected.

For persistence, copy `.env.example` to `.env.local` and set:

```dotenv
HA_URL=http://homeassistant.local:8123
HA_TOKEN=your-long-lived-access-token
```

`.env.local` is ignored by Git. Environment settings take precedence over onboarding. Disconnect clears the active session; an environment-managed connection resumes after server restart. Do not prefix either variable with `NEXT_PUBLIC_`.

## Explore

- **Live / History**: Today, Yesterday, Last 24 hours, or a custom range of up to 31 days. Calendar boundaries use the home's timezone.
- **Search**: click the search button or press ⌘K / Ctrl+K. Match titles, rooms, friendly names, entity IDs, people, and device names in the selected period.
- **Filters**: room, person, and category filters become removable pills. Stories retain matching events in context.
- **Stories**: arrival, movie time, and repeated room activity use deterministic timing rules. Expanding reveals individual events in chronological order.
- **Event inspector**: click an event for state and attribute differences, available context relationships, and sanitized source evidence. Click its entity to inspect history.
- **Settings**: choose a theme, enable Debug mode, inspect activity counts, or exclude entities/domains. Preferences stay in this browser.
- **Updates**: current status and activity refresh every minute while the tab is visible. Use the refresh button for an immediate check. While reading older activity, the timeline holds its position and offers a “Back to now” button.

## Architecture

See [the module map](docs/architecture.md) for feature ownership and where to make changes.

```text
Home Assistant REST + WebSocket
        ↓
server/adapter.ts — validation, sanitization, metadata, history
        ↓
lib/engine.ts — semantic events, noise rules, context links, stories
        ↓
server/runtime-core.ts + store.ts — session, reconnect, bounded cache
        ↓
local HTTP queries + TanStack Query memory cache
        ↓
React timeline, filters, and inspector
```

The persistent Node process shares one Home Assistant connection across tabs. `runtime.ts` enforces the server-only import boundary and reuses the runtime across development module reloads. State transitions and automation events are subscribed before loading the current snapshot. History loads in entity batches and six-hour slices, with at most two history requests in flight per adapter. Live evidence wins when history overlaps.

The normalized model keeps observations, semantic events, references, source provenance, and grouping rules separate from presentation. Search runs server-side over the loaded period before pagination. Pages contain up to 2,000 events plus story-boundary context; the interface initially renders 80 timeline items. The observation cache has a 128MB conservative accounting budget and evicts suppressed technical noise before meaningful events. Cache eviction does not trigger repeated history imports. TanStack Query shares requests and caches browser responses in memory. Status uses a lightweight endpoint every minute; active timeline ranges refresh at the same interval. Hidden tabs pause automatic requests, and returning to stale data refreshes it. Completed past ranges stay fresh for ten minutes and do not poll; connection setup and loading history are checked every two seconds until ready, then return to slow polling. Partial or unavailable history retries on the minute cadence. Entity history is fetched on demand. Connection session IDs keep caches separate, and connection changes clear retained browser data. The legacy SSE endpoint remains available, but the browser no longer subscribes to it.

## Interpretation and limits

Supported interpretation includes doors/windows, locks/alarms, lights and meaningful brightness changes, person presence, motion/occupancy, climate mode/action/target changes, media playback, automation starts, and sustained device unavailability.

Motion clearing, sensor measurements, playback-position changes, and insignificant brightness updates are hidden normally. Debug mode reveals retained technical observations. Brief availability interruptions are suppressed. Room motion is never attributed to a person without person evidence.

History depends on Home Assistant's recorder, retention, entity exclusions, and permissions. Missing history is not proof that nothing happened. State history can be backfilled after a disconnect; missing non-state events and complete historical causality cannot always be reconstructed. Successful imports ending more than five minutes in the past are reused for the server session, within the 100-range cache bound. Current or failed imports remain eligible for retry after five minutes; reconnect backfills can explicitly bypass the cache. Metadata refreshes every five minutes and on reconnect. Historical events use currently available entity/room names.

Story grouping is a timing heuristic, not proof of causality. The inspector distinguishes matching automation contexts, other related activity, and unavailable causes. Full automation traces, AI, anomaly detection, persistent event storage, dedicated room/person pages, camera content, device control, and cloud/LAN hosting are not included.

## Security

### Current model

- Localhost Host/Origin checks on every application API; fixed routes rather than an arbitrary authenticated proxy.
- HTTP/HTTPS Home Assistant URLs only; embedded credentials, query strings, and fragments rejected. Redirects are disabled; TLS certificate verification stays enabled.
- Credentials never enter client bundles, browser storage, returned connection settings, or application logging. No analytics or external error reporting.
- Home Assistant state attributes are allowlisted; camera URLs, access tokens, nested payloads, and unrelated fields are omitted. The configured token is also redacted from upstream payloads.
- Requests have timeouts and response-size bounds. Secrets and observations are cleared on disconnect. The process does not persist home activity to disk.
- This MVP has no user authentication and should remain bound to localhost.

The local user and machine are trusted. Host/Origin checks are browser-request
protections, not user authentication or isolation from other local processes.
The read-only restriction is application behavior; do not assume the supplied
Home Assistant token itself has read-only permissions. The configured upstream
URL can reach private-network services by design.

### When changing sensitive code

- Route new application API handlers through `guard` in `src/server/http.ts` and use its `json` response helper where applicable. Preserve no-store behavior for home data and the dedicated SSE response headers.
- Keep upstream access fixed to required Home Assistant operations. Preserve URL validation, redirect rejection, TLS verification, sanitization, and resource bounds when extending the adapter.
- Keep credentials behind the server boundary and clear transient form input. Render upstream strings as text; home names and state attributes are untrusted content.
- Use synthetic tokens and fake home data in tests, screenshots, issues, and logs. Entity names, presence, and activity history are private even after token redaction. Check diffs for accidental data or secret inclusion.
- Verify changes to these boundaries with `tests/security.test.ts` and `tests/adapter.test.ts`, plus runtime tests for session cleanup. Add a regression case for a newly handled threat or failure.
- Treat LAN/public access, device control, analytics, or persistent home-data storage as explicit scope changes requiring a revised security design before implementation.

### If a token is exposed

Revoke it in Home Assistant, create a replacement, and update the local connection
or `.env.local`. Remove exposed copies from the affected artifacts; removing a
token from the latest commit alone does not revoke it or erase earlier copies.
Report a reproducible security issue with fake data and sanitized steps, keeping
credentials and real home activity out of public issues.

## Verification

```bash
npm test
npm run typecheck
npm run build
```

Tests cover interpretation, grouping, source deduplication, history baselines, DST, cache limits, token sanitization, URL/origin checks, registry permission fallback, malformed states, initial subscription ordering, reconnect, SSE replay, and contextual search.

A disposable simulator is included for manual end-to-end testing:

```bash
node --import tsx tests/fixture-ha.ts
```

Connect to `http://127.0.0.1:8124` with `fixture-only-token`. It uses fake entities and periodically toggles a fake lock; it never contacts a real home. Stop it with Ctrl+C.

Implementation was verified against fixtures, browser interactions, and a real Home Assistant instance with 527 entities. Regression coverage includes high-volume sensor history, useful-event retention under cache pressure, and development runtime refresh. Device-specific payloads and recorder policies may still require interpretation refinements.

## Official API references

- https://developers.home-assistant.io/docs/api/rest/
- https://developers.home-assistant.io/docs/api/websocket/
- https://www.home-assistant.io/docs/configuration/state_object/
- https://www.home-assistant.io/integrations/recorder/
- Registry and trace capability implementations: https://github.com/home-assistant/core
