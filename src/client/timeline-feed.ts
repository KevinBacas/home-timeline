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

/**
 * Owns refresh arbitration and reading-position preservation.
 * Transport and screen state are supplied at the seam; stale responses never commit.
 * Concurrent refreshes share completion and preserve any forced-refresh intent.
 */
export function createTimelineFeed(deps: {
  read: () => FeedContext;
  fetch: (url: string) => Promise<Snapshot>;
  commit: (update: FeedUpdate) => void;
  demo: () => Snapshot;
}) {
  let running: Promise<void> | undefined;
  let queued = false;
  let forced = false;
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
  async function drain(version: number) {
    while (queued && version === generation) {
      queued = false;
      const force = forced;
      forced = false;
      const before = deps.read();
      if (pageKey !== key(before)) {
        pageKey = key(before);
        older = null;
      }
      try {
        let incoming = await deps.fetch(before.url);
        const current = deps.read();
        if (version !== generation || key(before) !== key(current)) continue;
        if (older && pageKey === key(current))
          incoming = merge(incoming, older);
        if (incoming.connection.mode === "demo") {
          if (current.snapshot?.connection.mode !== "demo")
            deps.commit({ snapshot: deps.demo(), pending: null, count: 0 });
          continue;
        }
        if (
          !force &&
          current.reading &&
          current.snapshot &&
          current.snapshot.connection.mode !== "demo"
        ) {
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
      } catch {
        const current = deps.read();
        if (version !== generation || key(before) !== key(current)) continue;
        if (current.snapshot && current.snapshot.connection.mode !== "demo")
          deps.commit({
            snapshot: {
              ...current.snapshot,
              connection: {
                ...current.snapshot.connection,
                mode: "reconnecting",
                message: "The local server is unavailable. Retrying…",
              },
            },
            pending: null,
            count: 0,
          });
      }
    }
  }
  return {
    refresh(force = false): Promise<void> {
      queued = true;
      forced ||= force;
      if (!running) {
        const version = generation;
        running = drain(version).finally(() => {
          if (version === generation) running = undefined;
        });
      }
      return running;
    },
    async loadMore(): Promise<void> {
      if (paging) return;
      const before = deps.read();
      if (!before.snapshot?.nextCursor) return;
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
        if (pageKey !== key(current)) {
          pageKey = key(current);
          older = null;
        }
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
      queued = false;
      forced = false;
      running = undefined;
    },
  };
}
