/** Disposable local HA simulator for end-to-end verification. Never contacts a real home. */
import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { createDemo } from "../src/lib/demo";
const token = "fixture-only-token";
let demo = createDemo();
let sequence = 0;
const server = createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (req.headers.authorization !== `Bearer ${token}`) {
    res.writeHead(401);
    res.end("{}");
    return;
  }
  const url = new URL(req.url!, "http://localhost");
  if (url.pathname === "/api/config")
    res.end(
      JSON.stringify({
        location_name: "Fixture Home",
        time_zone: "Europe/Paris",
      }),
    );
  else if (url.pathname.startsWith("/api/history/period/")) {
    const ids = url.searchParams.get("filter_entity_id")!.split(",");
    res.end(
      JSON.stringify(
        ids
          .map((id) => {
            const observations = demo.events
              .filter((e) => e.entityId === id && e.observation.current)
              .map((e) => e.observation);
            return observations.length
              ? [
                  observations[0].previous,
                  ...observations.map((o) => o.current),
                ]
              : [];
          })
          .filter((a) => a.length),
      ),
    );
  } else if (url.pathname.startsWith("/api/logbook/"))
    res.end(
      JSON.stringify(
        demo.events
          .filter((e) => e.kind === "automation.started")
          .map((e) => ({
            entity_id: e.entityId,
            domain: "automation",
            when: e.timestamp,
            message: "triggered by fixture",
            context_id: e.observation.context?.id,
          })),
      ),
    );
  else {
    res.writeHead(404);
    res.end("{}");
  }
});
const wss = new WebSocketServer({ server, path: "/api/websocket" });
const subscriptions = new Map<WebSocket, number>();
wss.on("connection", (ws) => {
  ws.send(JSON.stringify({ type: "auth_required" }));
  ws.on("message", (buffer) => {
    const m = JSON.parse(buffer.toString());
    if (m.type === "auth") {
      ws.send(
        JSON.stringify({
          type: m.access_token === token ? "auth_ok" : "auth_invalid",
        }),
      );
      return;
    }
    let result: unknown = null;
    if (m.type === "get_states") result = demo.states;
    if (m.type === "config/area_registry/list")
      result = [
        ...new Map(
          Object.values(demo.metadata)
            .filter((m) => m.room)
            .map((m) => [
              m.room!.id,
              { area_id: m.room!.id, name: m.room!.name },
            ]),
        ).values(),
      ];
    if (m.type === "config/device_registry/list")
      result = [{ id: "tv", name: "Apple TV", area_id: "living" }];
    if (m.type === "config/entity_registry/list")
      result = Object.entries(demo.metadata).map(([entity_id, m]) => ({
        entity_id,
        area_id: m.room?.id,
        device_id: m.device?.id,
      }));
    if (m.type === "subscribe_events" && m.event_type === "state_changed")
      subscriptions.set(ws, m.id);
    ws.send(
      JSON.stringify({
        id: m.id,
        type: m.type === "ping" ? "pong" : "result",
        success: true,
        result,
      }),
    );
  });
  ws.on("close", () => subscriptions.delete(ws));
});
const timer = setInterval(() => {
  const old = demo.states.find((s) => s.entity_id === "lock.front_door")!;
  const timestamp = new Date().toISOString();
  const next = {
    ...old,
    state: sequence++ % 2 ? "locked" : "unlocked",
    last_changed: timestamp,
    last_updated: timestamp,
  };
  demo = {
    ...demo,
    states: demo.states.map((s) => (s.entity_id === next.entity_id ? next : s)),
  };
  for (const [ws, id] of subscriptions)
    if (ws.readyState === WebSocket.OPEN)
      ws.send(
        JSON.stringify({
          id,
          type: "event",
          event: {
            event_type: "state_changed",
            time_fired: timestamp,
            data: { old_state: old, new_state: next },
            context: { id: `fixture-${sequence}` },
          },
        }),
      );
}, 12000);
server.listen(8124, "127.0.0.1", () =>
  console.log("Disposable Home Assistant fixture listening on 127.0.0.1:8124"),
);
function stop() {
  clearInterval(timer);
  for (const ws of wss.clients) ws.terminate();
  wss.close();
  server.close();
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
