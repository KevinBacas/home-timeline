import test from "node:test";
import assert from "node:assert/strict";
import {
  normalize,
  interpret,
  groupEvents,
  observationId,
} from "../src/lib/engine";
import { historyObservations } from "../src/server/adapter";
import { createDemo } from "../src/lib/demo";
import { rangeForPeriod } from "../src/lib/time";
import type { HAState, Observation } from "../src/lib/types";
function state(
  entity: string,
  value: string,
  attributes: Record<string, unknown> = {},
  time = "2026-09-11T10:00:00.000Z",
): HAState {
  return {
    entity_id: entity,
    state: value,
    attributes,
    last_changed: time,
    last_updated: time,
  };
}
function observe(
  entity: string,
  old: string,
  next: string,
  attrs: Record<string, unknown> = {},
  before: Record<string, unknown> = {},
  time = "2026-09-11T10:00:00.000Z",
): Observation {
  const current = state(entity, next, attrs, time);
  return {
    id: observationId(current),
    entityId: entity,
    timestamp: time,
    type: "state",
    origin: "live",
    previous: state(entity, old, before, time),
    current,
  };
}
test("door class interprets on/off, with no invented room", () => {
  const e = normalize(
    observe("binary_sensor.front_door", "off", "on", {
      device_class: "door",
      friendly_name: "Front door",
    }),
    {},
  );
  assert.equal(e.title, "Front door opened");
  assert.equal(e.room, undefined);
});
test("presence never interprets unknown as departure", () => {
  assert.ok(
    normalize(observe("person.kevin", "home", "unknown"), {}).suppressed,
  );
  assert.ok(
    normalize(observe("person.kevin", "unknown", "home"), {}).suppressed,
  );
  const e = normalize(observe("person.kevin", "home", "not_home"), {
    "person.kevin": { name: "Kevin" },
  });
  assert.equal(e.title, "Kevin left home");
  assert.equal(e.person?.id, "person.kevin");
});
test("motion clearing and tiny brightness changes are suppressed", () => {
  assert.ok(
    normalize(
      observe("binary_sensor.motion", "on", "off", { device_class: "motion" }),
      {},
    ).suppressed,
  );
  assert.ok(
    normalize(
      observe(
        "light.room",
        "on",
        "on",
        { brightness: 150 },
        { brightness: 145 },
      ),
      {},
    ).suppressed,
  );
  assert.equal(
    normalize(
      observe(
        "light.room",
        "on",
        "on",
        { brightness: 50 },
        { brightness: 200 },
      ),
      {},
    ).kind,
    "lighting.dimmed",
  );
});
test("climate attributes matter, ordinary measurements do not", () => {
  assert.equal(
    normalize(
      observe(
        "climate.room",
        "heat",
        "heat",
        { temperature: 22 },
        { temperature: 20 },
      ),
      {},
    ).kind,
    "climate.target",
  );
  assert.equal(
    normalize(
      observe(
        "climate.room",
        "heat",
        "heat",
        { hvac_action: "heating" },
        { hvac_action: "idle" },
      ),
      {},
    ).kind,
    "climate.action",
  );
  assert.ok(
    normalize(
      observe(
        "climate.room",
        "heat",
        "heat",
        { current_temperature: 21.2 },
        { current_temperature: 21.1 },
      ),
      {},
    ).suppressed,
  );
});
test("media progress is hidden; playback start is visible", () => {
  assert.ok(
    normalize(
      observe(
        "media_player.tv",
        "playing",
        "playing",
        { media_position: 20 },
        { media_position: 19 },
      ),
      {},
    ).suppressed,
  );
  assert.equal(
    normalize(observe("media_player.tv", "idle", "playing"), {}).kind,
    "media.playing",
  );
});
test("automation enabled state is not an execution", () => {
  assert.ok(
    normalize(observe("automation.evening", "off", "on"), {}).suppressed,
  );
  const o = observe("automation.evening", "on", "on");
  o.type = "automation";
  assert.equal(normalize(o, {}).kind, "automation.started");
});
test("unavailability only becomes visible after sixty seconds", () => {
  const o = observe("sensor.garden", "20", "unavailable");
  assert.ok(interpret([o], {}, Date.parse(o.timestamp) + 59000)[0].suppressed);
  assert.equal(
    interpret([o], {}, Date.parse(o.timestamp) + 61000)[0].suppressed,
    undefined,
  );
  const recovered = observe(
    "sensor.garden",
    "unavailable",
    "20",
    {},
    {},
    "2026-09-11T10:00:30.000Z",
  );
  assert.ok(
    interpret(
      [o, recovered],
      {},
      Date.parse(recovered.timestamp) + 60000,
    ).every((e) => e.suppressed),
  );
});
test("history baseline is not an event, attribute changes retain evidence", () => {
  const old = state("light.room", "on", { brightness: 200 });
  const next = state(
    "light.room",
    "on",
    { brightness: 50 },
    "2026-09-11T10:01:00.000Z",
  );
  const observations = historyObservations([[old, next]]);
  assert.equal(observations.length, 1);
  assert.equal(observations[0].previous?.attributes.brightness, 200);
  assert.equal(interpret(observations, {})[0].kind, "lighting.dimmed");
});
test("live and history identities deduplicate, repeated physical actions remain", () => {
  const o = observe("lock.door", "unlocked", "locked");
  const h = { ...o, origin: "history" as const };
  assert.equal(interpret([o, h], {}).length, 1);
  const later = observe(
    "lock.door",
    "unlocked",
    "locked",
    {},
    {},
    "2026-09-11T10:02:00.000Z",
  );
  assert.equal(interpret([o, later], {}).length, 2);
});
test("demo exercises real grouping and preserves chronological children", () => {
  const d = createDemo(new Date("2026-09-11T20:00:00Z"));
  const items = groupEvents(d.events.filter((e) => !e.suppressed));
  assert.ok(items.some((i) => i.type === "story" && i.story.rule === "movie"));
  assert.ok(
    items.some((i) => i.type === "story" && i.story.rule === "arrival"),
  );
  const ids: string[] = [];
  for (const i of items) {
    if (i.type === "event") ids.push(i.event.id);
    else {
      ids.push(...i.story.events.map((e) => e.id));
      assert.deepEqual(
        i.story.events.map((e) => e.timestamp),
        i.story.events.map((e) => e.timestamp).sort(),
      );
    }
  }
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(
    items,
    groupEvents(d.events.filter((e) => !e.suppressed).reverse()),
  );
});
test("motion attribution does not inherit the resident person", () => {
  const d = createDemo();
  assert.ok(
    d.events.filter((e) => e.category === "motion").every((e) => !e.person),
  );
});
test("unambiguous automation context resolves; no evidence remains unknown", () => {
  const d = createDemo();
  const light = d.events.find((e) => e.entityId === "light.hallway")!;
  assert.equal(light.related?.[0]?.relationship, "automation");
  assert.equal(
    d.events.find((e) => e.entityId === "lock.front_door")?.related,
    undefined,
  );
});
test("calendar ranges use home timezone across DST", () => {
  const spring = rangeForPeriod(
    "Yesterday",
    "Europe/Paris",
    "",
    "",
    new Date("2026-03-30T12:00:00Z"),
  );
  assert.equal(
    (Date.parse(spring.end) - Date.parse(spring.start)) / 3600000,
    23,
  );
  const autumn = rangeForPeriod(
    "Yesterday",
    "Europe/Paris",
    "",
    "",
    new Date("2026-10-26T12:00:00Z"),
  );
  assert.equal(
    (Date.parse(autumn.end) - Date.parse(autumn.start)) / 3600000,
    25,
  );
});
test("normalizing and grouping 10,000 fixture events stays bounded", () => {
  const started = performance.now();
  const observations = Array.from({ length: 10000 }, (_, i) =>
    observe(
      "lock.door",
      "unlocked",
      "locked",
      {},
      {},
      new Date(1700000000000 + i * 60000).toISOString(),
    ),
  );
  assert.equal(groupEvents(interpret(observations, {})).length, 10000);
  assert.ok(performance.now() - started < 1500);
});

test("nearby distinct room lights form an expandable stable story", () => {
  const lights = ["Plafond", "Lumière Kevin", "Lumière Maia"].map((name, i) =>
    normalize(
      observe(
        "light.bedroom_" + i,
        "off",
        "on",
        {},
        {},
        new Date(Date.parse("2026-09-11T10:00:00Z") + i * 5000).toISOString(),
      ),
      {
        ["light.bedroom_" + i]: {
          name,
          room: { id: "bedroom", name: "Bedroom" },
        },
      },
    ),
  );
  const initial = groupEvents(lights.slice(0, 2))[0];
  const result = groupEvents(lights);
  assert.equal(result.length, 1);
  assert.equal(result[0].type, "story");
  if (result[0].type !== "story") return;
  assert.equal(result[0].story.title, "Bedroom lights turned on");
  assert.deepEqual(
    result[0].story.events.map((e) => e.title),
    ["Plafond turned on", "Lumière Kevin turned on", "Lumière Maia turned on"],
  );
  assert.equal(result[0].id, initial.id);
  assert.deepEqual(groupEvents([...lights].reverse()), result);
});

test("light grouping respects room, time, distinct entities and off transitions", () => {
  const light = (id: string, seconds: number, room = "bedroom", next = "on") =>
    normalize(
      observe(
        id,
        next === "on" ? "off" : "on",
        next,
        {},
        {},
        new Date(
          Date.parse("2026-09-11T10:00:00Z") + seconds * 1000,
        ).toISOString(),
      ),
      {
        [id]: { name: id, ...(room ? { room: { id: room, name: room } } : {}) },
      },
    );
  for (const events of [
    [light("light.a", 0), light("light.b", 31)],
    [light("light.a", 0), light("light.b", 1, "kitchen")],
    [light("light.a", 0, ""), light("light.b", 1, "")],
    [light("light.a", 0), light("light.a", 1)],
    [
      light("light.a", 0),
      light("light.a", 1, "bedroom", "off"),
      light("light.b", 2),
    ],
  ])
    assert.ok(groupEvents(events).every((item) => item.type === "event"));
});

test("Live calendar range advances at home midnight across DST", () => {
  const before = rangeForPeriod(
    "Live",
    "Europe/Paris",
    "",
    "",
    new Date("2026-03-28T22:59:59Z"),
  );
  const after = rangeForPeriod(
    "Live",
    "Europe/Paris",
    "",
    "",
    new Date("2026-03-28T23:00:00Z"),
  );
  assert.equal(before.end, after.start);
  assert.equal((Date.parse(after.end) - Date.parse(after.start)) / 3600000, 23);
  assert.ok("2026-03-28T23:00:01.000Z" >= after.start);
  assert.ok("2026-03-28T23:00:01.000Z" < after.end);
});

test("Today keeps a stable home-day range as polling advances", () => {
  const early = rangeForPeriod(
    "Today",
    "Europe/Paris",
    "",
    "",
    new Date("2026-10-25T08:00:00Z"),
  );
  const later = rangeForPeriod(
    "Today",
    "Europe/Paris",
    "",
    "",
    new Date("2026-10-25T16:00:00Z"),
  );
  assert.deepEqual(early, later);
  assert.equal(early.start, "2026-10-24T22:00:00.000Z");
  assert.equal(early.end, "2026-10-25T23:00:00.000Z");
});
