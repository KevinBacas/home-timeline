import test from "node:test";
import assert from "node:assert/strict";
import {
  countNewVisibleEvents,
  selectTimeline,
  type TimelineView,
} from "../src/lib/query";
import { createDemo } from "../src/lib/demo";
const demo = createDemo(new Date("2026-09-11T20:00:00Z"));
const view: TimelineView = {
  start: "2026-09-11T00:00:00Z",
  end: "2026-09-12T00:00:00Z",
  excluded: [],
  domains: [],
};
test("badge ignores hidden updates, history backfills and repeated transport messages", () => {
  const hidden = demo.events.find((e) => e.suppressed)!;
  const visible = demo.events.find((e) => !e.suppressed)!;
  assert.equal(countNewVisibleEvents([], [hidden], view), 0);
  assert.equal(
    countNewVisibleEvents(
      [],
      [
        {
          ...visible,
          observation: { ...visible.observation, origin: "history" },
        },
      ],
      view,
    ),
    0,
  );
  assert.equal(countNewVisibleEvents([visible], [visible], view), 0);
  assert.equal(countNewVisibleEvents([], [visible, visible], view), 1);
  assert.equal(
    countNewVisibleEvents([], [hidden], { ...view, debug: true }),
    1,
  );
});
test("badge respects active filters and exclusions", () => {
  const light = demo.events.find((e) => e.kind === "lighting.on")!;
  assert.equal(
    countNewVisibleEvents([], [light], { ...view, category: "security" }),
    0,
  );
  assert.equal(
    countNewVisibleEvents([], [light], { ...view, excluded: [light.entityId] }),
    0,
  );
  assert.equal(
    countNewVisibleEvents([], [light], { ...view, domains: ["light"] }),
    0,
  );
  assert.equal(
    countNewVisibleEvents([], [light], { ...view, room: "another-room" }),
    0,
  );
  assert.equal(
    countNewVisibleEvents([], [light], { ...view, category: "lighting" }),
    1,
  );
});
test("search queries return story context and match children near midnight", () => {
  const data = createDemo(new Date("2026-09-12T01:32:00Z"));
  const arrival = data.events.find(
    (e) => e.kind === "presence.arrived" && e.person?.name === "Kevin",
  )!;
  const start = new Date(Date.parse(arrival.timestamp) + 1000).toISOString();
  const end = new Date(Date.parse(arrival.timestamp) + 180000).toISOString();
  const selected = selectTimeline(data.events, {
    start,
    end,
    category: "security",
  });
  assert.ok(selected.events.some((e) => e.id === arrival.id));
  assert.ok(selected.events.some((e) => e.category === "security"));
  const searched = selectTimeline(data.events, {
    start: "2026-09-11T00:00:00Z",
    end: "2026-09-13T00:00:00Z",
    search: "Apple TV",
  });
  assert.ok(searched.events.some((e) => e.kind === "lighting.dimmed"));
});

test("selection and badge share trimmed search, entity and exclusion policy", () => {
  const light = demo.events.find((e) => e.kind === "lighting.on")!;
  const query = {
    ...view,
    search: "  " + light.entityId.toUpperCase() + "  ",
    entity: light.entityId,
  };
  const selected = selectTimeline(demo.events, query);
  assert.ok(selected.matchingIds.has(light.id));
  assert.equal(countNewVisibleEvents([], [light], query), 1);
  const excluded = { ...query, excluded: [light.entityId] };
  assert.equal(selectTimeline(demo.events, excluded).items.length, 0);
  assert.equal(countNewVisibleEvents([], [light], excluded), 0);
  assert.equal(
    selectTimeline(demo.events, { ...query, entity: "light.other" }).items
      .length,
    0,
  );
});
test("selection compares instants across timezone offsets and excludes end boundary", () => {
  const event = {
    ...demo.events.find((e) => !e.suppressed)!,
    timestamp: "2026-09-11T12:00:00+02:00",
  };
  assert.equal(
    selectTimeline([event], {
      start: "2026-09-11T10:00:00Z",
      end: "2026-09-11T11:00:00Z",
    }).events.length,
    1,
  );
  assert.equal(
    selectTimeline([event], {
      start: "2026-09-11T09:00:00Z",
      end: "2026-09-11T10:00:00Z",
    }).events.length,
    0,
  );
});
