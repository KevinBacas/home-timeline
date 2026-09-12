import { getRuntime } from "@/server/runtime";
import { guard, json } from "@/server/http";
import { safeUrl } from "@/lib/security";
import { z } from "zod";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  return json(getRuntime().connection);
}
export async function POST(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  const home = getRuntime();
  if (process.env.HA_URL && process.env.HA_TOKEN)
    return json(
      {
        error:
          "Connection is managed through .env.local. Update it and restart the server.",
      },
      409,
    );
  try {
    if (!request.headers.get("content-type")?.includes("application/json"))
      return json({ error: "JSON body required." }, 415);
    const body = await request.text();
    if (body.length > 16384) return json({ error: "Request too large." }, 413);
    const parsed = z
      .object({ url: z.string().max(2048), token: z.string().min(1).max(8192) })
      .safeParse(JSON.parse(body));
    if (!parsed.success)
      return json({ error: "Provide a Home Assistant URL and token." }, 400);
    let url;
    try {
      url = safeUrl(parsed.data.url);
    } catch {
      return json(
        {
          error:
            "Enter an HTTP or HTTPS URL without embedded credentials, query, or fragment.",
        },
        400,
      );
    }
    await home.connect(url, parsed.data.token);
    return json(
      home.snapshot(
        new Date(Date.now() - 86400000).toISOString(),
        new Date().toISOString(),
      ),
    );
  } catch {
    return json(
      {
        error:
          home.connection.message ||
          "Could not connect. Check the URL, token, and network access.",
      },
      400,
    );
  }
}
export async function DELETE(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  getRuntime().disconnect();
  return json({ disconnected: true });
}
