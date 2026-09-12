import test from "node:test";
import assert from "node:assert/strict";
import { homeTemperatureRange } from "../src/lib/home-summary";
import type { HAState, Metadata } from "../src/lib/types";
const state = (entity_id: string, state: string, unit = "°C"): HAState => ({
  entity_id,
  state,
  attributes: { device_class: "temperature", unit_of_measurement: unit },
  last_changed: "2026-09-11T20:00:00Z",
  last_updated: "2026-09-11T20:00:00Z",
});
test("range uses real indoor measurements, excluding thresholds, soil, outdoor, unavailable and unassigned sensors", () => {
  const states = [
    state("sensor.bedroom", "18"),
    state("sensor.office", "25"),
    state("number.comfort_max", "30"),
    state("sensor.soil", "9"),
    state("sensor.outdoor", "6"),
    state("sensor.offline", "unavailable"),
    state("sensor.unassigned", "2"),
  ];
  const metadata: Metadata = Object.fromEntries(
    states
      .filter((s) => s.entity_id !== "sensor.unassigned")
      .map((s) => [
        s.entity_id,
        { name: s.entity_id, room: { id: "room", name: "Room" } },
      ]),
  );
  assert.deepEqual(homeTemperatureRange(states, metadata), {
    min: 18,
    max: 25,
    coolestRoom: { id: "room", name: "Room" },
    warmestRoom: { id: "room", name: "Room" },
    unit: "°C",
    rooms: 1,
    sensors: 2,
  });
});
test("mixed units convert, invalid readings do not produce NaN or zero", () => {
  const states = [
    state("sensor.one", "20"),
    state("sensor.two", "77", "°F"),
    state("sensor.bad", ""),
    state("sensor.inf", "Infinity"),
  ];
  const metadata: Metadata = Object.fromEntries(
    states.map((s) => [
      s.entity_id,
      { name: s.entity_id, room: { id: "room", name: "Room" } },
    ]),
  );
  assert.equal(homeTemperatureRange(states, metadata)?.max, 25);
  assert.equal(homeTemperatureRange(states, metadata)?.min, 20);
  assert.equal(homeTemperatureRange([], {}), null);
});

test("room labels follow temperature extremes after unit conversion", () => {
  const metadata: Metadata = {
    "sensor.bedroom": { name: "Bedroom", room: { id: "bed", name: "Bedroom" } },
    "sensor.living": {
      name: "Living",
      room: { id: "living", name: "Living room" },
    },
  };
  const result = homeTemperatureRange(
    [state("sensor.living", "22"), state("sensor.bedroom", "68", "°F")],
    metadata,
  );
  assert.equal(result?.coolestRoom.name, "Bedroom");
  assert.equal(result?.warmestRoom.name, "Living room");
  assert.equal(result?.rooms, 2);
});
