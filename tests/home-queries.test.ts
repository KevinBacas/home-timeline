import test from "node:test";
import assert from "node:assert/strict";
import { QueryObserver } from "@tanstack/react-query";
import {
  createHomeQueryClient,
  entityHistoryOptions,
  timelineOptions,
} from "../src/client/home-queries";
import { createDemo } from "../src/lib/demo";

const url = "/api/timeline?start=2020-01-01&end=2020-01-02";

test("concurrent requests share a fetch and completed history is reused for ten minutes", async (t) => {
  const client = createHomeQueryClient();
  client.setQueryDefaults([], { gcTime: Infinity });
  const snapshot = createDemo();
  snapshot.connection.history = "ready";
  let now = Date.now();
  t.mock.method(Date, "now", () => now);
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => {
    requests++;
    return Response.json(snapshot);
  });
  try {
    const options = timelineOptions("home-one", url, true);
    await Promise.all([client.fetchQuery(options), client.fetchQuery(options)]);
    assert.equal(requests, 1);
    now += 6 * 60_000;
    await client.fetchQuery(options);
    assert.equal(requests, 1);
    now += 5 * 60_000;
    await client.fetchQuery(options);
    assert.equal(requests, 2);
  } finally {
    client.clear();
  }
});

test("current and partial history become fetchable after a minute", async (t) => {
  const client = createHomeQueryClient();
  client.setQueryDefaults([], { gcTime: Infinity });
  let now = Date.now();
  t.mock.method(Date, "now", () => now);
  const snapshot = createDemo();
  snapshot.connection.history = "partial";
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => {
    requests++;
    return Response.json(snapshot);
  });
  try {
    for (const past of [false, true]) {
      const options = timelineOptions("home-one", url + past, past);
      await client.fetchQuery(options);
      const initial = requests;
      now += 59_000;
      await client.fetchQuery(options);
      assert.equal(requests, initial);
      now += 1001;
      await client.fetchQuery(options);
      assert.equal(requests, initial + 1);
    }
  } finally {
    client.clear();
  }
});

test("reopening entity history reuses the cache; changing connections does not", async (t) => {
  const client = createHomeQueryClient();
  client.setQueryDefaults([], { gcTime: Infinity });
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => {
    requests++;
    return Response.json({ events: [] });
  });
  try {
    const range = { start: "2020-01-01", end: "2020-01-02" };
    await client.fetchQuery(entityHistoryOptions("one", "light.hall", range));
    await client.fetchQuery(entityHistoryOptions("one", "light.hall", range));
    assert.equal(requests, 1);
    await client.fetchQuery(entityHistoryOptions("two", "light.hall", range));
    assert.equal(requests, 2);
  } finally {
    client.clear();
  }
});

test("removing a connection cache aborts in-flight fetches and drops retained data", async (t) => {
  const client = createHomeQueryClient();
  client.setQueryDefaults([], { gcTime: Infinity });
  let signal: AbortSignal | null | undefined;
  t.mock.method(globalThis, "fetch", (_url: string, init: RequestInit) => {
    signal = init.signal;
    return new Promise<Response>(() => {});
  });
  try {
    const pending = client
      .fetchQuery(timelineOptions("one", url, false))
      .catch(() => {});
    assert.ok(signal);
    client.clear();
    await pending;
    assert.equal(signal.aborted, true);
    assert.equal(client.getQueryCache().getAll().length, 0);
  } finally {
    client.clear();
  }
});

test("hidden views stay disabled and return to stale data with one request", async (t) => {
  const client = createHomeQueryClient();
  client.setQueryDefaults([], { gcTime: Infinity });
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => {
    requests++;
    return Response.json(createDemo());
  });
  const options = timelineOptions("one", url, false);
  const observer = new QueryObserver(client, { ...options, enabled: false });
  const off = observer.subscribe(() => {});
  try {
    await client.invalidateQueries();
    assert.equal(requests, 0);
    observer.setOptions({ ...options, enabled: true });
    await client.fetchQuery(options);
    assert.equal(requests, 1);
    observer.setOptions({ ...options, enabled: false });
    await client.invalidateQueries();
    assert.equal(requests, 1);
    observer.setOptions({ ...options, enabled: true });
    await client.fetchQuery(options);
    assert.equal(requests, 2);
  } finally {
    off();
    client.clear();
  }
});
