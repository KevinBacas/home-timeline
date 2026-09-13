import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { HomeAssistantAdapter } from "./adapter";
import { ObservationStore } from "./store";
import { interpret, groupEvents } from "../lib/engine";
import { selectTimeline, type TimelineFilters } from "../lib/query";
import { rangeForPeriod } from "../lib/time";
import type {
  Connection,
  HAState,
  Metadata,
  Observation,
  Snapshot,
  HomeStatus,
} from "../lib/types";
export class HomeRuntime {
  private sessionId = randomUUID();
  private readonly events = new EventEmitter();
  private readonly store = new ObservationStore();
  connection: Connection = {
    mode: "demo",
    configured: false,
    managed: false,
    name: "Home",
    timezone: "UTC",
    history: "idle",
  };
  private adapter?: HomeAssistantAdapter;
  private states = new Map<string, HAState>();
  private metadata: Metadata = {};
  private generation = 0;
  private attempt = 0;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private notifyTimer?: ReturnType<typeof setTimeout>;
  private availabilityTimers = new Set<ReturnType<typeof setTimeout>>();
  private retry = 0;
  private credentials?: { url: string; token: string };
  private sequence = 0;
  private replay: { id: number; type: string }[] = [];
  private ranges = new Map<string, { promise: Promise<void>; until: number }>();
  private connecting = false;
  private initialized = false;
  private metadataTimer?: ReturnType<typeof setInterval>;
  constructor() {
    this.events.setMaxListeners(100);
  }
  initialize() {
    if (this.initialized) return;
    this.initialized = true;
    if (process.env.HA_URL && process.env.HA_TOKEN) {
      this.connection.managed = true;
      void this.connect(process.env.HA_URL, process.env.HA_TOKEN, true).catch(
        () => {},
      );
    }
  }
  notify(type = "update") {
    if (this.notifyTimer) return;
    this.notifyTimer = setTimeout(() => {
      this.notifyTimer = undefined;
      const entry = { id: ++this.sequence, type };
      this.replay.push(entry);
      if (this.replay.length > 256) this.replay.shift();
      this.events.emit("update", entry);
    }, 120);
    this.notifyTimer.unref();
  }
  listen(
    callback: (event: { id: number; type: string }) => void,
    lastId?: number,
  ) {
    if (lastId !== undefined) {
      if (
        lastId < (this.replay[0]?.id ?? this.sequence + 1) - 1 ||
        lastId > this.sequence
      )
        callback({ id: this.sequence, type: "resync" });
      else this.replay.filter((e) => e.id > lastId).forEach(callback);
    } else callback({ id: this.sequence, type: "resync" });
    this.events.on("update", callback);
    return () => {
      this.events.off("update", callback);
    };
  }
  private ingest = (o: Observation) => {
    this.store.put(o);
    if (o.current) {
      const old = this.states.get(o.entityId);
      if (!old || old.last_updated <= o.current.last_updated)
        this.states.set(o.entityId, o.current);
      if (!this.metadata[o.entityId])
        this.metadata[o.entityId] = {
          name: String(o.current.attributes.friendly_name || o.entityId),
        };
      if (o.current.state === "unavailable") {
        const timer = setTimeout(() => {
          this.availabilityTimers.delete(timer);
          this.notify();
        }, 61000);
        timer.unref();
        this.availabilityTimers.add(timer);
      }
    }
    this.connection.lastUpdate = new Date().toISOString();
    this.notify();
  };
  async connect(url: string, token: string, managed = false) {
    if (this.connecting)
      throw new Error("A connection attempt is already in progress.");
    this.connecting = true;
    this.reset();
    const generation = this.generation;
    this.credentials = { url, token };
    this.connection = {
      mode: "reconnecting",
      configured: true,
      managed,
      name: "Home",
      timezone: "UTC",
      history: "idle",
      message: "Connecting to Home Assistant…",
    };
    this.notify();
    try {
      await this.open(generation);
    } catch (e) {
      if (generation === this.generation) {
        this.adapter?.disconnect();
        this.credentials = undefined;
        this.connection = {
          ...this.connection,
          mode: "error",
          configured: false,
          message: e instanceof Error ? e.message : "Unable to connect.",
        };
        this.notify();
      }
      throw e;
    } finally {
      this.connecting = false;
    }
  }
  private async open(generation: number) {
    if (!this.credentials || generation !== this.generation) return;
    const { url, token } = this.credentials;
    const attempt = ++this.attempt;
    const adapter = new HomeAssistantAdapter(url, token);
    this.adapter = adapter;
    const parsedConfig = z
      .object({
        location_name: z.string().optional(),
        time_zone: z.string().optional(),
      })
      .safeParse(await adapter.rest("/api/config"));
    if (!parsedConfig.success)
      throw new Error("Home Assistant returned invalid configuration.");
    const config = parsedConfig.data;
    await adapter.connect(
      (o) => {
        if (generation === this.generation && attempt === this.attempt)
          this.ingest(o);
      },
      () => {
        if (generation === this.generation && attempt === this.attempt)
          this.reconnect();
      },
    );
    const states = await adapter.loadCurrent();
    const meta = await adapter.loadMetadata(states);
    if (generation !== this.generation || attempt !== this.attempt) {
      adapter.disconnect();
      return;
    }
    for (const s of states) {
      const old = this.states.get(s.entity_id);
      if (!old || old.last_updated <= s.last_updated)
        this.states.set(s.entity_id, s);
    }
    this.metadata = { ...this.metadata, ...meta.metadata };
    if (this.metadataTimer) clearInterval(this.metadataTimer);
    this.metadataTimer = setInterval(() => {
      void adapter
        .loadMetadata([...this.states.values()])
        .then((result) => {
          if (generation === this.generation) {
            this.metadata = { ...this.metadata, ...result.metadata };
            this.notify();
          }
        })
        .catch(() => {});
    }, 300000);
    this.metadataTimer.unref();
    let zone = config.time_zone || "UTC";
    try {
      new Intl.DateTimeFormat("en", { timeZone: zone });
    } catch {
      zone = "UTC";
    }
    this.connection = {
      ...this.connection,
      mode: "connected",
      name: config.location_name || "Home",
      timezone: zone,
      history: "loading",
      message: meta.partial
        ? "Room metadata is partially unavailable."
        : undefined,
      lastUpdate: new Date().toISOString(),
    };
    this.retry = 0;
    this.notify();
    const end = new Date().toISOString(),
      start = new Date(Date.now() - 7200000).toISOString();
    void this.ensureHistory(start, end)
      .then(() => {
        if (generation === this.generation) {
          const today = rangeForPeriod("Today", zone);
          return this.ensureHistory(today.start, end);
        }
      })
      .catch(() => {});
  }
  private reconnect() {
    if (this.reconnectTimer) return;
    const last = this.connection.lastUpdate;
    this.connection = {
      ...this.connection,
      mode: "reconnecting",
      message:
        "Connection interrupted. Retrying automatically; some non-state events may be missing.",
    };
    this.notify();
    const generation = this.generation;
    const delay =
      Math.min(30000, 1000 * 2 ** this.retry++) +
      Math.floor(Math.random() * 300);
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = undefined;
      this.adapter?.disconnect();
      try {
        await this.open(generation);
        if (last && generation === this.generation)
          await this.ensureHistory(
            new Date(Date.parse(last) - 180000).toISOString(),
            new Date().toISOString(),
            true,
          );
      } catch {
        if (generation === this.generation) this.reconnect();
      }
    }, delay);
    this.reconnectTimer.unref();
  }
  async ensureHistory(start: string, end: string, force = false) {
    if (
      !this.adapter ||
      this.connection.mode !== "connected" ||
      Date.parse(start) >= Date.now()
    )
      return;
    const generation = this.generation;
    const adapter = this.adapter;
    // Bucket requests to avoid repeated fetches on every live notification.
    const from = Math.floor(Date.parse(start) / 3600000) * 3600000,
      to = Math.min(Date.parse(end), Date.now());
    // Closed ranges can be retained for the session; use their exact endpoint
    // so a shorter import never claims coverage for a longer one.
    const closed = Date.parse(end) < Date.now() - 300000;
    const key = closed
      ? `${from}:closed:${to}`
      : `${from}:${Math.ceil(to / 3600000)}`;
    const cached = this.ranges.get(key);
    if (!force && cached && cached.until > Date.now()) return cached.promise;
    const entry = { promise: Promise.resolve(), until: Infinity };
    const task = (async () => {
      this.connection.history = "loading";
      this.notify();
      let failures = 0,
        completed = 0;
      const ids = [...this.states.keys()];
      const jobs: { ids: string[]; start: string; end: string }[] = [];
      for (let t = from; t < to; t += 6 * 3600000)
        for (let i = 0; i < ids.length; i += 40)
          jobs.push({
            ids: ids.slice(i, i + 40),
            start: new Date(t).toISOString(),
            end: new Date(Math.min(t + 6 * 3600000, to)).toISOString(),
          });
      let index = 0;
      const worker = async () => {
        while (index < jobs.length && generation === this.generation) {
          const job = jobs[index++];
          try {
            const observations = await adapter.fetchHistory(
              job.ids,
              job.start,
              job.end,
            );
            if (generation !== this.generation) return;
            for (const o of observations) this.store.put(o);
            completed++;
            this.notify();
          } catch {
            failures++;
          }
        }
      };
      await Promise.all([worker(), worker()]);
      if (generation !== this.generation) return;
      try {
        const automation = await adapter.fetchAutomations(
          new Date(from).toISOString(),
          new Date(to).toISOString(),
        );
        if (generation !== this.generation) return;
        for (const o of automation) {
          const duplicate = this.store
            .query(
              new Date(Date.parse(o.timestamp) - 1000).toISOString(),
              new Date(Date.parse(o.timestamp) + 1000).toISOString(),
            )
            .some((x) => x.type === "automation" && x.entityId === o.entityId);
          if (!duplicate) this.store.put(o);
        }
      } catch {
        failures++;
      }
      this.connection.history = failures
        ? completed
          ? "partial"
          : "unavailable"
        : "ready";
      entry.until = closed && !failures ? Infinity : Date.now() + 300000;
      // Eviction must not invalidate completed range requests: otherwise every
      // browser refresh starts the same oversized import again.
      if (this.store.evictions)
        this.connection.message =
          "Older technical details were trimmed to keep the local cache bounded.";
      this.notify();
    })();
    entry.promise = task;
    this.ranges.set(key, entry);
    if (this.ranges.size > 100)
      this.ranges.delete(this.ranges.keys().next().value!);
    return task;
  }
  evidence(id: string) {
    return this.store.get(id);
  }
  status(): HomeStatus {
    return {
      connection: { ...this.connection, sessionId: this.sessionId },
      states: [...this.states.values()],
      metadata: this.metadata,
    };
  }
  snapshot(
    start: string,
    end: string,
    cursor?: string,
    filters: TimelineFilters = {},
  ): Snapshot {
    const observations = this.store.query(
      new Date(Date.parse(start) - 600000).toISOString(),
      new Date(Date.parse(end) + 180000).toISOString(),
    );
    const normalized = interpret(observations, this.metadata);
    const events = selectTimeline(normalized, {
      start,
      end,
      ...filters,
    }).events.sort(
      (a, b) =>
        b.timestamp.localeCompare(a.timestamp) || a.id.localeCompare(b.id),
    );
    let offset = 0;
    if (cursor) {
      const found = events.findIndex((e) => e.id === cursor);
      offset = found < 0 ? 0 : found + 1;
    }
    let page = events.slice(offset, offset + 2000);
    // Include complete groups at page boundaries; the cursor still advances on base events.
    const baseLast = page.at(-1)?.id;
    const pageIds = new Set(page.map((e) => e.id));
    for (const item of groupEvents(events)) {
      if (
        item.type === "story" &&
        item.story.events.some((e) => pageIds.has(e.id))
      ) {
        for (const e of item.story.events) pageIds.add(e.id);
      }
    }
    page = events.filter((e) => pageIds.has(e.id));
    const counts = new Map<
      string,
      { entityId: string; total: number; hidden: number }
    >();
    for (const e of normalized) {
      const value = counts.get(e.entityId) || {
        entityId: e.entityId,
        total: 0,
        hidden: 0,
      };
      value.total++;
      if (e.suppressed) value.hidden++;
      counts.set(e.entityId, value);
    }
    return {
      ...this.status(),
      events: page,
      hiddenCount: normalized.filter((e) => e.suppressed).length,
      noise: [...counts.values()]
        .sort((a, b) => b.total - a.total)
        .slice(0, 20),
      coverage: { start, end },
      nextCursor: offset + 2000 < events.length ? baseLast : undefined,
    };
  }
  private reset() {
    this.sessionId = randomUUID();
    this.generation++;
    this.adapter?.disconnect();
    this.adapter = undefined;
    this.credentials = undefined;
    if (this.metadataTimer) clearInterval(this.metadataTimer);
    this.states.clear();
    this.metadata = {};
    this.store.clear();
    this.ranges.clear();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    for (const timer of this.availabilityTimers) clearTimeout(timer);
    this.availabilityTimers.clear();
    this.replay = [];
    this.sequence++;
  }
  disconnect() {
    const managed = this.connection.managed;
    this.reset();

    this.connection = {
      mode: "demo",
      configured: false,
      managed,
      name: "Home",
      timezone: "UTC",
      history: "idle",
      message: managed
        ? "Environment connection paused until server restart."
        : undefined,
    };
    this.notify();
  }
}
