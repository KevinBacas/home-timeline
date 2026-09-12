import { checkLocalRequest } from "../lib/security";
export function guard(request: Request) {
  try {
    checkLocalRequest(request);
    return null;
  } catch {
    return Response.json(
      { error: "Only same-origin localhost requests are allowed." },
      { status: 403 },
    );
  }
}
export function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
export function readRange(request: Request) {
  const q = new URL(request.url).searchParams;
  const start = q.get("start") || new Date(Date.now() - 86400000).toISOString();
  const end = q.get("end") || new Date().toISOString();
  const s = Date.parse(start),
    e = Date.parse(end);
  if (
    !Number.isFinite(s) ||
    !Number.isFinite(e) ||
    s >= e ||
    e - s > 32 * 86400000
  )
    throw new Error("Choose a valid range of up to 31 days.");
  return {
    start: new Date(s).toISOString(),
    end: new Date(e).toISOString(),
    cursor: q.get("cursor") || undefined,
  };
}

export function readFilters(request: Request) {
  const q = new URL(request.url).searchParams;
  return {
    search: q.get("q")?.slice(0, 200),
    room: q.get("room") || undefined,
    person: q.get("person") || undefined,
    category: q.get("category") || undefined,
    debug: q.get("debug") === "true",
  };
}
