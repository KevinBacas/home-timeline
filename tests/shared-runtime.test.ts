import test from "node:test";
import assert from "node:assert/strict";
import { sharedRuntime } from "../src/server/shared-runtime";
import { HomeRuntime } from "../src/server/runtime-core";
test("replaces incompatible runtime and refreshes stale methods without losing session state", () => {
  const old = new HomeRuntime();
  let disconnected = false;
  old.disconnect = () => {
    disconnected = true;
  };
  const host = { __homeTimelineRuntime: old, __homeTimelineRuntimeVersion: 1 };
  const runtime = sharedRuntime(host);
  assert.equal(disconnected, true);
  assert.notEqual(runtime, old);
  runtime.connection.name = "Retained session";
  Object.setPrototypeOf(runtime, {
    ...HomeRuntime.prototype,
    snapshot: () => ({ events: ["stale"] }),
  });
  const refreshed = sharedRuntime(host);
  assert.equal(refreshed, runtime);
  assert.equal(Object.getPrototypeOf(refreshed), HomeRuntime.prototype);
  assert.equal(refreshed.connection.name, "Retained session");
  assert.deepEqual(
    refreshed.snapshot("2026-09-11T00:00:00Z", "2026-09-12T00:00:00Z").events,
    [],
  );
  refreshed.disconnect();
});
