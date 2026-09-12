import { getRuntime } from "@/server/runtime";
import { guard } from "@/server/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  const home = getRuntime();
  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      let stopped = false;
      const send = (text: string) => {
        if (!stopped)
          try {
            controller.enqueue(encoder.encode(text));
          } catch {
            cleanup();
          }
      };
      const last = request.headers.get("last-event-id");
      const unsubscribe = home.listen(
        (event) =>
          send(
            `id: ${event.id}\n${event.type === "resync" ? "event: resync\n" : ""}data: ${JSON.stringify(event)}\n\n`,
          ),
        last !== null && /^\d+$/.test(last) ? Number(last) : undefined,
      );
      const heartbeat = setInterval(() => send(": heartbeat\n\n"), 15000);
      cleanup = () => {
        if (stopped) return;
        stopped = true;
        clearInterval(heartbeat);
        unsubscribe();
        request.signal.removeEventListener("abort", cleanup);
      };
      request.signal.addEventListener("abort", cleanup, { once: true });
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
