import { createServer } from "node:http";
import { WebSocketServer } from "ws";
export const secret = "SENTINEL_HOME_ASSISTANT_SECRET_123";
const state = {
  entity_id: "light.hallway",
  state: "on",
  attributes: {
    friendly_name: "Hallway lights",
    brightness: 128,
    access_token: secret,
  },
  last_changed: "2026-09-11T12:00:00.000Z",
  last_updated: "2026-09-11T12:00:00.000Z",
};
export async function fixture(
  options: { denyRegistries?: boolean; malformedStates?: boolean } = {},
) {
  const received: string[] = [];
  const server = createServer((req, res) => {
    received.push(req.url!);
    res.setHeader("Content-Type", "application/json");
    if (req.headers.authorization !== `Bearer ${secret}`) {
      res.writeHead(401);
      res.end("{}");
      return;
    }
    if (req.url === "/api/config")
      res.end(
        JSON.stringify({
          location_name: "Test home",
          time_zone: "Europe/Paris",
        }),
      );
    else if (req.url?.startsWith("/api/history"))
      res.end(
        JSON.stringify([
          [
            { ...state, state: "off" },
            { ...state, last_updated: "2026-09-11T12:01:00.000Z" },
          ],
        ]),
      );
    else if (req.url?.startsWith("/api/logbook"))
      res.end(
        JSON.stringify([
          {
            domain: "automation",
            entity_id: "automation.evening",
            when: "2026-09-11T12:00:00Z",
            message: "turned on",
          },
          {
            domain: "automation",
            entity_id: "automation.evening",
            when: "2026-09-11T12:01:00Z",
            message: "triggered by state of light.hallway",
          },
        ]),
      );
    else {
      res.writeHead(404);
      res.end("{}");
    }
  });
  const ws = new WebSocketServer({ server, path: "/api/websocket" });
  const order: string[] = [];
  ws.on("connection", (client) => {
    client.send(JSON.stringify({ type: "auth_required" }));
    client.on("message", (raw) => {
      const msg = JSON.parse(raw.toString());
      order.push(msg.type);
      if (msg.type === "auth") {
        client.send(
          JSON.stringify({
            type: msg.access_token === secret ? "auth_ok" : "auth_invalid",
          }),
        );
        return;
      }
      let result: unknown = null;
      let success = true;
      if (msg.type === "get_states")
        result = options.malformedStates ? [{ bad: true }] : [state];
      if (msg.type === "config/area_registry/list")
        result = [
          { area_id: "hall", name: "Hallway" },
          { area_id: "living", name: "Living room" },
        ];
      if (msg.type === "config/device_registry/list")
        result = [{ id: "lamp", name: "Lamp", area_id: "living" }];
      if (msg.type === "config/entity_registry/list")
        result = [
          { entity_id: "light.hallway", area_id: "hall", device_id: "lamp" },
        ];
      if (options.denyRegistries && msg.type.startsWith("config/"))
        success = false;
      client.send(
        JSON.stringify({ id: msg.id, type: "result", success, result }),
      );
      if (msg.type === "subscribe_events" && msg.event_type === "state_changed")
        client.send(
          JSON.stringify({
            id: msg.id,
            type: "event",
            event: {
              event_type: "state_changed",
              time_fired: state.last_updated,
              data: { old_state: { ...state, state: "off" }, new_state: state },
            },
          }),
        );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  return {
    url: `http://127.0.0.1:${address.port}`,
    order,
    received,
    emit: (event: unknown) => {
      for (const client of ws.clients)
        client.send(JSON.stringify({ type: "event", event }));
    },
    drop: () => {
      for (const client of ws.clients) client.terminate();
    },
    close: async () => {
      for (const client of ws.clients) client.terminate();
      await new Promise<void>((resolve) =>
        ws.close(() => server.close(() => resolve())),
      );
    },
  };
}
