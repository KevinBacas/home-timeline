import { getRuntime } from "@/server/runtime";
import { guard, json, readRange, readFilters } from "@/server/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  try {
    const range = readRange(request);
    const home = getRuntime();
    void home.ensureHistory(range.start, range.end).catch(() => {});
    return json(
      home.snapshot(range.start, range.end, range.cursor, readFilters(request)),
    );
  } catch {
    return json({ error: "Choose a valid range of up to 31 days." }, 400);
  }
}
