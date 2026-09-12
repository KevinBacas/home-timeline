import { z } from "zod";
const safeAttributes = new Set([
  "friendly_name",
  "device_class",
  "unit_of_measurement",
  "brightness",
  "temperature",
  "current_temperature",
  "hvac_action",
  "hvac_modes",
  "media_title",
  "media_content_type",
  "source",
  "last_triggered",
  "supported_features",
]);
export function sanitizeAttributes(
  input: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input)
      .filter(
        ([k, v]) =>
          safeAttributes.has(k) &&
          (typeof v === "string" ||
            typeof v === "number" ||
            typeof v === "boolean"),
      )
      .map(([k, v]) => [k, typeof v === "string" ? v.slice(0, 300) : v]),
  );
}
export const stateSchema = z.object({
  entity_id: z.string().regex(/^[a-z_]+\.[a-z0-9_]+$/),
  state: z.string().max(1000),
  attributes: z.record(z.string(), z.unknown()).transform(sanitizeAttributes),
  last_changed: z.string().datetime({ offset: true }),
  last_updated: z.string().datetime({ offset: true }),
  context: z
    .object({
      id: z.string(),
      parent_id: z.string().nullable().optional(),
      user_id: z.string().nullable().optional(),
    })
    .optional(),
});
export function safeUrl(value: string): string {
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error(
      "Enter a valid HTTP or HTTPS Home Assistant URL without credentials.",
    );
  return url.toString().replace(/\/$/, "");
}
export function checkLocalRequest(request: Request) {
  const host = request.headers.get("host") || "";
  if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host))
    throw new Error("Local access only.");
  const origin = request.headers.get("origin");
  if (origin && origin !== `http://${host}` && origin !== `https://${host}`)
    throw new Error("Cross-origin requests are not allowed.");
  if (request.headers.get("sec-fetch-site") === "cross-site")
    throw new Error("Cross-origin requests are not allowed.");
}
