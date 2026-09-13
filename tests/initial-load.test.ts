import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { createDemo } from "../src/lib/demo";
import type { Snapshot } from "../src/lib/types";

// QueryObserver schedules browser polling only when window exists. No DOM is
// needed: this tests the real query scheduler with deterministic browser timers.
Object.defineProperty(globalThis, "window", { value: {}, configurable: true });
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

function installTimers(t: TestContext) {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: Date.now() });
  // Node 20 MockTimers can resurrect an interval cleared inside its callback.
  // Model browser intervals with cancellable timeouts instead.
  const intervals = new Map<
    ReturnType<typeof setTimeout>,
    { stopped: boolean; next: ReturnType<typeof setTimeout> }
  >();
  t.mock.method(
    globalThis,
    "setInterval",
    (callback: () => void, delay: number) => {
      const tick = () => {
        callback();
        if (!timer.stopped) timer.next = setTimeout(tick, delay);
      };
      const timer = { stopped: false, next: setTimeout(tick, delay) };
      intervals.set(timer.next, timer);
      return timer.next;
    },
  );
  t.mock.method(
    globalThis,
    "clearInterval",
    (id: ReturnType<typeof setInterval>) => {
      const timer = intervals.get(id);
      if (timer) {
        timer.stopped = true;
        clearTimeout(timer.next);
        intervals.delete(id);
      }
    },
  );
}

test("a configured home populates its first readings automatically, then slows to one minute", async (t) => {
  const { QueryObserver } = await import("@tanstack/react-query");
  const { createHomeQueryClient, statusOptions } =
    await import("../src/client/home-queries");
  installTimers(t);
  const client = createHomeQueryClient();
  client.setQueryDefaults([], { gcTime: Infinity });
  const ready = createDemo();
  ready.connection.mode = "connected";
  ready.connection.managed = true;
  ready.connection.history = "ready";
  let response: Snapshot = {
    ...ready,
    states: [],
    connection: { ...ready.connection, mode: "reconnecting" },
  };
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => {
    requests++;
    return Response.json(response);
  });
  const observer = new QueryObserver(client, statusOptions());
  const off = observer.subscribe(() => {});
  try {
    await flush();
    assert.equal(observer.getCurrentResult().data?.states.length, 0);
    response = ready;
    t.mock.timers.tick(2000);
    await flush();
    assert.ok(
      observer.getCurrentResult().data?.states.length,
      "First readings should appear without manual refresh",
    );
    const settledRequests = requests;
    t.mock.timers.tick(59000);
    await flush();
    assert.equal(
      requests,
      settledRequests,
      "Ready homes should use slow polling",
    );
  } finally {
    off();
    client.clear();
  }
});

for (const past of [false, true]) {
  test(`${past ? "past" : "current"} timeline finishes its initial history load automatically`, async (t) => {
    const { QueryObserver } = await import("@tanstack/react-query");
    const { createHomeQueryClient, timelineOptions } =
      await import("../src/client/home-queries");
    installTimers(t);
    const client = createHomeQueryClient();
    client.setQueryDefaults([], { gcTime: Infinity });
    const ready = createDemo();
    ready.connection.mode = "connected";
    ready.connection.history = "ready";
    let response: Snapshot = {
      ...ready,
      events: [],
      connection: { ...ready.connection, history: "loading" },
    };
    let requests = 0;
    t.mock.method(globalThis, "fetch", async () => {
      requests++;
      return Response.json(response);
    });
    const observer = new QueryObserver(
      client,
      timelineOptions("home", "/api/timeline", past),
    );
    const off = observer.subscribe(() => {});
    try {
      await flush();
      assert.equal(observer.getCurrentResult().data?.events.length, 0);
      response = ready;
      t.mock.timers.tick(2000);
      await flush();
      assert.ok(
        observer.getCurrentResult().data?.events.length,
        "Initial history should appear without manual refresh",
      );
      const settledRequests = requests;
      t.mock.timers.tick(past ? 120000 : 59000);
      await flush();
      assert.equal(
        requests,
        settledRequests,
        "Completed history must stop fast polling",
      );
    } finally {
      off();
      client.clear();
    }
  });
}
