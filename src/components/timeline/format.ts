export function timelineFormat(timezone?: string) {
  const time = (stamp: string) =>
    new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: timezone,
    }).format(new Date(stamp));
  const day = (stamp: string) =>
    new Intl.DateTimeFormat("en-US", {
      month: "long",
      day: "numeric",
      timeZone: timezone,
    }).format(new Date(stamp));
  return { time, day };
}
