import type {
  HAState,
  Metadata,
  Observation,
  Story,
  TimelineEvent,
  TimelineItem,
} from "./types";
export function observationId(state: HAState, type = "state") {
  return `${type}:${state.entity_id}:${state.last_updated}:${state.state}`;
}
const invalid = (s?: string) => !s || ["unknown", "unavailable"].includes(s);
const display = (s: string) => s.replaceAll("_", " ");
export function normalize(o: Observation, metadata: Metadata): TimelineEvent {
  const next = o.current,
    old = o.previous,
    domain = o.entityId.split(".")[0];
  const name =
    metadata[o.entityId]?.name ||
    String(next?.attributes.friendly_name || display(o.entityId.split(".")[1]));
  const e: TimelineEvent = {
    id: o.id,
    version: 1,
    kind: "state",
    timestamp: o.timestamp,
    entityId: o.entityId,
    title: `${name} changed`,
    category: "device",
    importance: "normal",
    observation: o,
    ...metadata[o.entityId],
  };
  const set = (
    kind: string,
    title: string,
    category: TimelineEvent["category"],
  ) => Object.assign(e, { kind, title, category });
  if (o.type === "automation") {
    set("automation.started", `${name} automation started`, "automation");
    return e;
  }
  if (!next || !old) {
    e.suppressed = "Initial or removed state";
    return e;
  }
  const n = next.state,
    p = old.state,
    a = next.attributes,
    b = old.attributes,
    changed = n !== p;
  if (n === "unavailable") {
    set("device.unavailable", `${name} became unavailable`, "device");
    e.importance = "important";
    return e;
  }
  if (p === "unavailable" && !invalid(n)) {
    set("device.recovered", `${name} is available again`, "device");
    return e;
  }
  if (invalid(n) || invalid(p)) {
    e.suppressed = "Unknown state is not a physical transition";
    return e;
  }
  if (domain === "person" && changed) {
    set(
      n === "home"
        ? "presence.arrived"
        : p === "home"
          ? "presence.left"
          : "presence.zone",
      n === "home"
        ? `${name} arrived home`
        : p === "home"
          ? `${name} left home`
          : `${name} ${n === "not_home" ? "left their zone" : `arrived at ${display(n)}`}`,
      "presence",
    );
    e.person = { id: o.entityId, name };
    e.importance = "important";
  } else if (
    domain === "binary_sensor" &&
    ["door", "window", "opening", "garage_door"].includes(
      String(a.device_class),
    ) &&
    changed
  ) {
    set(
      "security.opening",
      `${name} ${n === "on" ? "opened" : "closed"}`,
      "security",
    );
  } else if (
    domain === "binary_sensor" &&
    ["motion", "occupancy", "presence"].includes(String(a.device_class))
  ) {
    set(
      "motion.detected",
      `Motion detected${e.room ? ` in the ${e.room.name.toLowerCase()}` : ` · ${name}`}`,
      "motion",
    );
    if (!changed || n !== "on") e.suppressed = "Motion clearing is hidden";
  } else if (["lock", "alarm_control_panel"].includes(domain) && changed) {
    set("security.state", `${name} ${display(n)}`, "security");
    if (n === "triggered") e.importance = "critical";
  } else if (domain === "light") {
    e.category = "lighting";
    const brightness =
      typeof a.brightness === "number"
        ? Math.round((a.brightness / 255) * 100)
        : undefined;
    if (changed)
      set(
        n === "on" ? "lighting.on" : "lighting.off",
        `${name} turned ${n}`,
        "lighting",
      );
    else if (
      n === "on" &&
      typeof a.brightness === "number" &&
      typeof b.brightness === "number" &&
      Math.abs(a.brightness - b.brightness) / 255 >= 0.1
    )
      set(
        a.brightness < b.brightness ? "lighting.dimmed" : "lighting.brightened",
        `${name} ${a.brightness < b.brightness ? "dimmed" : "brightened"}`,
        "lighting",
      );
    else e.suppressed = "Insignificant lighting update";
    if (n === "on" && brightness !== undefined)
      e.description = `Brightness ${brightness}%`;
  } else if (domain === "climate") {
    e.category = "climate";
    if (changed) set("climate.mode", `${name} set to ${display(n)}`, "climate");
    else if (a.temperature !== b.temperature && a.temperature !== undefined)
      set(
        "climate.target",
        `${name} target set to ${a.temperature}°`,
        "climate",
      );
    else if (a.hvac_action !== b.hvac_action && a.hvac_action)
      set(
        "climate.action",
        `${name} ${display(String(a.hvac_action))}`,
        "climate",
      );
    else e.suppressed = "Routine climate measurement";
  } else if (domain === "media_player" && changed) {
    set(
      n === "playing" ? "media.playing" : "media.state",
      `${name} ${n === "playing" ? "started playing" : n === "paused" ? "paused" : n === "off" ? "turned off" : n === "on" ? "turned on" : "stopped playing"}`,
      "media",
    );
    if (n === "playing" && a.media_title) e.description = String(a.media_title);
  } else {
    e.suppressed =
      domain === "sensor"
        ? "Routine sensor measurement"
        : "Technical state update";
  }
  return e;
}
export function interpret(
  observations: Observation[],
  metadata: Metadata,
  now = Date.now(),
): TimelineEvent[] {
  const sorted = [...new Map(observations.map((o) => [o.id, o])).values()].sort(
    (a, b) => a.timestamp.localeCompare(b.timestamp),
  );
  const events = sorted.map((o) => normalize(o, metadata));
  const unavailable = new Map<string, TimelineEvent>();
  for (const e of events) {
    if (e.kind === "device.unavailable") unavailable.set(e.entityId, e);
    else if (e.kind === "device.recovered") {
      const start = unavailable.get(e.entityId);
      if (
        start &&
        Date.parse(e.timestamp) - Date.parse(start.timestamp) < 60000
      ) {
        start.suppressed = "Brief availability interruption";
        e.suppressed = "Brief availability interruption";
      }
      unavailable.delete(e.entityId);
    }
  }
  for (const e of unavailable.values())
    if (now - Date.parse(e.timestamp) < 60000)
      e.suppressed = "Waiting for sustained unavailability";
  const byContext = new Map<string, TimelineEvent[]>();
  for (const e of events) {
    const id = e.observation.context?.id;
    if (id) byContext.set(id, [...(byContext.get(id) || []), e]);
  }
  for (const e of events) {
    const c = e.observation.context;
    if (!c) continue;
    const linked = [
      ...(byContext.get(c.id) || []),
      ...(c.parent_id ? byContext.get(c.parent_id) || [] : []),
    ].filter((x) => x.id !== e.id);
    const automations = linked.filter((x) => x.kind === "automation.started");
    e.related = (automations.length === 1 ? automations : linked)
      .slice(0, 10)
      .map((x) => ({
        eventId: x.id,
        title: x.title,
        relationship: automations.length === 1 ? "automation" : "context",
      }));
  }
  // Brightness changes within a short adjustment burst retain their source evidence.
  const brightness = new Map<string, TimelineEvent>();
  for (const e of events)
    if (
      ["lighting.dimmed", "lighting.brightened"].includes(e.kind) &&
      !e.suppressed
    ) {
      const prev = brightness.get(e.entityId);
      if (prev && Date.parse(e.timestamp) - Date.parse(prev.timestamp) <= 2000)
        prev.suppressed = "Merged brightness adjustment";
      brightness.set(e.entityId, e);
    }
  return events;
}
export function groupEvents(events: TimelineEvent[]): TimelineItem[] {
  const sorted = [...events].sort(
    (a, b) =>
      a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id),
  );
  const claimed = new Set<string>();
  const stories: Story[] = [];
  const near = (a: TimelineEvent, b: TimelineEvent, ms = 120000) =>
    Math.abs(Date.parse(a.timestamp) - Date.parse(b.timestamp)) <= ms;
  const add = (
    anchor: TimelineEvent,
    members: TimelineEvent[],
    rule: Story["rule"],
    title: string,
    description: string,
  ) => {
    members = members.filter((e) => !claimed.has(e.id));
    if (members.length < 2) return;
    members.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    members.forEach((e) => claimed.add(e.id));
    stories.push({
      id: `story:${rule}:${anchor.id}`,
      rule,
      title,
      timestamp: anchor.timestamp,
      end: members.at(-1)!.timestamp,
      events: members,
      description,
    });
  };
  for (const anchor of sorted.filter(
    (e) =>
      e.kind === "media.playing" &&
      e.room &&
      e.observation.current?.attributes.device_class === "tv",
  )) {
    const lights = sorted.filter(
      (e) =>
        e.room?.id === anchor.room?.id &&
        ["lighting.dimmed", "lighting.off"].includes(e.kind) &&
        near(anchor, e),
    );
    if (lights.length)
      add(
        anchor,
        [anchor, ...lights],
        "movie",
        "Movie time",
        `${anchor.room!.name} settled in for the evening`,
      );
  }
  for (const anchor of sorted.filter((e) => e.kind === "presence.arrived"))
    add(
      anchor,
      [
        anchor,
        ...sorted.filter(
          (e) =>
            ["security.opening", "motion.detected", "lighting.on"].includes(
              e.kind,
            ) && near(anchor, e),
        ),
      ],
      "arrival",
      anchor.title,
      "A few little moments, one welcome home",
    );
  // Keep larger arrival/movie stories intact. Group distinct lights only;
  // repeated toggles and unknown rooms must remain individually inspectable.
  for (const anchor of sorted.filter(
    (e) => e.kind === "lighting.on" && e.room && !e.suppressed,
  )) {
    if (claimed.has(anchor.id)) continue;
    const members = [anchor];
    const entities = new Set([anchor.entityId]);
    for (const e of sorted) {
      if (e.timestamp < anchor.timestamp || !near(anchor, e, 30000)) continue;
      if (e.room?.id !== anchor.room!.id || e.suppressed) continue;
      // Do not describe a sequence crossing an off transition as one turn-on.
      if (e.kind === "lighting.off") break;
      if (
        e.kind !== "lighting.on" ||
        claimed.has(e.id) ||
        entities.has(e.entityId)
      )
        continue;
      members.push(e);
      entities.add(e.entityId);
    }
    add(
      anchor,
      members,
      "lighting",
      `${anchor.room!.name} lights turned on`,
      `${entities.size} lights · ${anchor.room!.name}`,
    );
  }
  for (const anchor of sorted.filter(
    (e) => e.kind === "motion.detected" && !claimed.has(e.id),
  )) {
    if (claimed.has(anchor.id)) continue;
    const members = [anchor];
    for (const e of sorted) {
      if (
        e.id === anchor.id ||
        claimed.has(e.id) ||
        e.kind !== "motion.detected"
      )
        continue;
      if (
        (anchor.room
          ? e.room?.id === anchor.room.id
          : e.entityId === anchor.entityId) &&
        e.timestamp > anchor.timestamp &&
        Date.parse(e.timestamp) - Date.parse(members.at(-1)!.timestamp) <=
          120000 &&
        Date.parse(e.timestamp) - Date.parse(anchor.timestamp) <= 600000
      )
        members.push(e);
    }
    add(
      anchor,
      members,
      "activity",
      `Activity${anchor.room ? ` in the ${anchor.room.name.toLowerCase()}` : ""}`,
      "Repeated motion, gathered into one moment",
    );
  }
  return [
    ...stories.map((story) => ({
      type: "story" as const,
      story,
      id: story.id,
      timestamp: story.timestamp,
    })),
    ...sorted
      .filter((e) => !claimed.has(e.id))
      .map((event) => ({
        type: "event" as const,
        event,
        id: event.id,
        timestamp: event.timestamp,
      })),
  ].sort(
    (a, b) =>
      b.timestamp.localeCompare(a.timestamp) || a.id.localeCompare(b.id),
  );
}
