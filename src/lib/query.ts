import { groupEvents } from "./engine";
import type { TimelineEvent } from "./types";

export type TimelineFilters = {
  search?: string;
  room?: string;
  person?: string;
  category?: string;
  debug?: boolean;
  entity?: string;
  excluded?: string[];
  domains?: string[];
};
export type TimelineView = TimelineFilters & { start: string; end: string };

// Compile once per query; every caller uses the same visibility policy.
function selection(view: TimelineView) {
  const excluded = new Set(view.excluded);
  const domains = new Set(view.domains);
  const search = view.search?.trim().toLowerCase();
  const start = Date.parse(view.start),
    end = Date.parse(view.end);
  const eligible = (e: TimelineEvent) =>
    (view.debug || !e.suppressed) &&
    !excluded.has(e.entityId) &&
    !domains.has(e.entityId.split(".")[0]);
  const matches = (e: TimelineEvent) =>
    eligible(e) &&
    Date.parse(e.timestamp) >= start &&
    Date.parse(e.timestamp) < end &&
    (!view.entity || e.entityId === view.entity) &&
    (!view.room || e.room?.id === view.room) &&
    (!view.person || e.person?.id === view.person) &&
    (!view.category || e.category === view.category) &&
    (!search ||
      [
        e.title,
        e.description,
        e.entityId,
        e.room?.name,
        e.device?.name,
        e.person?.name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(search));
  return { eligible, matches };
}

/**
 * Select a timeline without losing the context of matching story children.
 * Exclusions and suppression apply before grouping; other filters select stories.
 * Results are newest-first; story children remain chronological. Inputs are not mutated.
 */
export function selectTimeline(events: TimelineEvent[], view: TimelineView) {
  const { eligible, matches } = selection(view);
  const matchingIds = new Set(events.filter(matches).map((e) => e.id));
  const items = groupEvents(events.filter(eligible)).filter((item) =>
    item.type === "event"
      ? matchingIds.has(item.id)
      : item.story.events.some((e) => matchingIds.has(e.id)),
  );
  return {
    items,
    matchingIds,
    events: items
      .flatMap((item) =>
        item.type === "event" ? [item.event] : item.story.events,
      )
      .sort(
        (a, b) =>
          b.timestamp.localeCompare(a.timestamp) || a.id.localeCompare(b.id),
      ),
  };
}

/** Count unseen matching live observations, never backfills or transport updates. */
export function countNewVisibleEvents(
  previous: TimelineEvent[],
  next: TimelineEvent[],
  view: TimelineView,
) {
  const { matches } = selection(view);
  const seen = new Set(previous.filter(matches).map((e) => e.id));
  return new Set(
    next
      .filter(
        (e) =>
          e.observation.origin !== "history" && matches(e) && !seen.has(e.id),
      )
      .map((e) => e.id),
  ).size;
}
