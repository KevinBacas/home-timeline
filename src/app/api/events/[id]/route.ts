import { getRuntime } from "@/server/runtime";
import { guard, json } from "@/server/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = guard(request);
  if (denied) return denied;
  const { id } = await params;
  const observation = getRuntime().evidence(id);
  return observation
    ? json({ observation })
    : json({ error: "Evidence is no longer in the local cache." }, 404);
}
