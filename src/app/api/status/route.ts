import { getRuntime } from "@/server/runtime";
import { guard, json } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  return json(getRuntime().status());
}
