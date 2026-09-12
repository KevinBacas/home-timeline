import test from "node:test";
import assert from "node:assert/strict";
import { createTimelineFeed } from "../src/client/timeline-feed";
import { createDemo } from "../src/lib/demo";
import type { Snapshot } from "../src/lib/types";

test("queued forced query refresh wins over an in-flight reading refresh", async () => {
  const initial = createDemo();
  initial.connection.mode = "connected";
  let context = {
    url: "old",
    view: { start: "2000-01-01", end: "2100-01-01" },
    snapshot: initial,
    reading: true,
  };
  const requests: { url: string; resolve: (s: Snapshot) => void }[] = [];
  const commits: Snapshot[] = [];
  const feed = createTimelineFeed({
    read: () => context,
    fetch: (url) => new Promise((resolve) => requests.push({ url, resolve })),
    commit: (update) => {
      commits.push(update.snapshot);
      context.snapshot = update.snapshot;
    },
    demo: createDemo,
  });
  const pending = feed.refresh();
  context = { ...context, url: "new" };
  const queued = feed.refresh(true);
  requests[0].resolve(initial);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(requests[1].url, "new");
  const next = { ...initial, events: [] };
  requests[1].resolve(next);
  await Promise.all([pending, queued]);
  assert.deepEqual(commits, [next]);
});

test("cancelled refresh cannot commit after teardown", async () => {
  let resolve!: (s: Snapshot) => void;
  let commits = 0;
  const feed = createTimelineFeed({
    read: () => ({
      url: "/",
      view: { start: "2000", end: "2100" },
      snapshot: null,
      reading: false,
    }),
    fetch: () =>
      new Promise((done) => {
        resolve = done;
      }),
    commit: () => {
      commits++;
    },
    demo: createDemo,
  });
  const pending = feed.refresh();
  feed.cancel();
  resolve(createDemo());
  await pending;
  assert.equal(commits, 0);
});

test("stream refreshes preserve older pages and query changes discard them", async () => {
  const base = createDemo();
  base.connection.mode = "connected";
  const [one, two, three] = base.events;
  let context = {
    url: "/api/timeline?q=",
    view: { start: "2000", end: "2100" },
    snapshot: { ...base, events: [one], nextCursor: one.id } as Snapshot,
    reading: false,
  };
  let firstPage = context.snapshot;
  const feed = createTimelineFeed({
    read: () => context,
    fetch: async (url) =>
      url.includes("&cursor=")
        ? { ...base, events: [two], nextCursor: two.id }
        : firstPage,
    commit: (update) => {
      context.snapshot = update.snapshot;
    },
    demo: createDemo,
  });
  await feed.refresh(true);
  await feed.loadMore();
  assert.ok(context.snapshot.events.some((e) => e.id === two.id));
  firstPage = { ...base, events: [three, one], nextCursor: one.id };
  await feed.refresh();
  assert.deepEqual(
    new Set(context.snapshot.events.map((e) => e.id)),
    new Set([one.id, two.id, three.id]),
  );
  assert.equal(context.snapshot.nextCursor, two.id);
  context = { ...context, url: "/api/timeline?q=other" };
  firstPage = { ...base, events: [], nextCursor: undefined };
  await feed.refresh(true);
  assert.equal(context.snapshot.events.length, 0);
});

test("late pagination response cannot overwrite a new query", async () => {
  const base = createDemo();
  base.connection.mode = "connected";
  let context = {
    url: "/api/timeline?q=old",
    view: { start: "2000", end: "2100" },
    snapshot: { ...base, nextCursor: "cursor" },
    reading: false,
  };
  let resolve!: (s: Snapshot) => void;
  let commits = 0;
  const feed = createTimelineFeed({
    read: () => context,
    fetch: () =>
      new Promise((done) => {
        resolve = done;
      }),
    commit: () => {
      commits++;
    },
    demo: createDemo,
  });
  const pending = feed.loadMore();
  context = { ...context, url: "/api/timeline?q=new" };
  resolve(base);
  await pending;
  assert.equal(commits, 0);
});
