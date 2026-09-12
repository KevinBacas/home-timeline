# Home Timeline module map

Start with the module that owns the behavior being changed.

| Change | Module |
| --- | --- |
| Screen composition, selected period/filters, demo lifecycle | `src/components/home-timeline.tsx` |
| Refresh arbitration, pagination, deferred live updates | `src/client/timeline-feed.ts` |
| Timeline rows, story expansion, event animations | `src/components/timeline/timeline-list.tsx` |
| Event evidence and entity-history loading | `src/components/timeline/event-inspector.tsx` |
| Connection form, transient credentials, submission states | `src/components/timeline/connect-home-dialog.tsx` |
| Period and filter controls | `src/components/timeline/timeline-filters.tsx` |
| Search dialog and result navigation | `src/components/timeline/timeline-search.tsx` |
| Theme, exclusions, debug and connection preferences UI | `src/components/timeline/timeline-settings.tsx` |
| Current-home summary | `src/components/timeline/home-summary.tsx` |
| Shared dialog, category icon/label vocabulary | `src/components/timeline/primitives.tsx` |
| Home-timezone display formatting | `src/components/timeline/format.ts` |
| Visibility, search matching, story selection, badge counts | `src/lib/query.ts` |
| Normalization, noise reduction, story rules | `src/lib/engine.ts` |
| Domain types and API snapshot shape | `src/lib/types.ts` |
| Home-timezone period boundaries | `src/lib/time.ts` |
| Summary derivation from current home state | `src/lib/home-summary.ts` |
| Home Assistant transport, metadata, history ingestion | `src/server/adapter.ts` |
| Connection lifecycle, history, evidence access | `src/server/runtime-core.ts` |
| Server-only entry point and development runtime reuse | `src/server/runtime.ts`, `src/server/shared-runtime.ts` |
| Bounded observation retention and eviction | `src/server/store.ts` |
| Payload sanitization and URL/Host/Origin validation | `src/lib/security.ts` |
| Request guards, query parsing, JSON responses | `src/server/http.ts` |
| HTTP endpoints and SSE transport | `src/app/api/` |
| Theme tokens, feature styling, responsive rules | `src/app/globals.css` |

## State ownership

Keep cross-feature state in the screen: selected filters, snapshot, preferences,
and the event selected for inspection. Keep private interaction state in its
feature module: expanded stories, connection form state, inspector navigation,
and entity-history requests. The connection dialog mounts per session so closing
it discards transient input. The inspector mounts per selected event and cancels
outdated history responses on cleanup.

Domain interpretation belongs in the engine, not the renderer. Feed request
coordination belongs in the client feed module, not individual dialogs. Import
modules directly rather than through a barrel file.

## Verification

Follow [development verification](development.md#verification-and-completion),
including the linked browser checks for UI changes and the README fixture for
connection tests. Review [Security](../README.md#security) when a change crosses
the browser/server or Home Assistant boundary.
