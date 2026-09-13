import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
export function rangeForPeriod(
  period: string,
  zone = "UTC",
  start = "",
  end = "",
  now = new Date(),
) {
  const date = formatInTimeZone(now, zone, "yyyy-MM-dd");
  const shift = (day: string, amount: number) => {
    const d = new Date(`${day}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + amount);
    return d.toISOString().slice(0, 10);
  };
  let from = fromZonedTime(`${date}T00:00:00`, zone),
    to = now;
  if (period === "Last 24 hours") from = new Date(now.getTime() - 86400000);
  if (period === "Yesterday") {
    from = fromZonedTime(`${shift(date, -1)}T00:00:00`, zone);
    to = fromZonedTime(`${date}T00:00:00`, zone);
  }
  if (
    period === "Custom range" &&
    /^\d{4}-\d{2}-\d{2}$/.test(start) &&
    /^\d{4}-\d{2}-\d{2}$/.test(end)
  ) {
    from = fromZonedTime(`${start}T00:00:00`, zone);
    to = fromZonedTime(`${shift(end, 1)}T00:00:00`, zone);
  }
  return {
    start: from.toISOString(),
    end:
      period === "Live" || period === "Today"
        ? fromZonedTime(`${shift(date, 1)}T00:00:00`, zone).toISOString()
        : to.toISOString(),
  };
}
