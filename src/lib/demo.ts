import { interpret, observationId } from "./engine";
import type { HAState, Metadata, Observation, Snapshot } from "./types";
export function createDemo(now = new Date()): Snapshot {
  const room = (id: string, name: string) => ({ id, name });
  const living = room("living", "Living room"),
    hall = room("hall", "Hallway"),
    bed = room("bed", "Bedroom"),
    outside = room("outside", "Outside");
  const metadata: Metadata = {
    "person.kevin": { name: "Kevin" },
    "person.maia": { name: "Maia" },
    "binary_sensor.front_door": { name: "Front door", room: hall },
    "binary_sensor.hall_motion": { name: "Hallway motion", room: hall },
    "light.hallway": { name: "Hallway lights", room: hall },
    "light.living": { name: "Living room lights", room: living },
    "media_player.tv": {
      name: "Living room TV",
      room: living,
      device: { id: "tv", name: "Apple TV" },
    },
    "lock.front_door": { name: "Front door", room: hall },
    "climate.living": { name: "Living room", room: living },
    "sensor.bedroom_temperature": { name: "Bedroom temperature", room: bed },
    "sensor.garden": { name: "Garden sensor", room: outside },
    "automation.hallway_presence": { name: "Hallway Presence", room: hall },
    "automation.evening": { name: "Evening lights", room: living },
  };
  const observations: Observation[] = [];
  const states = new Map<string, HAState>();
  const time = (minutes: number) =>
    new Date(now.getTime() - minutes * 60000).toISOString();
  function event(
    entity_id: string,
    minutes: number,
    previous: string,
    current: string,
    attributes: Record<string, unknown> = {},
    previousAttrs: Record<string, unknown> = {},
    contextId?: string,
    parent?: string,
  ) {
    const timestamp = time(minutes);
    const context = contextId
      ? { id: contextId, parent_id: parent || null }
      : undefined;
    const base = {
      entity_id,
      attributes: { friendly_name: metadata[entity_id]?.name, ...attributes },
      last_changed: timestamp,
      last_updated: timestamp,
      context,
    };
    const next = { ...base, state: current };
    const old = {
      ...base,
      state: previous,
      attributes: { ...base.attributes, ...previousAttrs },
    };
    const o: Observation = {
      id: observationId(next),
      entityId: entity_id,
      timestamp,
      previous: old,
      current: next,
      context,
      origin: "demo",
      type: "state",
    };
    observations.push(o);
    states.set(entity_id, next);
  }
  function automation(
    id: string,
    minutes: number,
    context: string,
    parent?: string,
  ) {
    const timestamp = time(minutes);
    observations.push({
      id: `automation:${id}:${timestamp}`,
      entityId: id,
      timestamp,
      context: { id: context, parent_id: parent },
      origin: "demo",
      type: "automation",
    });
  }
  event("person.kevin", 660, "home", "not_home");
  event("person.maia", 200, "not_home", "home");
  event("binary_sensor.front_door", 93.5, "off", "on", {
    device_class: "door",
  });
  event(
    "binary_sensor.hall_motion",
    93,
    "off",
    "on",
    { device_class: "motion" },
    {},
    "motion-arrival",
  );
  automation(
    "automation.hallway_presence",
    92.9,
    "automation-arrival",
    "motion-arrival",
  );
  event(
    "light.hallway",
    92.8,
    "off",
    "on",
    { brightness: 180 },
    {},
    "automation-arrival",
  );
  event("person.kevin", 92, "not_home", "home");
  event("binary_sensor.front_door", 91.6, "on", "off", {
    device_class: "door",
  });
  event(
    "climate.living",
    71,
    "heat",
    "heat",
    { temperature: 22, current_temperature: 21.4, hvac_action: "heating" },
    { hvac_action: "idle" },
  );
  event("light.living", 48, "off", "on", { brightness: 204 });
  event("binary_sensor.hall_motion", 38, "off", "on", {
    device_class: "motion",
  });
  event("binary_sensor.hall_motion", 37.2, "on", "off", {
    device_class: "motion",
  });
  event("binary_sensor.hall_motion", 36.6, "off", "on", {
    device_class: "motion",
  });
  event("sensor.garden", 25, "23.1", "unavailable", {
    device_class: "temperature",
  });
  automation("automation.evening", 17, "evening");
  event(
    "light.living",
    8,
    "on",
    "on",
    { brightness: 51 },
    { brightness: 204 },
    "movie",
  );
  event(
    "media_player.tv",
    7.5,
    "idle",
    "playing",
    {
      device_class: "tv",
      media_title: "The Secret Life of Walter Mitty",
      source: "Apple TV",
    },
    {},
    "movie",
  );
  event("lock.front_door", 2, "unlocked", "locked");
  event("sensor.bedroom_temperature", 1, "20.6", "20.7", {
    device_class: "temperature",
    unit_of_measurement: "°C",
  });
  return {
    connection: {
      mode: "demo",
      configured: false,
      managed: false,
      name: "Home",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      history: "ready",
    },
    metadata,
    states: [...states.values()],
    events: interpret(observations, metadata, now.getTime()),
    coverage: { start: time(1440), end: now.toISOString() },
  };
}
