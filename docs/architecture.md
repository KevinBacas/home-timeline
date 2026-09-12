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
| Connection lifecycle, history, evidence access | `src/server/runtime-core.ts` |

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

Run `npm test`, `npm run typecheck`, and `npm run build`. For UI changes, also
check story expansion, event-to-entity navigation, search/filter controls, and
settings in the browser. Connection submission must never log or persist tokens.
Use the local Home Assistant fixture for connection tests.
