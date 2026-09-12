import { getRuntime } from "@/server/runtime";
import { guard, json, readRange } from "@/server/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = guard(request);
  if (denied) return denied;
  try {
    const { id } = await params;
    if (!/^[a-z_]+\.[a-z0-9_]+$/.test(id))
      return json({ error: "Invalid entity." }, 400);
    const range = readRange(request);
    const home = getRuntime();
    await home.ensureHistory(range.start, range.end);
    const snapshot = home.snapshot(range.start, range.end, undefined, {
      entity: id,
      debug: true,
    });
    return json({
      state: snapshot.states.find((s) => s.entity_id === id),
      metadata: snapshot.metadata[id],
      events: snapshot.events.filter((e) => e.entityId === id),
      coverage: snapshot.coverage,
    });
  } catch {
    return json({ error: "Entity history is unavailable." }, 400);
  }
}
