import { fixture, secret } from "./helpers/mock-ha";
import test from "node:test";
import assert from "node:assert/strict";
import { HomeAssistantAdapter } from "../src/server/adapter";
import type { Observation } from "../src/lib/types";
test("adapter authenticates, subscribes before snapshot, enriches entity area over device area, and sanitizes", async () => {
  const f = await fixture();
  const adapter = new HomeAssistantAdapter(f.url, secret);
  try {
    const events: Observation[] = [];
    await adapter.connect(
      (o) => events.push(o),
      () => {},
    );
    const states = await adapter.loadCurrent();
    const metadata = await adapter.loadMetadata(states);
    assert.equal(metadata.metadata["light.hallway"].room?.name, "Hallway");
    assert.equal(metadata.metadata["light.hallway"].device?.name, "Lamp");
    assert.ok(
      f.order.indexOf("subscribe_events") < f.order.indexOf("get_states"),
    );
    assert.equal(events.length, 1);
    assert.ok(!JSON.stringify({ events, states, metadata }).includes(secret));
    const history = await adapter.fetchHistory(
      ["light.hallway"],
      "2026-09-11T12:00:00Z",
      "2026-09-11T13:00:00Z",
    );
    assert.equal(history.length, 1);
    assert.ok(
      f.received.some((path) => path.includes("significant_changes_only=0")),
    );
    const automations = await adapter.fetchAutomations(
      "2026-09-11T12:00:00Z",
      "2026-09-11T13:00:00Z",
    );
    assert.equal(automations.length, 1);
  } finally {
    adapter.disconnect();
    await f.close();
  }
});
test("bad credentials produce safe errors without echoing the secret", async () => {
  const f = await fixture();
  const adapter = new HomeAssistantAdapter(f.url, "incorrect-secret");
  try {
    await assert.rejects(adapter.rest("/api/config"), /rejected the token/);
    await assert.rejects(
      adapter.connect(
        () => {},
        () => {},
      ),
      (error) =>
        error instanceof Error &&
        error.message.includes("rejected") &&
        !error.message.includes("incorrect-secret"),
    );
  } finally {
    adapter.disconnect();
    await f.close();
  }
});
test("registry permissions degrade gracefully and malformed states fail safely", async () => {
  const f = await fixture({ denyRegistries: true });
  const a = new HomeAssistantAdapter(f.url, secret);
  try {
    await a.connect(
      () => {},
      () => {},
    );
    const result = await a.loadMetadata(await a.loadCurrent());
    assert.equal(result.partial, true);
    assert.equal(result.metadata["light.hallway"].room, undefined);
  } finally {
    a.disconnect();
    await f.close();
  }
  const bad = await fixture({ malformedStates: true });
  const b = new HomeAssistantAdapter(bad.url, secret);
  try {
    await b.connect(
      () => {},
      () => {},
    );
    await assert.rejects(b.loadCurrent(), /invalid entity/);
  } finally {
    b.disconnect();
    await bad.close();
  }
});
