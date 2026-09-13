import { countNewVisibleEvents, type TimelineView } from "../lib/query";
import type { Snapshot } from "../lib/types";

type FeedContext = {
  url: string;
  view: TimelineView;
  snapshot: Snapshot | null;
  reading: boolean;
};
type FeedUpdate = {
  snapshot: Snapshot;
  pending: Snapshot | null;
  count: number;
};

/** Owns reading-position preservation and pagination; Query owns request caching. */
export function createTimelineFeed(deps: {
  read: () => FeedContext;
  fetch: (url: string) => Promise<Snapshot>;
  commit: (update: FeedUpdate) => void;
}) {
  let generation = 0;
  let pageKey = "";
  let older: Snapshot | null = null;
  let paging = false;
  const merge = (fresh: Snapshot, tail: Snapshot): Snapshot => ({
    ...fresh,
    nextCursor: tail.nextCursor,
    events: [
      ...new Map(
        [...tail.events, ...fresh.events].map((e) => [e.id, e]),
      ).values(),
    ],
  });
  const key = (context: FeedContext) =>
    JSON.stringify([context.url, context.view]);
  return {
    receive(url: string, incoming: Snapshot) {
      const current = deps.read();
      if (url !== current.url) return;
      const changed = pageKey !== key(current);
      if (changed) {
        pageKey = key(current);
        older = null;
      }
      if (older) incoming = merge(incoming, older);
      if (!changed && current.reading && current.snapshot) {
        const count = countNewVisibleEvents(
          current.snapshot.events,
          incoming.events,
          current.view,
        );
        deps.commit({
          snapshot: {
            ...current.snapshot,
            connection: incoming.connection,
            states: incoming.states,
            metadata: incoming.metadata,
            hiddenCount: incoming.hiddenCount,
            noise: incoming.noise,
          },
          pending: count ? incoming : null,
          count,
        });
      } else deps.commit({ snapshot: incoming, pending: null, count: 0 });
    },
    async loadMore(): Promise<void> {
      if (paging) return;
      const before = deps.read();
      if (!before.snapshot?.nextCursor || pageKey !== key(before)) return;
      const version = generation;
      paging = true;
      try {
        const more = await deps.fetch(
          before.url +
            "&cursor=" +
            encodeURIComponent(before.snapshot.nextCursor),
        );
        const current = deps.read();
        if (
          version !== generation ||
          key(before) !== key(current) ||
          !current.snapshot
        )
          return;
        older = merge(more, {
          ...current.snapshot,
          nextCursor: more.nextCursor,
        });
        deps.commit({
          snapshot: merge(current.snapshot, older),
          pending: null,
          count: 0,
        });
      } catch {
        // Keep the current page and cursor so the reader can retry.
      } finally {
        if (version === generation) paging = false;
      }
    },
    cancel() {
      older = null;
      pageKey = "";
      paging = false;
      generation++;
    },
  };
}
