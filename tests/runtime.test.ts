import test from "node:test";
import assert from "node:assert/strict";
import { HomeRuntime } from "../src/server/runtime-core";
import { fixture, secret } from "./helpers/mock-ha";
import { createDemo } from "../src/lib/demo";
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(predicate: () => boolean, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("Condition was not reached");
    await pause(30);
  }
}
test("runtime retains a live observation received before the snapshot and clears everything on disconnect", async () => {
  const f = await fixture();
  const home = new HomeRuntime();
  try {
    await home.connect(f.url, secret);
    assert.equal(home.connection.mode, "connected");
    const snapshot = home.snapshot(
      "2026-09-11T00:00:00Z",
      "2026-09-12T00:00:00Z",
    );
    assert.ok(snapshot.events.some((e) => e.kind === "lighting.on"));
    assert.ok(!JSON.stringify(snapshot).includes(secret));
    home.disconnect();
    assert.equal(home.evidence(snapshot.events[0].id), undefined);
    assert.equal(
      home.snapshot("2026-09-11T00:00:00Z", "2026-09-12T00:00:00Z").states
        .length,
      0,
    );
  } finally {
    home.disconnect();
    await f.close();
  }
});
test("runtime reconnects and resubscribes after interrupted transport", async () => {
  const f = await fixture();
  const home = new HomeRuntime();
  try {
    await home.connect(f.url, secret);
    const before = f.order.filter((x) => x === "get_states").length;
    f.drop();
    await until(() => home.connection.mode === "reconnecting");
    await until(() => home.connection.mode === "connected");
    assert.ok(f.order.filter((x) => x === "get_states").length > before);
  } finally {
    home.disconnect();
    await f.close();
  }
});
test("SSE listeners get replay or resync and are removed cleanly", async () => {
  const home = new HomeRuntime();
  const first: { id: number; type: string }[] = [];
  const off = home.listen((e) => first.push(e));
  home.notify();
  await pause(140);
  assert.equal(first[0].type, "resync");
  assert.equal(first.at(-1)?.type, "update");
  const replay: { id: number; type: string }[] = [];
  const stop = home.listen((e) => replay.push(e), first[0].id);
  assert.equal(replay[0].type, "update");
  stop();
  off();
  const stoppedCount = first.length;
  home.notify();
  await pause(140);
  assert.equal(first.length, stoppedCount);
  home.disconnect();
  const stale: { id: number; type: string }[] = [];
  const staleOff = home.listen((e) => stale.push(e), 0);
  assert.equal(stale[0].type, "resync");
  staleOff();
});
test("noise is removed before pagination, so useful activity cannot be crowded out", async () => {
  const home = new HomeRuntime();
  const now = new Date("2026-09-11T20:00:00Z");
  const demo = createDemo(now);
  const useful = demo.events.find((e) => e.kind === "lighting.on")!.observation;
  const f = await fixture();
  try {
    await home.connect(f.url, secret);
    await home.ensureHistory("2026-09-11T00:00:00Z", "2026-09-12T00:00:00Z");
    f.emit({
      event_type: "state_changed",
      time_fired: useful.timestamp,
      data: { old_state: useful.previous, new_state: useful.current },
    });
    for (let i = 0; i < 2500; i++) {
      const timestamp = new Date(now.getTime() + i * 1000).toISOString();
      const current = {
        entity_id: "sensor.noisy",
        state: String(i),
        attributes: {},
        last_changed: timestamp,
        last_updated: timestamp,
      };
      f.emit({
        event_type: "state_changed",
        time_fired: timestamp,
        data: {
          old_state: { ...current, state: String(i - 1) },
          new_state: current,
        },
      });
    }
    await until(
      () =>
        home.snapshot("2026-09-11T00:00:00Z", "2026-09-12T00:00:00Z")
          .hiddenCount === 2500,
    );
    const snapshot = home.snapshot(
      "2026-09-11T00:00:00Z",
      "2026-09-12T00:00:00Z",
    );
    assert.ok(snapshot.events.some((e) => e.id === useful.id));
    assert.ok(home.evidence(useful.id));
    assert.equal(snapshot.hiddenCount, 2500);
    assert.equal(snapshot.nextCursor, undefined);
    home.disconnect();
  } finally {
    home.disconnect();
    await f.close();
  }
});
