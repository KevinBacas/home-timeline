import WebSocket from "ws";
import { z } from "zod";
import { stateSchema, safeUrl } from "../lib/security";
import { observationId } from "../lib/engine";
import type { HAState, Metadata, Observation } from "../lib/types";
const contextSchema = z.object({
  id: z.string(),
  parent_id: z.string().nullable().optional(),
  user_id: z.string().nullable().optional(),
});
const eventSchema = z.object({
  event_type: z.string(),
  time_fired: z.string().datetime({ offset: true }),
  context: contextSchema.optional(),
  data: z.record(z.string(), z.unknown()),
});
export function stateObservation(
  current: HAState,
  previous: HAState | undefined,
  origin: Observation["origin"],
): Observation {
  return {
    id: observationId(current),
    entityId: current.entity_id,
    timestamp: current.last_updated,
    previous,
    current,
    context: current.context,
    origin,
    type: "state",
  };
}
export function historyObservations(input: unknown): Observation[] {
  if (!Array.isArray(input)) throw new Error("Invalid history response.");
  const out: Observation[] = [];
  for (const series of input) {
    if (!Array.isArray(series)) continue;
    let previous: HAState | undefined;
    for (const raw of series) {
      const parsed = stateSchema.safeParse(raw);
      if (!parsed.success) continue;
      const current = parsed.data;
      if (previous) out.push(stateObservation(current, previous, "history"));
      previous = current;
    }
  }
  return out;
}
export class HomeAssistantAdapter {
  private socket?: WebSocket;
  private commandId = 0;
  private pending = new Map<
    number,
    {
      resolve: (v: unknown) => void;
      reject: (e: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private stopped = false;
  private abort = new AbortController();
  private heartbeat?: ReturnType<typeof setInterval>;
  private subscription?: (o: Observation) => void;
  private closed?: () => void;
  readonly url: string;
  constructor(
    url: string,
    private token: string,
  ) {
    this.url = safeUrl(url);
  }
  private redact(raw: string) {
    return this.token ? raw.split(this.token).join("[REDACTED]") : raw;
  }
  private historyActive = 0;
  private historyQueue: (() => void)[] = [];
  private async withHistorySlot<T>(work: () => Promise<T>): Promise<T> {
    if (this.historyActive >= 2)
      await new Promise<void>((resolve) => this.historyQueue.push(resolve));
    else this.historyActive++;
    try {
      return await work();
    } finally {
      const next = this.historyQueue.shift();
      if (next) next();
      else this.historyActive--;
    }
  }
  async rest(path: string): Promise<unknown> {
    try {
      const res = await fetch(`${this.url}${path}`, {
        headers: { Authorization: `Bearer ${this.token}` },
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.any([
          this.abort.signal,
          AbortSignal.timeout(15000),
        ]),
      });
      if (res.status === 401 || res.status === 403) throw new Error("AUTH");
      if (!res.ok) throw new Error("HTTP");
      const size = Number(res.headers.get("content-length"));
      if (size > 16 * 1024 * 1024) throw new Error("SIZE");
      const reader = res.body?.getReader();
      if (!reader) throw new Error("BODY");
      let sizeRead = 0;
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        sizeRead += value.length;
        if (sizeRead > 16 * 1024 * 1024) {
          await reader.cancel();
          throw new Error("SIZE");
        }
        chunks.push(value);
      }
      return JSON.parse(this.redact(Buffer.concat(chunks).toString("utf8")));
    } catch (e) {
      if (e instanceof Error && e.message === "AUTH")
        throw new Error(
          "Home Assistant rejected the token. Check its validity and permissions.",
        );
      throw new Error(
        "Home Assistant could not be reached or returned an unsupported response.",
      );
    }
  }
  async connect(onObservation: (o: Observation) => void, onClose: () => void) {
    this.subscription = onObservation;
    this.closed = onClose;
    this.stopped = false;
    await new Promise<void>((resolve, reject) => {
      const socketUrl = new URL(`${this.url}/api/websocket`);
      socketUrl.protocol = socketUrl.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(socketUrl, {
        followRedirects: false,
        handshakeTimeout: 12000,
        maxPayload: 16 * 1024 * 1024,
      });
      this.socket = ws;
      let authenticated = false;
      let settled = false;
      const fail = (message: string) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          reject(new Error(message));
        }
        ws.close();
      };
      const timeout = setTimeout(
        () => fail("Home Assistant connection timed out."),
        15000,
      );
      ws.on("error", () => {
        if (!authenticated)
          fail("Unable to open Home Assistant’s live connection.");
      });
      ws.on("message", (buffer) => {
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(this.redact(buffer.toString()));
        } catch {
          return;
        }
        if (msg.type === "auth_required") {
          ws.send(JSON.stringify({ type: "auth", access_token: this.token }));
          return;
        }
        if (msg.type === "auth_invalid") {
          fail(
            "Home Assistant rejected the token. Check its validity and permissions.",
          );
          return;
        }
        if (msg.type === "auth_ok") {
          authenticated = true;
          settled = true;
          clearTimeout(timeout);
          resolve();
          return;
        }
        if (
          typeof msg.id === "number" &&
          (msg.type === "result" || msg.type === "pong")
        ) {
          const p = this.pending.get(msg.id);
          if (p) {
            clearTimeout(p.timer);
            this.pending.delete(msg.id);
            if (msg.success === false)
              p.reject(new Error("Home Assistant capability unavailable."));
            else p.resolve(msg.result);
          }
          return;
        }
        if (msg.type === "event") {
          const result = eventSchema.safeParse(msg.event);
          if (!result.success) return;
          const event = result.data;
          const d = event.data;
          if (event.event_type === "state_changed") {
            const n = stateSchema.safeParse(d.new_state),
              o = stateSchema.safeParse(d.old_state);
            if (n.success)
              this.subscription?.(
                stateObservation(
                  n.data,
                  o.success ? o.data : undefined,
                  "live",
                ),
              );
          } else if (
            event.event_type === "automation_triggered" &&
            typeof d.entity_id === "string" &&
            /^automation\.[a-z0-9_]+$/.test(d.entity_id)
          ) {
            this.subscription?.({
              id: `automation:${d.entity_id}:${event.time_fired}`,
              entityId: d.entity_id,
              timestamp: event.time_fired,
              context: event.context,
              origin: "live",
              type: "automation",
            });
          }
        }
      });
      ws.on("close", () => {
        clearTimeout(timeout);
        if (!settled) {
          settled = true;
          reject(new Error("Home Assistant closed the connection."));
        }
        for (const p of this.pending.values()) {
          clearTimeout(p.timer);
          p.reject(new Error("Connection interrupted."));
        }
        this.pending.clear();
        if (this.heartbeat) clearInterval(this.heartbeat);
        if (authenticated && !this.stopped) this.closed?.();
      });
    });
    await this.command("subscribe_events", { event_type: "state_changed" });
    await this.command("subscribe_events", {
      event_type: "automation_triggered",
    }).catch(() => {});
    this.heartbeat = setInterval(() => {
      void this.command("ping").catch(() => this.socket?.terminate());
    }, 25000);
    this.heartbeat.unref();
  }
  command(type: string, extra: Record<string, unknown> = {}): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (this.socket?.readyState !== WebSocket.OPEN) {
        reject(new Error("Not connected."));
        return;
      }
      const id = ++this.commandId;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("Home Assistant command timed out."));
      }, 12000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, type, ...extra }));
    });
  }
  async loadCurrent() {
    const value = await this.command("get_states");
    const parsed = z.array(stateSchema).safeParse(value);
    if (!parsed.success)
      throw new Error("Home Assistant returned invalid entity states.");
    return parsed.data;
  }
  async loadMetadata(
    states: HAState[],
  ): Promise<{ metadata: Metadata; partial: boolean }> {
    const results = await Promise.allSettled(
      [
        "config/area_registry/list",
        "config/device_registry/list",
        "config/entity_registry/list",
      ].map((type) => this.command(type)),
    );
    const areaSchema = z.array(
      z.object({ area_id: z.string(), name: z.string() }),
    );
    const deviceSchema = z.array(
      z.object({
        id: z.string(),
        area_id: z.string().nullable().optional(),
        name: z.string().nullable().optional(),
        name_by_user: z.string().nullable().optional(),
      }),
    );
    const entitySchema = z.array(
      z.object({
        entity_id: z.string(),
        area_id: z.string().nullable().optional(),
        device_id: z.string().nullable().optional(),
        name: z.string().nullable().optional(),
      }),
    );
    const value = (i: number) =>
      results[i].status === "fulfilled" ? results[i].value : [];
    const areas = areaSchema.safeParse(value(0)),
      devices = deviceSchema.safeParse(value(1)),
      entities = entitySchema.safeParse(value(2));
    const byArea = new Map(
      (areas.success ? areas.data : []).map((a) => [
        a.area_id,
        { id: a.area_id, name: a.name },
      ]),
    );
    const byDevice = new Map(
      (devices.success ? devices.data : []).map((d) => [d.id, d]),
    );
    const byEntity = new Map(
      (entities.success ? entities.data : []).map((e) => [e.entity_id, e]),
    );
    const metadata: Metadata = {};
    for (const s of states) {
      const e = byEntity.get(s.entity_id),
        d = e?.device_id ? byDevice.get(e.device_id) : undefined;
      const areaId = e?.area_id || d?.area_id;
      metadata[s.entity_id] = {
        name: String(
          s.attributes.friendly_name ||
            e?.name ||
            s.entity_id.split(".")[1].replaceAll("_", " "),
        ),
        room: areaId ? byArea.get(areaId) : undefined,
        device: d
          ? { id: d.id, name: d.name_by_user || d.name || d.id }
          : undefined,
      };
    }
    return {
      metadata,
      partial:
        results.some((r) => r.status === "rejected") ||
        !areas.success ||
        !devices.success ||
        !entities.success,
    };
  }
  async fetchHistory(ids: string[], start: string, end: string) {
    const query = new URLSearchParams({
      filter_entity_id: ids.join(","),
      end_time: end,
      significant_changes_only: "0",
    });
    return this.withHistorySlot(async () =>
      historyObservations(
        await this.rest(
          `/api/history/period/${encodeURIComponent(start)}?${query}`,
        ),
      ),
    );
  }
  async fetchAutomations(start: string, end: string): Promise<Observation[]> {
    const raw = await this.withHistorySlot(() =>
      this.rest(
        `/api/logbook/${encodeURIComponent(start)}?${new URLSearchParams({ end_time: end })}`,
      ),
    );
    if (!Array.isArray(raw)) return [];
    const schema = z.object({
      domain: z.literal("automation"),
      entity_id: z.string().regex(/^automation\.[a-z0-9_]+$/),
      when: z.number().or(z.string()),
      message: z.string().optional(),
      context_id: z.string().optional(),
      context_parent_id: z.string().nullable().optional(),
    });
    return raw.flatMap((value) => {
      const p = schema.safeParse(value);
      if (!p.success) return [];
      const x = p.data;
      if (!x.message || !/^triggered(?: by .*)?$|^started$/i.test(x.message))
        return [];
      const date = new Date(
        typeof x.when === "number" ? x.when * 1000 : x.when,
      );
      if (!Number.isFinite(date.getTime())) return [];
      const timestamp = date.toISOString();
      return [
        {
          id: `automation:${x.entity_id}:${timestamp}`,
          entityId: x.entity_id,
          timestamp,
          type: "automation" as const,
          origin: "history" as const,
          context: x.context_id
            ? { id: x.context_id, parent_id: x.context_parent_id }
            : undefined,
        },
      ];
    });
  }
  disconnect() {
    this.stopped = true;
    this.abort.abort();
    this.token = "";
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.socket?.close();
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error("Disconnected."));
    }
    this.pending.clear();
  }
}
