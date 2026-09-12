import test from "node:test";
import assert from "node:assert/strict";
import { checkLocalRequest, safeUrl, stateSchema } from "../src/lib/security";
import { ObservationStore } from "../src/server/store";
import { createDemo } from "../src/lib/demo";
const sentinel = "SENTINEL_HOME_ASSISTANT_SECRET_123";
test("only allowlisted state attributes reach the app", () => {
  const raw = {
    entity_id: "camera.front",
    state: "idle",
    last_changed: "2026-09-11T12:00:00Z",
    last_updated: "2026-09-11T12:00:00Z",
    attributes: {
      access_token: sentinel,
      entity_picture: `/camera?token=${sentinel}`,
      nested: { token: sentinel },
      friendly_name: "Front camera",
    },
  };
  const parsed = stateSchema.parse(raw);
  assert.ok(!JSON.stringify(parsed).includes(sentinel));
  assert.equal(parsed.attributes.friendly_name, "Front camera");
});
test("reject unsafe URL shapes and preserve local host URLs", () => {
  for (const url of [
    "file:///etc/passwd",
    "ftp://home.local",
    "http://user:secret@home.local",
    "http://home.local/?token=secret",
  ])
    assert.throws(() => safeUrl(url));
  assert.equal(
    safeUrl("http://homeassistant.local:8123/"),
    "http://homeassistant.local:8123",
  );
  assert.equal(safeUrl("https://home.example/ha"), "https://home.example/ha");
});
test("reject hostile Host, Origin, and cross-site requests", () => {
  assert.throws(() =>
    checkLocalRequest(
      new Request("http://127.0.0.1:3000/api/connection", {
        headers: { host: "attacker.example" },
      }),
    ),
  );
  assert.throws(() =>
    checkLocalRequest(
      new Request("http://127.0.0.1:3000/api/connection", {
        headers: { host: "127.0.0.1:3000", origin: "https://attacker.example" },
      }),
    ),
  );
  assert.doesNotThrow(() =>
    checkLocalRequest(
      new Request("http://127.0.0.1:3000/api/connection", {
        headers: { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" },
      }),
    ),
  );
});
test("LRU store enforces budget and favors live evidence", () => {
  const events = createDemo().events;
  const store = new ObservationStore(6000);
  for (const e of events) store.put(e.observation);
  assert.ok(store.byteSize <= 6000);
  assert.ok(store.evictions > 0);
  const o = { ...events[0].observation, origin: "live" as const };
  store.put(o);
  store.put({ ...o, origin: "history" });
  assert.equal(store.get(o.id)?.origin, "live");
  store.clear();
  assert.equal(store.size, 0);
  assert.equal(store.byteSize, 0);
});

test("a sensor flood evicts technical noise before meaningful home events", () => {
  const store = new ObservationStore(12000);
  const useful = createDemo().events.find(
    (e) => e.kind === "lighting.on",
  )!.observation;
  store.put(useful);
  for (let i = 0; i < 1000; i++) {
    const timestamp = new Date(1700000000000 + i * 1000).toISOString();
    const current = {
      entity_id: "sensor.noise",
      state: String(i),
      attributes: {},
      last_changed: timestamp,
      last_updated: timestamp,
    };
    store.put({
      id: `noise-${i}`,
      entityId: current.entity_id,
      timestamp,
      current,
      previous: { ...current, state: String(i - 1) },
      type: "state",
      origin: "history",
    });
  }
  assert.ok(store.evictions > 0);
  assert.ok(store.byteSize <= 12000);
  assert.ok(store.get(useful.id));
});
