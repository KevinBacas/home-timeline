import type { HAState, Metadata } from "./types";
export function homeTemperatureRange(states: HAState[], metadata: Metadata) {
  const candidates = states.filter((s) => {
    const room = metadata[s.entity_id]?.room;
    if (!room || ["unavailable", "unknown"].includes(s.state)) return false;
    const sensor =
      s.entity_id.startsWith("sensor.") &&
      s.attributes.device_class === "temperature";
    const climate =
      s.entity_id.startsWith("climate.") &&
      s.attributes.current_temperature !== undefined;
    if (!sensor && !climate) return false;
    const name = [
      s.entity_id,
      s.attributes.friendly_name,
      room.name,
      metadata[s.entity_id]?.device?.name,
    ]
      .join(" ")
      .replaceAll("_", " ");
    return !/\b(outdoor|outside|garden|soil|plant|water|pool|fridge|freezer|cpu|processor|battery|garage exterior|jardin|extérieur|exterieur|terre|sol|plante|eau|piscine|terrace|terrasse|balcon)\b/i.test(
      name,
    );
  });
  const preferred =
    candidates.find((s) =>
      ["°C", "°F"].includes(String(s.attributes.unit_of_measurement)),
    )?.attributes.unit_of_measurement === "°F"
      ? "°F"
      : "°C";
  const readings = candidates.flatMap((s) => {
    const raw = s.entity_id.startsWith("climate.")
      ? s.attributes.current_temperature
      : s.state;
    if (
      (typeof raw !== "string" && typeof raw !== "number") ||
      String(raw).trim() === ""
    )
      return [];
    const value = Number(raw);
    if (!Number.isFinite(value)) return [];
    const unit =
      s.attributes.unit_of_measurement ??
      (s.entity_id.startsWith("climate.") ? preferred : undefined);
    if (unit !== "°C" && unit !== "°F") return [];
    const converted =
      unit === preferred
        ? value
        : preferred === "°C"
          ? ((value - 32) * 5) / 9
          : (value * 9) / 5 + 32;
    return [{ value: converted, room: metadata[s.entity_id].room!.id }];
  });
  if (!readings.length) return null;
  return {
    min: Math.min(...readings.map((r) => r.value)),
    max: Math.max(...readings.map((r) => r.value)),
    unit: preferred,
    rooms: new Set(readings.map((r) => r.room)).size,
    sensors: readings.length,
  };
}
