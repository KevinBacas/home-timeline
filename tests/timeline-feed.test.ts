import test from "node:test";
import assert from "node:assert/strict";
import { createTimelineFeed } from "../src/client/timeline-feed";
import { createDemo } from "../src/lib/demo";
import type { Snapshot } from "../src/lib/types";

test("refreshes defer new activity while reading, but a new filter replaces the view", () => {
  const base = createDemo();
  base.connection.mode = "connected";
  const [one, two] = base.events;
  let context = {
    url: "old",
    view: { start: "2000-01-01", end: "2100-01-01", debug: true },
    snapshot: { ...base, events: [one] },
    reading: true,
  };
  let pending: Snapshot | null = null;
  let count = 0;
  const feed = createTimelineFeed({
    read: () => context,
    fetch: async () => base,
    commit: (update) => {
      context.snapshot = update.snapshot;
      pending = update.pending;
      count = update.count;
    },
  });
  feed.receive("old", context.snapshot);
  feed.receive("old", { ...base, events: [one, two] });
  assert.deepEqual(context.snapshot.events, [one]);
  assert.equal(count, 1);
  assert.ok(pending);
  context = { ...context, url: "new" };
  feed.receive("old", base);
  assert.deepEqual(context.snapshot.events, [one]);
  feed.receive("new", { ...base, events: [two] });
  assert.deepEqual(context.snapshot.events, [two]);
  assert.equal(pending, null);
});

test("refreshes preserve older pages and query changes discard them", async () => {
  const base = createDemo();
  base.connection.mode = "connected";
  const [one, two, three] = base.events;
  let context = {
    url: "/api/timeline?q=",
    view: { start: "2000", end: "2100" },
    snapshot: { ...base, events: [one], nextCursor: one.id } as Snapshot,
    reading: false,
  };
  const feed = createTimelineFeed({
    read: () => context,
    fetch: async () => ({ ...base, events: [two], nextCursor: two.id }),
    commit: (update) => {
      context.snapshot = update.snapshot;
    },
  });
  feed.receive(context.url, context.snapshot);
  await feed.loadMore();
  assert.ok(context.snapshot.events.some((e) => e.id === two.id));
  feed.receive(context.url, {
    ...base,
    events: [three, one],
    nextCursor: one.id,
  });
  assert.deepEqual(
    new Set(context.snapshot.events.map((e) => e.id)),
    new Set([one.id, two.id, three.id]),
  );
  assert.equal(context.snapshot.nextCursor, two.id);
  context = { ...context, url: "/api/timeline?q=other" };
  feed.receive(context.url, { ...base, events: [], nextCursor: undefined });
  assert.equal(context.snapshot.events.length, 0);
});

for (const change of ["query", "connection"] as const) {
  test(`late pagination cannot commit after a ${change} change`, async () => {
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
    });
    feed.receive(context.url, base);
    const pending = feed.loadMore();
    if (change === "query")
      context = { ...context, url: "/api/timeline?q=new" };
    else feed.cancel();
    resolve(base);
    await pending;
    assert.equal(commits, 1);
  });
}
